// Lotes del usuario. Un usuario solo ve lo suyo.
import { Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Proceso } from "@/lib/modelo/tipos";
import { resumirProceso } from "@/lib/procesamiento/proceso";

const esquemaNuevoLote = z.object({
  carpeta: z.string().min(1).max(200),
  totalArchivos: z.number().int().min(1).max(5000),
});

export async function POST(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const cuerpo: unknown = await request.json().catch(() => null);
  const entrada = esquemaNuevoLote.safeParse(cuerpo);
  if (!entrada.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }

  const proceso: Proceso = {
    ...entrada.data,
    uid: usuario.uid,
    estado: "subiendo",
    inicio: Timestamp.now(),
    fin: null,
    rutaExcel: null,
    finalizandoDesde: null,
  };
  const documento = await baseDeDatos()
    .collection(COLECCIONES.procesos)
    .add(proceso);

  return Response.json({ id: documento.id }, { status: 201 });
}

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  // El motor pide ?estado=ejecutando para retomar los lotes que quedaron a medias.
  const estado = request.nextUrl.searchParams.get("estado");
  let consulta = baseDeDatos()
    .collection(COLECCIONES.procesos)
    .where("uid", "==", usuario.uid);
  if (estado) consulta = consulta.where("estado", "==", estado);

  const resultado = await consulta.get();
  const procesos = resultado.docs.map((documento) =>
    resumirProceso(documento.id, documento.data() as Proceso),
  );

  return Response.json({ procesos });
}
