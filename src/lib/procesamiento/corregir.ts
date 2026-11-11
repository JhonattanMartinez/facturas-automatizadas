// Guarda la revisión de una persona. El servidor no confía en el navegador: valida de nuevo,
// y todo va en una transacción para que factura, índices, cliente y contadores cuadren.
import { Timestamp } from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type Cliente,
  type Factura,
  type IndiceNumero,
} from "@/lib/modelo/tipos";
import { dvValido } from "@/lib/ocr/nit";
import { validar } from "@/lib/ocr/validador";
import { OPCIONES_TRANSACCION } from "./cola";
import { aParcial } from "./correccion";
import { esquemaCorreccion, type DatosCorreccion } from "./correccion-esquema";
import type { FotoCorreccion } from "./metricas";
import { aplicarMetricas } from "./metricas-firestore";

export type RespuestaCorreccion = {
  status: number;
  cuerpo: { ok?: true; error?: string; motivos?: string[] };
};

class ErrorCorreccion extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function fotoDe(f: {
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  nitProveedor: string | null;
  proveedor: string | null;
}): FotoCorreccion {
  return {
    subtotal: f.subtotal ?? 0,
    iva: f.iva ?? 0,
    impoconsumo: f.impoconsumo ?? 0,
    total: f.total ?? 0,
    nit: f.nitProveedor ?? "",
    nombre: f.proveedor ?? "",
  };
}

function guardarEnTransaccion(entrada: {
  hash: string;
  uid: string;
  email: string;
  datos: DatosCorreccion;
  motivos: string[];
}): Promise<void> {
  const { hash, uid, email, datos, motivos } = entrada;
  const db = baseDeDatos();
  const refFactura = db.collection(COLECCIONES.facturas).doc(hash);
  const indices = db.collection(COLECCIONES.indicesNumero);
  const refIndiceNuevo = indices.doc(datos.numero);
  const documentoValido = dvValido(datos.clienteDocumento, datos.clienteDv);
  const refCliente = documentoValido
    ? db.collection(COLECCIONES.clientes).doc(datos.clienteDocumento)
    : null;

  return db.runTransaction(async (transaccion) => {
    // Firestore exige todas las lecturas antes de la primera escritura.
    const instantanea = await transaccion.get(refFactura);
    const factura = instantanea.data() as Factura | undefined;
    if (!factura || factura.uid !== uid) {
      throw new ErrorCorreccion(404, "Factura no encontrada");
    }
    const yaCorregida = Boolean(factura.corregidaManualmente);
    if (factura.estado === "aceptada" && !yaCorregida) {
      throw new ErrorCorreccion(409, "La máquina ya aceptó esta factura");
    }

    const numeroAnterior = factura.numero !== datos.numero ? factura.numero : null;
    const refIndiceAnterior = numeroAnterior ? indices.doc(numeroAnterior) : null;
    const indiceNuevo = await transaccion.get(refIndiceNuevo);
    const indiceAnterior = refIndiceAnterior ? await transaccion.get(refIndiceAnterior) : null;
    const cliente = refCliente ? await transaccion.get(refCliente) : null;

    if (indiceNuevo.exists && (indiceNuevo.data() as IndiceNumero).hashArchivo !== hash) {
      throw new ErrorCorreccion(409, `El número ${datos.numero} ya existe en otra factura`);
    }

    const ahora = Timestamp.now();
    transaccion.set(refIndiceNuevo, { hashArchivo: hash } satisfies IndiceNumero);
    // El número anterior solo se libera si era de esta factura.
    if (
      refIndiceAnterior &&
      indiceAnterior?.exists &&
      (indiceAnterior.data() as IndiceNumero).hashArchivo === hash
    ) {
      transaccion.delete(refIndiceAnterior);
    }

    const clienteNuevo = Boolean(refCliente && cliente && !cliente.exists);
    if (refCliente && clienteNuevo) {
      const nuevo: Cliente = {
        documento: datos.clienteDocumento,
        dv: datos.clienteDv,
        nombre: datos.clienteNombre,
        creadoEn: ahora,
        primerProcesoId: factura.procesoId,
      };
      transaccion.create(refCliente, nuevo);
    }

    const cambios = {
      numero: datos.numero,
      fecha: datos.fecha,
      proveedor: datos.proveedor,
      nitProveedor: datos.nitProveedor,
      dvProveedor: datos.dvProveedor,
      // Un documento que no pasa el dígito de verificación no identifica a ningún cliente.
      clienteDocumento: documentoValido ? datos.clienteDocumento : null,
      clienteDv: datos.clienteDv,
      clienteDocumentoLeido: datos.clienteDocumento,
      clienteNombre: datos.clienteNombre,
      subtotal: datos.subtotal,
      iva: datos.iva,
      impoconsumo: datos.impoconsumo,
      total: datos.total,
      items: datos.items.map((item) => ({
        ...item,
        subtotal: item.cantidad * item.precioUnitario,
      })),
      estado: "aceptada" as const,
      motivos: [],
      corregidaManualmente: true,
      corregidaPor: email,
      corregidaEn: ahora,
      motivosOriginales: yaCorregida ? (factura.motivosOriginales ?? []) : factura.motivos,
      validacionesIgnoradas: motivos,
    };
    transaccion.update(refFactura, cambios);

    aplicarMetricas(
      transaccion,
      db.collection(COLECCIONES.procesos).doc(factura.procesoId),
      {
        tipo: "correccion",
        anterior: yaCorregida ? fotoDe(factura) : null,
        nueva: fotoDe(datos),
        clienteNuevo,
      },
    );
  }, OPCIONES_TRANSACCION);
}

export async function corregirFactura(entrada: {
  hash: string;
  uid: string;
  email: string;
  cuerpo: unknown;
}): Promise<RespuestaCorreccion> {
  const { hash, uid, email, cuerpo } = entrada;

  const leido = esquemaCorreccion.safeParse(cuerpo);
  if (!leido.success) {
    return { status: 400, cuerpo: { error: leido.error.issues[0].message } };
  }

  const motivos = validar(aParcial(leido.data));
  // La persona es la autoridad, porque la factura puede traer una incoherencia real,
  // pero tiene que decirlo: lo que no cuadra no se guarda en silencio.
  if (motivos.length > 0 && !leido.data.confirmarValidaciones) {
    return { status: 422, cuerpo: { error: "Hay validaciones sin confirmar", motivos } };
  }

  try {
    await guardarEnTransaccion({ hash, uid, email, datos: leido.data, motivos });
    return { status: 200, cuerpo: { ok: true } };
  } catch (error) {
    if (error instanceof ErrorCorreccion) {
      return { status: error.status, cuerpo: { error: error.message } };
    }
    throw error;
  }
}
