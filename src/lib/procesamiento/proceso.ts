// Acceso a un lote comprobando que pertenece al usuario.
import type { DocumentReference } from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { metricasVacias, type ResumenProceso } from "./metricas";

export type ProcesoDelUsuario = {
  referencia: DocumentReference;
  datos: Proceso;
};

export async function procesoDelUsuario(
  id: string,
  uid: string,
): Promise<ProcesoDelUsuario | null> {
  // El id viene de la URL: una barra apuntaría a otra ruta de Firestore.
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return null;
  const referencia = baseDeDatos().collection(COLECCIONES.procesos).doc(id);
  const documento = await referencia.get();
  const datos = documento.data() as Proceso | undefined;
  if (!datos || datos.uid !== uid) return null;
  return { referencia, datos };
}

export function resumirProceso(id: string, proceso: Proceso): ResumenProceso {
  return {
    id,
    carpeta: proceso.carpeta,
    estado: proceso.estado,
    totalArchivos: proceso.totalArchivos,
    inicio: proceso.inicio.toMillis(),
    fin: proceso.fin?.toMillis() ?? null,
    rutaExcel: proceso.rutaExcel,
    metricas: { ...metricasVacias(), ...proceso.metricas },
  };
}

/** Un lote ajeno responde igual que uno inexistente, para no revelar que existe. */
export function loteNoEncontrado(): Response {
  return Response.json({ error: "Lote no encontrado" }, { status: 404 });
}
