// Cola de trabajo en Firestore: sustituye a un gestor de trabajos en memoria,
// que no sobreviviría a una función de corta vida.
import type { DocumentReference } from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola } from "@/lib/modelo/tipos";

export const TAMANO_LOTE = 4;
export const ARRENDAMIENTO_MS = 5 * 60 * 1000;
export const TERMINADO = Number.MAX_SAFE_INTEGER;
export const INTENTOS_MAXIMOS = 3;
// Varias llamadas compiten por los mismos documentos; Firestore repite la que pierde.
export const OPCIONES_TRANSACCION = { maxAttempts: 10 };

export type Reclamado = { referencia: DocumentReference; datos: ArchivoCola };

/**
 * Dentro de una transacción, para que dos llamadas simultáneas nunca tomen el mismo archivo.
 * El arrendamiento caduca solo: si la función se cae, el archivo vuelve a estar disponible.
 */
export function reclamar(proceso: DocumentReference): Promise<Reclamado[]> {
  const ahora = Date.now();
  const consulta = proceso
    .collection(COLECCIONES.archivos)
    .where("disponibleDesde", "<=", ahora)
    .orderBy("disponibleDesde")
    .limit(TAMANO_LOTE);

  return baseDeDatos().runTransaction(async (transaccion) => {
    const resultado = await transaccion.get(consulta);
    return resultado.docs.map((documento) => {
      const previo = documento.data() as ArchivoCola;
      const datos: ArchivoCola = {
        ...previo,
        estado: "procesando",
        intentos: previo.intentos + 1,
        disponibleDesde: ahora + ARRENDAMIENTO_MS,
      };
      transaccion.update(documento.ref, {
        estado: datos.estado,
        intentos: datos.intentos,
        disponibleDesde: datos.disponibleDesde,
      });
      return { referencia: documento.ref, datos };
    });
  }, OPCIONES_TRANSACCION);
}

/** Devuelve un archivo sin procesar (se acabó el tiempo): no cuenta como intento. */
export async function devolver({ referencia, datos }: Reclamado): Promise<void> {
  await referencia.update({
    estado: "pendiente",
    intentos: datos.intentos - 1,
    disponibleDesde: 0,
  });
}

/** Tras un fallo que se puede reintentar: vuelve a la cola con el motivo anotado. */
export async function devolverConError(
  { referencia }: Reclamado,
  error: string,
): Promise<void> {
  await referencia.update({ estado: "pendiente", error, disponibleDesde: 0 });
}
