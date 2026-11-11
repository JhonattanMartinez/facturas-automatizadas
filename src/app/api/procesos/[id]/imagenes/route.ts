// Recibe y valida UNA imagen por petición. Es el único código que escribe imágenes en el almacén.
import type { NextRequest } from "next/server";
import { subir } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { TAMANO_MAXIMO_BYTES } from "@/lib/imagen";
import { loteAbierto, validarImagen } from "@/lib/procesamiento/subidas";
import { rutaImagen } from "@/lib/rutas";

const TIPOS_DE_CONTENIDO = { png: "image/png", jpeg: "image/jpeg" };

function rechazar(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/imagenes">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  if (!(await loteAbierto(id, usuario.uid))) {
    return rechazar(404, "Lote no encontrado");
  }

  const parametros = request.nextUrl.searchParams;
  const textoIndice = parametros.get("indice") ?? "";
  const indice = Number(textoIndice);
  if (!/^\d{1,4}$/.test(textoIndice) || indice < 1) {
    return rechazar(400, "Índice inválido");
  }
  const nombre = parametros.get("nombre");
  if (!nombre) return rechazar(400, "Falta el nombre del archivo");

  // La cabecera evita leer un cuerpo enorme; los bytes reales se vuelven a medir al validar.
  if (Number(request.headers.get("content-length") ?? 0) > TAMANO_MAXIMO_BYTES) {
    return rechazar(413, "El archivo pasa de 4 MB");
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  const validacion = await validarImagen(bytes);
  if ("error" in validacion) {
    return rechazar(validacion.status, validacion.error);
  }

  const pathname = rutaImagen(id, indice, nombre, validacion.tipo);
  await subir(pathname, bytes, TIPOS_DE_CONTENIDO[validacion.tipo]);
  return Response.json({ pathname });
}
