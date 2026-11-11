// Guarda el resultado de una factura. Todo va en una transacción para que factura,
// índice, cliente y cola queden coherentes aunque dos lotes trabajen a la vez.
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type ArchivoCola,
  type Cliente,
  type Factura,
  type IndiceNumero,
} from "@/lib/modelo/tipos";
import { dvValido } from "@/lib/ocr/nit";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import { OPCIONES_TRANSACCION, TERMINADO } from "./cola";

export type DatosArchivo = {
  referencia: DocumentReference;
  nombre: string;
  rutaArchivo: string;
};
export type DatosProceso = { id: string; uid: string };
export type LecturaAGuardar = {
  datos: ParcialFactura;
  motivos: string[];
  confianza: number;
};
export type ResultadoGuardado = {
  resultado: "aceptada" | "revision" | "duplicada";
  clienteNuevo: boolean;
};

function cierreDeArchivo(
  cambios: Partial<ArchivoCola>,
): Partial<ArchivoCola> {
  return { estado: "ok", error: null, disponibleDesde: TERMINADO, ...cambios };
}

export function guardarFactura(entrada: {
  hash: string;
  proceso: DatosProceso;
  archivo: DatosArchivo;
  lectura: LecturaAGuardar;
}): Promise<ResultadoGuardado> {
  const { hash, proceso, archivo, lectura } = entrada;
  const { datos } = lectura;
  const db = baseDeDatos();

  const refFactura = db.collection(COLECCIONES.facturas).doc(hash);
  const refIndice = datos.numero
    ? db.collection(COLECCIONES.indicesNumero).doc(datos.numero)
    : null;
  // El cliente se identifica por documento, y solo si el documento pasó el dígito de verificación.
  const documentoValido = dvValido(datos.clienteDocumento, datos.clienteDv)
    ? datos.clienteDocumento
    : null;
  const refCliente = documentoValido
    ? db.collection(COLECCIONES.clientes).doc(documentoValido)
    : null;

  return db.runTransaction(async (transaccion) => {
    // Firestore exige todas las lecturas antes de la primera escritura.
    const factura = await transaccion.get(refFactura);
    const indice = refIndice ? await transaccion.get(refIndice) : null;
    const cliente = refCliente ? await transaccion.get(refCliente) : null;

    if (factura.exists) {
      transaccion.update(
        archivo.referencia,
        cierreDeArchivo({ resultado: "duplicada", hashArchivo: hash }),
      );
      return { resultado: "duplicada", clienteNuevo: false };
    }

    const motivos = [...lectura.motivos];
    const hashIndice = indice?.exists
      ? (indice.data() as IndiceNumero).hashArchivo
      : null;
    const numeroOcupado = hashIndice !== null && hashIndice !== hash;
    // Otro archivo con el mismo número puede ser un número mal leído: descartarla perdería una factura.
    if (numeroOcupado) motivos.push(`El número ${datos.numero} ya existe en otra factura`);

    const ahora = Timestamp.now();
    let clienteNuevo = false;
    if (refCliente && documentoValido && cliente && !cliente.exists) {
      const nuevo: Cliente = {
        documento: documentoValido,
        dv: datos.clienteDv ?? "",
        nombre: datos.clienteNombre ?? "",
        creadoEn: ahora,
        primerProcesoId: proceso.id,
      };
      transaccion.create(refCliente, nuevo);
      clienteNuevo = true;
    }

    const resultado = motivos.length === 0 ? "aceptada" : "revision";
    const nuevaFactura: Factura = {
      numero: datos.numero,
      fecha: datos.fecha,
      proveedor: datos.proveedor,
      nitProveedor: datos.nitProveedor,
      clienteDocumento: documentoValido,
      clienteNombre: datos.clienteNombre,
      subtotal: datos.subtotal,
      iva: datos.iva,
      impoconsumo: datos.impoconsumo,
      total: datos.total,
      estado: resultado,
      motivos,
      archivo: archivo.nombre,
      rutaArchivo: archivo.rutaArchivo,
      confianzaOcr: lectura.confianza,
      procesoId: proceso.id,
      uid: proceso.uid,
      creadoEn: ahora,
      items: datos.items,
    };
    transaccion.create(refFactura, nuevaFactura);
    if (refIndice && !numeroOcupado) {
      const nuevoIndice: IndiceNumero = { hashArchivo: hash };
      transaccion.set(refIndice, nuevoIndice);
    }
    transaccion.update(
      archivo.referencia,
      cierreDeArchivo({
        resultado,
        hashArchivo: hash,
        clienteNuevo,
        clienteExistente: Boolean(cliente?.exists),
      }),
    );
    return { resultado, clienteNuevo };
  }, OPCIONES_TRANSACCION);
}

/** Tras agotar los intentos: la factura queda en revisión con el motivo, no se pierde. */
export function guardarFallo(entrada: {
  hash: string;
  proceso: DatosProceso;
  archivo: DatosArchivo;
  motivo: string;
}): Promise<void> {
  const { hash, proceso, archivo, motivo } = entrada;
  const db = baseDeDatos();
  const refFactura = db.collection(COLECCIONES.facturas).doc(hash);

  return db.runTransaction(async (transaccion) => {
    const factura = await transaccion.get(refFactura);
    if (!factura.exists) {
      const nuevaFactura: Factura = {
        numero: null,
        fecha: null,
        proveedor: null,
        nitProveedor: null,
        clienteDocumento: null,
        clienteNombre: null,
        subtotal: null,
        iva: null,
        impoconsumo: null,
        total: null,
        estado: "revision",
        motivos: [motivo],
        archivo: archivo.nombre,
        rutaArchivo: archivo.rutaArchivo,
        confianzaOcr: null,
        procesoId: proceso.id,
        uid: proceso.uid,
        creadoEn: Timestamp.now(),
        items: [],
      };
      transaccion.create(refFactura, nuevaFactura);
    }
    transaccion.update(
      archivo.referencia,
      cierreDeArchivo({
        estado: "error",
        resultado: "error",
        hashArchivo: hash,
        error: motivo,
      }),
    );
  }, OPCIONES_TRANSACCION);
}
