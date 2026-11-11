// Guarda el texto que el OCR saca de una muestra de imágenes, en los tres modos de lectura.
// Ese texto, con sus errores, es el material con el que se escribe y se prueba el extractor.
// Uso: npx tsx scripts/ocr-muestras.ts <imágenes> <salida> [inicio] [paso] [cantidad]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cerrarMotor, leerImagen, type ModoLectura } from "@/lib/ocr/motor";

const MODOS: ModoLectura[] = ["original", "preprocesado", "encabezado"];

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
  try {
    for (const nombre of muestra) {
      const imagen = await readFile(path.join(carpeta, nombre));
      const base = path.parse(nombre).name;
      for (const modo of MODOS) {
        const { texto } = await leerImagen(imagen, modo);
        await writeFile(path.join(salida, `${base}.${modo}.txt`), texto);
      }
      console.log(`${base} listo`);
    }
  } finally {
    await cerrarMotor();
  }
}

void main();
