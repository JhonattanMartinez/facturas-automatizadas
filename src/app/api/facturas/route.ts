// Facturas del usuario pendientes de revisión. Cuesta una lectura por factura listada.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";

const MAXIMO = 200;

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const pedidas = Number(request.nextUrl.searchParams.get("cuantas") ?? MAXIMO);
  const limite = Number.isInteger(pedidas) && pedidas > 0 ? Math.min(pedidas, MAXIMO) : MAXIMO;

  // Solo filtros de igualdad: no necesita un índice compuesto.
  const consulta = await baseDeDatos()
    .collection(COLECCIONES.facturas)
    .where("uid", "==", usuario.uid)
    .where("estado", "==", "revision")
    .limit(limite)
    .get();

  const facturas = consulta.docs.map((documento) => {
    const f = documento.data() as Factura;
    return {
      hash: documento.id,
      archivo: f.archivo,
      numero: f.numero,
      proveedor: f.proveedor,
      total: f.total,
      motivos: f.motivos,
    };
  });

  return Response.json({ facturas });
}
