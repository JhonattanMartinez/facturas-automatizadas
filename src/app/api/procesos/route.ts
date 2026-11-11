// Lotes del usuario. Un usuario solo ve lo suyo. La creación de lotes llega en la Fase 3.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const consulta = await baseDeDatos()
    .collection(COLECCIONES.procesos)
    .where("uid", "==", usuario.uid)
    .get();

  const procesos = consulta.docs.map((documento) => {
    const { carpeta, estado, totalArchivos } = documento.data() as Proceso;
    return { id: documento.id, carpeta, estado, totalArchivos };
  });

  return Response.json({ procesos });
}
