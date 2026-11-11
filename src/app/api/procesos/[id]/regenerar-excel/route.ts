// El Excel es una foto del momento en que terminó el lote: esto lo rehace con las correcciones.
import type { NextRequest } from "next/server";
import { subir } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { generarExcel, nombreExcel, TIPO_EXCEL } from "@/lib/excel/generar";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/regenerar-excel">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();
  if (proceso.datos.estado !== "terminado") {
    return Response.json({ error: "El lote aún no ha terminado" }, { status: 409 });
  }

  const contenido = await generarExcel(proceso.referencia, proceso.datos);
  const rutaExcel = `procesos/${id}/${nombreExcel(new Date())}`;
  await subir(rutaExcel, contenido, TIPO_EXCEL);
  await proceso.referencia.update({ rutaExcel });
  return Response.json({ ok: true });
}
