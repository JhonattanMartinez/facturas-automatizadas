// Borra SOLO los lotes indicados y lo que ellos crearon.
// Uso: npx tsx scripts/limpiar-lotes.ts <idLote> [idLote…]
import { deleteApp } from "firebase-admin/app";
import { appFirebase } from "@/lib/firebase/admin";
import { limpiarLote } from "./comun";

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error("Indica al menos un id de lote");
  for (const id of ids) {
    await limpiarLote(id);
    console.log(`Lote ${id} borrado.`);
  }
  await deleteApp(appFirebase());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
