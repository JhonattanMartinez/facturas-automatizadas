// Métricas de todos los lotes del usuario. Cuesta 1 lectura por lote + 1 del conteo de clientes.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { resumirProceso } from "@/lib/procesamiento/proceso";

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const db = baseDeDatos();
  const [lotes, clientes] = await Promise.all([
    db.collection(COLECCIONES.procesos).where("uid", "==", usuario.uid).get(),
    db.collection(COLECCIONES.clientes).count().get(),
  ]);

  const procesos = lotes.docs
    .map((documento) => resumirProceso(documento.id, documento.data() as Proceso))
    .sort((a, b) => a.inicio - b.inicio);

  return Response.json({ procesos, clientes: clientes.data().count });
}
