// Validación de imágenes por sus bytes. Función pura: se puede usar y probar sin servidor.
export type TipoImagen = "png" | "jpeg";

// Vercel rechaza por su cuenta los cuerpos de más de 4,5 MB: este tope da un error propio antes.
export const TAMANO_MAXIMO_BYTES = 4 * 1024 * 1024;
export const PIXELES_MAXIMOS = 40_000_000;

const FIRMAS: [TipoImagen, number[]][] = [
  ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["jpeg", [0xff, 0xd8, 0xff]],
];

// El nombre y el content-type los decide quien envía el archivo; los primeros bytes
// son lo único que describe de verdad su contenido.
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  for (const [tipo, firma] of FIRMAS) {
    if (firma.every((valor, i) => bytes[i] === valor)) return tipo;
  }
  return null;
}
