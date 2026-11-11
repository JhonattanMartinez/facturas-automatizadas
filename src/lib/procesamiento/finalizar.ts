// Cierra un lote cuando no queda trabajo. Se puede llamar las veces que haga falta.
import { Timestamp } from "firebase-admin/firestore";
import { subir } from "@/lib/almacenamiento";
import { generarExcel, nombreExcel } from "@/lib/excel/generar";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { OPCIONES_TRANSACCION, TERMINADO } from "./cola";
import type { ProcesoDelUsuario } from "./proceso";

const BLOQUEO_MS = 2 * 60 * 1000;
const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function finalizarProceso({
  referencia,
  datos,
}: ProcesoDelUsuario): Promise<{ listo: boolean; pendientes: number }> {
  if (datos.estado === "terminado") return { listo: true, pendientes: 0 };
  if (datos.estado === "subiendo") return { listo: false, pendientes: datos.totalArchivos };

  const conteo = await referencia
    .collection(COLECCIONES.archivos)
    .where("disponibleDesde", "<", TERMINADO)
    .count()
    .get();
  const pendientes = conteo.data().count;
  if (pendientes > 0) return { listo: false, pendientes };

  // Varias llamadas pueden llegar a la vez: solo una toma el cierre.
  const tomado = await baseDeDatos().runTransaction(async (transaccion) => {
    const actual = (await transaccion.get(referencia)).data() as Proceso;
    if (actual.estado === "terminado") return false;
    const ahora = Timestamp.now();
    if (
      actual.finalizandoDesde &&
      ahora.toMillis() - actual.finalizandoDesde.toMillis() < BLOQUEO_MS
    ) {
      return false;
    }
    transaccion.update(referencia, { finalizandoDesde: ahora });
    return true;
  }, OPCIONES_TRANSACCION);

  if (!tomado) {
    const actual = (await referencia.get()).data() as Proceso;
    return { listo: actual.estado === "terminado", pendientes: 0 };
  }

  try {
    const contenido = await generarExcel(referencia, datos);
    const rutaExcel = `procesos/${referencia.id}/${nombreExcel(new Date())}`;
    await subir(rutaExcel, contenido, TIPO_EXCEL);
    await referencia.update({
      estado: "terminado",
      fin: Timestamp.now(),
      rutaExcel,
      finalizandoDesde: null,
    });
  } catch (error) {
    // Se suelta el cierre para que el siguiente intento no espere el bloqueo de 2 minutos.
    await referencia.update({ finalizandoDesde: null });
    throw error;
  }
  return { listo: true, pendientes: 0 };
}
