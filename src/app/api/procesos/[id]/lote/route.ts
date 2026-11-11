import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { procesarLote } from "@/lib/procesamiento/lote";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/lote">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();
  if (proceso.datos.estado !== "ejecutando") {
    return Response.json({ reclamados: 0 });
  }

  return Response.json(await procesarLote(proceso.referencia, usuario.uid));
}
