// Estado de un lote, con sus cifras en vivo. Cuesta una lectura.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import {
  loteNoEncontrado,
  procesoDelUsuario,
  resumirProceso,
} from "@/lib/procesamiento/proceso";

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  return Response.json(resumirProceso(id, proceso.datos));
}
