// Convierte los archivos subidos en una cola de trabajo. Se puede repetir sin duplicar.
import { listarNombres } from "@/lib/almacenamiento";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola } from "@/lib/modelo/tipos";
import type { ProcesoDelUsuario } from "./proceso";

const CODIGO_YA_EXISTE = 6; // gRPC ALREADY_EXISTS

export async function iniciarProceso({
  referencia,
  datos,
}: ProcesoDelUsuario): Promise<{ archivos: number }> {
  if (datos.estado === "terminado") return { archivos: datos.totalArchivos };

  const carpeta = `procesos/${referencia.id}`;
  // El almacén puede tener marcadores de carpeta u otros archivos que no son imágenes.
  const nombres = (await listarNombres(carpeta)).filter((nombre) =>
    /\.(png|jpe?g)$/i.test(nombre),
  );
  if (nombres.length === 0) return { archivos: 0 };

  const cola = referencia.collection(COLECCIONES.archivos);
  // Un lote de escritura admite 500 operaciones; BulkWriter reparte las que hagan falta.
  const escritor = baseDeDatos().bulkWriter();
  escritor.onWriteError(
    (error) => error.code !== CODIGO_YA_EXISTE && error.failedAttempts < 5,
  );

  const fallos: unknown[] = [];
  for (const nombre of nombres) {
    const elemento: ArchivoCola = {
      rutaArchivo: `${carpeta}/${nombre}`,
      nombre,
      estado: "pendiente",
      resultado: null,
      clienteNuevo: false,
      clienteExistente: false,
      hashArchivo: null,
      intentos: 0,
      error: null,
      disponibleDesde: 0,
    };
    // create() falla si ya existe: es lo que hace que repetir iniciar no duplique.
    escritor
      .create(cola.doc(nombre), elemento)
      .catch((error: { code?: number }) => {
        if (error.code !== CODIGO_YA_EXISTE) fallos.push(error);
      });
  }
  await escritor.close();
  if (fallos.length > 0) {
    throw new Error(`No se pudieron crear ${fallos.length} elementos de la cola`);
  }

  await referencia.update({ estado: "ejecutando", totalArchivos: nombres.length });
  return { archivos: nombres.length };
}
