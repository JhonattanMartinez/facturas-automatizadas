// Reglas del servidor para aceptar una imagen en un lote.
import sharp from "sharp";
import { baseDeDatos } from "@/lib/firebase/admin";
import {
  detectarTipoImagen,
  PIXELES_MAXIMOS,
  TAMANO_MAXIMO_BYTES,
  type TipoImagen,
} from "@/lib/imagen";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";

const VIGENCIA_MS = 20_000;
const confirmados = new Map<string, number>();

/**
 * Una respuesta afirmativa se recuerda 20 s en la memoria de la instancia: sin esto,
 * cada imagen gastaría una lectura de Firestore (1000 lecturas por carpeta).
 * Un lote ajeno y uno inexistente responden igual, para no revelar que existe.
 */
export async function loteAbierto(id: string, uid: string): Promise<boolean> {
  // El id termina en rutas de Firestore y del almacén: una barra saldría de la carpeta.
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return false;

  const clave = `${uid}/${id}`;
  if ((confirmados.get(clave) ?? 0) > Date.now()) return true;

  const documento = await baseDeDatos()
    .collection(COLECCIONES.procesos)
    .doc(id)
    .get();
  const proceso = documento.data() as Proceso | undefined;
  if (proceso?.uid !== uid || proceso.estado !== "subiendo") return false;

  if (confirmados.size > 500) confirmados.clear();
  confirmados.set(clave, Date.now() + VIGENCIA_MS);
  return true;
}

export type Rechazo = { status: number; error: string };

export async function validarImagen(
  bytes: Buffer,
): Promise<{ tipo: TipoImagen } | Rechazo> {
  if (bytes.length > TAMANO_MAXIMO_BYTES) {
    return { status: 413, error: "El archivo pasa de 4 MB" };
  }

  const tipo = detectarTipoImagen(bytes);
  if (!tipo) return { status: 415, error: "El archivo no es una imagen PNG o JPEG" };

  try {
    // Las dimensiones se miran antes de decodificar: una imagen pequeña en
    // bytes puede ocupar gigabytes de memoria al abrirla.
    const { width, height } = await sharp(bytes).metadata();
    if (width * height > PIXELES_MAXIMOS) {
      return { status: 413, error: "La imagen tiene demasiados píxeles" };
    }
    // stats() la decodifica entera: una firma correcta no garantiza que el resto esté sano.
    await sharp(bytes).stats();
  } catch {
    return { status: 415, error: "La imagen está dañada y no se puede leer" };
  }
  return { tipo };
}
