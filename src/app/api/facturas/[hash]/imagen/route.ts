// Sirve la imagen original desde el almacén privado, solo a quien es dueño de la factura.
import type { NextRequest } from "next/server";
import { descargar } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { detectarTipoImagen } from "@/lib/imagen";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

function noEncontrada(): Response {
  return Response.json({ error: "Imagen no encontrada" }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/facturas/[hash]/imagen">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { hash } = await contexto.params;
  if (!/^[a-f0-9]{64}$/.test(hash)) return noEncontrada();

  const documento = await baseDeDatos()
    .collection(COLECCIONES.facturas)
    .doc(hash)
    .get();
  const factura = documento.data() as Factura | undefined;
  if (!factura || factura.uid !== usuario.uid) return noEncontrada();

  let contenido: Buffer;
  try {
    contenido = await descargar(factura.rutaArchivo);
  } catch {
    return noEncontrada();
  }

  const tipo = detectarTipoImagen(contenido);
  if (!tipo) return noEncontrada();
  return new Response(new Uint8Array(contenido), {
    headers: {
      "content-type": `image/${tipo}`,
      // Impide que el navegador interprete el archivo como otra cosa, como una página con código.
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
