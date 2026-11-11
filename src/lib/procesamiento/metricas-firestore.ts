// Aplica las métricas dentro de la misma escritura que guarda la factura: así los contadores
// siempre cuadran con los datos y abrir el panel no obliga a recorrer miles de facturas.
import {
  FieldPath,
  FieldValue,
  type DocumentReference,
  type Transaction,
  type WriteBatch,
} from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type ArchivoCola,
  type Factura,
  type Metricas,
} from "@/lib/modelo/tipos";
import { cambiosDe, metricasDesdeEventos, type EventoMetricas } from "./metricas";

export function aplicarMetricas(
  escritor: Transaction | WriteBatch,
  proceso: DocumentReference,
  evento: EventoMetricas,
): void {
  // FieldPath y no texto con puntos: el NIT es una clave numérica y un nombre puede llevar puntos.
  // increment es una escritura ciega: no lee el documento, así que no compite entre lotes.
  const pares = cambiosDe(evento).flatMap(([ruta, valor]) => [
    new FieldPath("metricas", ...ruta),
    FieldValue.increment(valor),
  ]);
  const [campo, valor, ...resto] = pares;
  // Transaction y WriteBatch tienen el mismo update, pero TypeScript no une sus sobrecargas.
  (escritor as WriteBatch).update(proceso, campo as FieldPath, valor, ...resto);
}

/** Reconstruye las métricas de un lote recorriendo su cola y sus facturas. Lee mucho: es excepcional. */
export async function recalcularMetricas(proceso: DocumentReference): Promise<Metricas> {
  const db = baseDeDatos();
  const coleccionFacturas = db.collection(COLECCIONES.facturas);
  const cola = (await proceso.collection(COLECCIONES.archivos).get()).docs.map(
    (documento) => documento.data() as ArchivoCola,
  );

  const eventos: EventoMetricas[] = [];
  for (const archivo of cola) {
    if (archivo.resultado === "duplicada") {
      eventos.push({ tipo: "duplicada" });
      continue;
    }
    const factura = archivo.hashArchivo
      ? ((await coleccionFacturas.doc(archivo.hashArchivo).get()).data() as Factura | undefined)
      : undefined;

    if (archivo.resultado === "error") {
      eventos.push({ tipo: "error" });
    } else if (archivo.resultado && factura) {
      const corregida = Boolean(factura.corregidaManualmente);
      eventos.push({
        // Lo que decidió la máquina no cambia aunque luego la haya corregido una persona.
        tipo: archivo.resultado,
        subtotal: factura.subtotal,
        iva: factura.iva,
        impoconsumo: factura.impoconsumo,
        total: factura.total,
        nit: corregida ? null : factura.nitProveedor,
        nombre: factura.proveedor,
        clienteNuevo: archivo.clienteNuevo,
      });
    }

    if (factura?.corregidaManualmente) {
      eventos.push({
        tipo: "correccion",
        anterior: null,
        nueva: {
          subtotal: factura.subtotal ?? 0,
          iva: factura.iva ?? 0,
          impoconsumo: factura.impoconsumo ?? 0,
          total: factura.total ?? 0,
          nit: factura.nitProveedor ?? "",
          nombre: factura.proveedor ?? "",
        },
        clienteNuevo: false, // la cola no guarda si la corrección creó un cliente
      });
    }
  }

  const metricas = metricasDesdeEventos(eventos);
  await proceso.update({ metricas });
  return metricas;
}
