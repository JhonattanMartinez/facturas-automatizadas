import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { iniciarProceso } from "@/lib/procesamiento/iniciar";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/iniciar">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  const { archivos } = await iniciarProceso(proceso);
  if (archivos === 0) {
    return Response.json({ error: "El lote no tiene imágenes" }, { status: 409 });
  }
  return Response.json({ archivos });
}
