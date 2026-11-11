// Reconstruye las métricas de un lote desde su cola y sus facturas.
// Uso: npx tsx scripts/recalcular-metricas.ts <idLote>
import { deleteApp } from "firebase-admin/app";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";
import { recalcularMetricas } from "@/lib/procesamiento/metricas-firestore";

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const id = process.argv[2];
  if (!id) throw new Error("Indica el id del lote");
  const proceso = baseDeDatos().collection(COLECCIONES.procesos).doc(id);
  const { aceptadas, revision, errores, duplicadas } = await recalcularMetricas(proceso);
  console.log(
    `Aceptadas ${aceptadas.n}, revisión ${revision.n}, errores ${errores}, duplicadas ${duplicadas}`,
  );
  await deleteApp(appFirebase());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
