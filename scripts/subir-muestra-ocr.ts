// TEMPORAL (Fase 5): sube 20 facturas a pruebas/fase-5/ para probar el OCR en Vercel.
// Con --borrar elimina únicamente lo que haya en esa carpeta.
// Uso: npx tsx scripts/subir-muestra-ocr.ts <imágenes>   |   npx tsx scripts/subir-muestra-ocr.ts --borrar
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CARPETA = "pruebas/fase-5";
const CANTIDAD = 20;

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const bucket = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from(process.env.SUPABASE_BUCKET_FACTURAS ?? "");

  if (process.argv[2] === "--borrar") {
    const { data, error } = await bucket.list(CARPETA, { limit: 100 });
    if (error) throw new Error(error.message);
    const rutas = data.map((archivo) => `${CARPETA}/${archivo.name}`);
    if (rutas.length > 0) {
      const borrado = await bucket.remove(rutas);
      if (borrado.error) throw new Error(borrado.error.message);
    }
    console.log(`Borrados: ${rutas.length}`);
    return;
  }

  const carpeta = process.argv[2];
  if (!carpeta) throw new Error("Indica la carpeta de imágenes");
  const archivos = (await readdir(carpeta))
    .filter((nombre) => /\.(png|jpe?g)$/i.test(nombre))
    .sort();
  const paso = Math.floor(archivos.length / CANTIDAD);
  // Empieza en 13 para no repetir las muestras con las que se escribió el extractor.
  const muestra = Array.from({ length: CANTIDAD }, (_, i) => archivos[13 + i * paso]);

  for (const nombre of muestra) {
    const { error } = await bucket.upload(
      `${CARPETA}/${nombre}`,
      await readFile(path.join(carpeta, nombre)),
      { contentType: nombre.endsWith(".png") ? "image/png" : "image/jpeg", upsert: true },
    );
    if (error) throw new Error(`${nombre}: ${error.message}`);
  }
  console.log(`Subidas: ${muestra.length} a ${CARPETA}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
