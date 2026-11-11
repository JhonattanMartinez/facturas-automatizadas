import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { finalizarProceso } from "@/lib/procesamiento/finalizar";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/finalizar">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  return Response.json(await finalizarProceso(proceso));
}
