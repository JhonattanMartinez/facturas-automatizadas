// Estado de un lote.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  const { carpeta, estado, totalArchivos, inicio, fin } = proceso.datos;
  return Response.json({
    id,
    carpeta,
    estado,
    totalArchivos,
    inicio: inicio.toMillis(),
    fin: fin?.toMillis() ?? null,
  });
}
