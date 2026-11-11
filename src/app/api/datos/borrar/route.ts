// «Borrar todo»: vacía Firestore y el almacén, de todos los usuarios. Es irreversible.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { vaciarAlmacen } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

export const maxDuration = 300;

const esquema = z.object({
  confirmacion: z.literal("BORRAR"),
  forzar: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const cuerpo: unknown = await request.json().catch(() => null);
  const entrada = esquema.safeParse(cuerpo);
  if (!entrada.success) {
    return Response.json({ error: "Falta la confirmación" }, { status: 400 });
  }

  const db = baseDeDatos();
  if (!entrada.data.forzar) {
    const activos = await db
      .collection(COLECCIONES.procesos)
      .where("estado", "==", "ejecutando")
      .limit(1)
      .get();
    if (!activos.empty) {
      return Response.json(
        { error: "Hay lotes procesándose", hayActivos: true },
        { status: 409 },
      );
    }
  }

  // Los lotes primero: así el motor recibe 404 y deja de trabajar sobre ellos.
  for (const coleccion of [
    COLECCIONES.procesos,
    COLECCIONES.facturas,
    COLECCIONES.indicesNumero,
    COLECCIONES.clientes,
  ]) {
    // recursiveDelete también borra las subcolecciones, como la cola de cada lote.
    await db.recursiveDelete(db.collection(coleccion));
  }
  await vaciarAlmacen();

  return Response.json({ ok: true });
}
