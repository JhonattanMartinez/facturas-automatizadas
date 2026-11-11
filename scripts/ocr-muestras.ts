// Guarda el texto que el OCR saca de una muestra de imágenes, en los tres modos de lectura.
// Ese texto, con sus errores, es el material con el que se escribe y se prueba el extractor.
// Uso: npx tsx scripts/ocr-muestras.ts <imágenes> <salida> [inicio] [paso] [cantidad]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

async function preprocesar(imagen: Buffer): Promise<Buffer> {
  const { width } = await sharp(imagen).metadata();
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
async function encabezadoInvertido(imagen: Buffer): Promise<Buffer> {
  const { width, height } = await sharp(imagen).metadata();
  return sharp(imagen)
    .extract({ left: 0, top: 0, width, height: Math.round(height * 0.3) })
    .negate({ alpha: false })
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  const [carpeta, salida, inicio = "0", paso = "100", cantidad = "10"] =
    process.argv.slice(2);
  if (!carpeta || !salida) {
    console.error("Uso: ocr-muestras <imágenes> <salida> [inicio] [paso] [cantidad]");
    process.exitCode = 1;
    return;
  }

  const archivos = (await readdir(carpeta))
    .filter((nombre) => /\.(png|jpe?g)$/i.test(nombre))
    .sort();
  const muestra = Array.from(
    { length: Number(cantidad) },
    (_, i) => archivos[Number(inicio) + i * Number(paso)],
  ).filter(Boolean);

  await mkdir(salida, { recursive: true });
  const worker = await createWorker("spa", 1, {
    // Los datos del idioma salen del paquete npm: así no hay descargas de red.
    langPath: path.join(
      process.cwd(),
      "node_modules/@tesseract.js-data/spa/4.0.0_best_int",
    ),
    gzip: true,
    cachePath: os.tmpdir(),
    cacheMethod: "none",
  });

  try {
    for (const nombre of muestra) {
      const imagen = await readFile(path.join(carpeta, nombre));
      const base = path.parse(nombre).name;
      const modos: [string, Buffer][] = [
        ["original", imagen],
        ["preprocesado", await preprocesar(imagen)],
        ["encabezado", await encabezadoInvertido(imagen)],
      ];
      for (const [modo, datos] of modos) {
        const { data } = await worker.recognize(datos);
        await writeFile(path.join(salida, `${base}.${modo}.txt`), data.text);
      }
      console.log(`${base} listo`);
    }
  } finally {
    await worker.terminate();
  }
}

void main();
