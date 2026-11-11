// Nombres de archivo dentro del almacén. El nombre llega del navegador: no es de fiar.
import type { TipoImagen } from "./imagen";

const EXTENSIONES: Record<TipoImagen, string> = { png: "png", jpeg: "jpg" };

export function limpiarNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "";
  const limpio = base
    .replace(/\.[^.]*$/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // quita las tildes, que el almacén no admite en las rutas
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return limpio || "archivo";
}

export function rutaImagen(
  procesoId: string,
  indice: number,
  nombre: string,
  tipo: TipoImagen,
): string {
  const numero = String(indice).padStart(4, "0");
  return `procesos/${procesoId}/${numero}-${limpiarNombre(nombre)}.${EXTENSIONES[tipo]}`;
}
