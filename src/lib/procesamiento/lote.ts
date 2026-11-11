// Una tanda de trabajo: reclama unos pocos archivos, los procesa en serie y responde.
import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { descargar } from "@/lib/almacenamiento";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";
import { leerFactura } from "@/lib/ocr/leer-factura";
import {
  devolver,
  devolverConError,
  INTENTOS_MAXIMOS,
  reclamar,
  TERMINADO,
  type Reclamado,
} from "./cola";
import { guardarFactura, guardarFallo, type DatosProceso } from "./guardar";
import { aplicarMetricas } from "./metricas-firestore";

// De los 300 s de la función: deja margen para terminar la factura en curso.
const PRESUPUESTO_MS = 200_000;

export type ResumenLote = {
  reclamados: number;
  aceptadas: number;
  revision: number;
  duplicadas: number;
  errores: number;
  reintentos: number;
  devueltos: number;
  ms: number;
};

const sha256 = (contenido: Buffer | string): string =>
  createHash("sha256").update(contenido).digest("hex");

type Desenlace = "aceptada" | "revision" | "duplicada" | "error" | "reintento";

async function procesarArchivo(
  reclamado: Reclamado,
  proceso: DatosProceso,
): Promise<Desenlace> {
  const { referencia, datos } = reclamado;
  const archivo = { referencia, nombre: datos.nombre, rutaArchivo: datos.rutaArchivo };
  // Sin imagen no hay hash: la ruta da un id estable para no perder el registro del fallo.
  let hash = sha256(`sin-imagen:${datos.rutaArchivo}`);

  try {
    // Un archivo que tumba la función nunca llega al catch: se corta aquí.
    if (datos.intentos > INTENTOS_MAXIMOS) {
      throw new Error("Se agotaron los intentos de lectura");
    }

    const imagen = await descargar(datos.rutaArchivo);
    hash = sha256(imagen);

    // Atajo: una lectura en vez de varios segundos de OCR al reprocesar una carpeta.
    const existente = await baseDeDatos()
      .collection(COLECCIONES.facturas)
      .doc(hash)
      .get();
    if (existente.exists) {
      const db = baseDeDatos();
      // En un lote de escritura: el archivo y su contador se guardan juntos o no se guardan.
      const escritura = db.batch();
      escritura.update(referencia, {
        estado: "ok",
        resultado: "duplicada",
        hashArchivo: hash,
        error: null,
        disponibleDesde: TERMINADO,
      });
      aplicarMetricas(escritura, db.collection(COLECCIONES.procesos).doc(proceso.id), {
        tipo: "duplicada",
      });
      await escritura.commit();
      return "duplicada";
    }

    const lectura = await leerFactura(imagen);
    const { resultado } = await guardarFactura({ hash, proceso, archivo, lectura });
    return resultado;
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : "Error desconocido";
    if (datos.intentos < INTENTOS_MAXIMOS) {
      await devolverConError(reclamado, motivo);
      return "reintento";
    }
    await guardarFallo({ hash, proceso, archivo, motivo });
    return "error";
  }
}

export async function procesarLote(
  referencia: DocumentReference,
  uid: string,
): Promise<ResumenLote> {
  const inicio = Date.now();
  const reclamados = await reclamar(referencia);
  const proceso = { id: referencia.id, uid };
  const resumen: ResumenLote = {
    reclamados: reclamados.length,
    aceptadas: 0,
    revision: 0,
    duplicadas: 0,
    errores: 0,
    reintentos: 0,
    devueltos: 0,
    ms: 0,
  };

  for (const reclamado of reclamados) {
    if (Date.now() - inicio > PRESUPUESTO_MS) {
      await devolver(reclamado);
      resumen.devueltos++;
      continue;
    }
    const desenlace = await procesarArchivo(reclamado, proceso);
    if (desenlace === "aceptada") resumen.aceptadas++;
    else if (desenlace === "revision") resumen.revision++;
    else if (desenlace === "duplicada") resumen.duplicadas++;
    else if (desenlace === "error") resumen.errores++;
    else resumen.reintentos++;
  }

  resumen.ms = Date.now() - inicio;
  return resumen;
}
