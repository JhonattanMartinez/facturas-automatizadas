// El almacén es privado: esta ruta lee el Excel y lo entrega a su dueño como descarga.
import type { NextRequest } from "next/server";
import { descargar } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/excel">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  const ruta = proceso.datos.rutaExcel;
  if (!ruta) {
    return Response.json({ error: "El Excel de este lote aún no existe" }, { status: 404 });
  }

  const contenido = await descargar(ruta);
  return new Response(new Uint8Array(contenido), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${ruta.split("/").pop()}"`,
    },
  });
}
