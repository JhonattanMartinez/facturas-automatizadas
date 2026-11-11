// Facturas de un lote. Cuesta unas 2 lecturas por factura: la interfaz la pide una sola vez.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type ArchivoCola, type Factura } from "@/lib/modelo/tipos";
import { loteNoEncontrado, procesoDelUsuario } from "@/lib/procesamiento/proceso";

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/procesos/[id]/facturas">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { id } = await contexto.params;
  const proceso = await procesoDelUsuario(id, usuario.uid);
  if (!proceso) return loteNoEncontrado();

  const cola = await proceso.referencia.collection(COLECCIONES.archivos).get();
  // Por hash y no por procesoId: así un reproceso también muestra sus facturas.
  const hashes = [
    ...new Set(cola.docs.flatMap((d) => (d.data() as ArchivoCola).hashArchivo ?? [])),
  ];
  if (hashes.length === 0) return Response.json({ facturas: [] });

  const db = baseDeDatos();
  const coleccion = db.collection(COLECCIONES.facturas);
  const documentos = await db.getAll(...hashes.map((hash) => coleccion.doc(hash)));

  const facturas = documentos.flatMap((documento) => {
    const f = documento.data() as Factura | undefined;
    if (!f || f.uid !== usuario.uid) return [];
    return [
      {
        hash: documento.id,
        archivo: f.archivo,
        numero: f.numero,
        fecha: f.fecha,
        proveedor: f.proveedor,
        subtotal: f.subtotal,
        iva: f.iva,
        impoconsumo: f.impoconsumo,
        total: f.total,
        estado: f.estado,
        motivos: f.motivos,
      },
    ];
  });

  return Response.json({ facturas });
}
