// Motor de OCR. La imagen llega como Buffer descargado del almacén, nunca del disco.
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

export type ModoLectura = "original" | "preprocesado" | "encabezado";
export type LecturaOcr = { texto: string; confianza: number };

const TOPE_MS = 60_000;

// En globalThis para reutilizarlo entre invocaciones de una misma instancia caliente:
// arrancar el worker tarda varios segundos.
const almacen = globalThis as typeof globalThis & {
  workerOcr?: Promise<Worker>;
};

// El worker corre en otro hilo: si no puede cargar un archivo, el hilo muere en silencio
// y la promesa nunca se resuelve. Sin tope, la función se colgaría hasta dar 504.
function conTope<T>(promesa: Promise<T>, etapa: string): Promise<T> {
  let temporizador: NodeJS.Timeout;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`El OCR no respondió en ${TOPE_MS / 1000} s (${etapa})`)),
      TOPE_MS,
    );
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

// Tras un fallo el worker no es confiable: el siguiente intento arranca uno nuevo.
function descartarWorker(): void {
  const anterior = almacen.workerOcr;
  almacen.workerOcr = undefined;
  void anterior?.then((worker) => worker.terminate()).catch(() => undefined);
}

async function obtenerWorker(): Promise<Worker> {
  almacen.workerOcr ??= conTope(
    createWorker("spa", 1, {
      // Los datos del idioma salen del paquete npm: así no hay descargas de red.
      langPath: path.join(
        process.cwd(),
        "node_modules/@tesseract.js-data/spa/4.0.0_best_int",
      ),
      gzip: true,
      cachePath: os.tmpdir(), // en Vercel, /tmp es el único sitio donde se puede escribir
      cacheMethod: "none",
    }),
    "arranque",
  );
  try {
    return await almacen.workerOcr;
  } catch (error) {
    descartarWorker();
    throw error;
  }
}

export async function prepararImagen(
  imagen: Buffer,
  modo: ModoLectura,
): Promise<Buffer> {
  if (modo === "original") return imagen;

  const { width, height } = await sharp(imagen).metadata();
  if (modo === "preprocesado") {
    return sharp(imagen)
      .rotate() // respeta la orientación EXIF
      .grayscale()
      .normalize()
      .resize({ width: Math.round(width * 1.5) })
      .sharpen()
      .png()
      .toBuffer();
  }
  // Un diseño lleva texto blanco sobre fondo de color: invertido, el OCR sí lo lee.
  return sharp(imagen)
    .extract({ left: 0, top: 0, width, height: Math.round(height * 0.3) })
    .negate({ alpha: false })
    .png()
    .toBuffer();
}

export async function leerImagen(
  imagen: Buffer,
  modo: ModoLectura,
): Promise<LecturaOcr> {
  const preparada = await prepararImagen(imagen, modo);
  const worker = await obtenerWorker();
  try {
    const { data } = await conTope(worker.recognize(preparada), "lectura");
    return { texto: data.text, confianza: data.confidence };
  } catch (error) {
    descartarWorker();
    throw error;
  }
}

/** Solo para scripts: una función de Vercel conserva el worker para la siguiente invocación. */
export async function cerrarMotor(): Promise<void> {
  const actual = almacen.workerOcr;
  almacen.workerOcr = undefined;
  if (actual) await (await actual).terminate();
}
