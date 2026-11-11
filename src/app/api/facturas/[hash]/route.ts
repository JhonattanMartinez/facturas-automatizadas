// Detalle de una factura y guardado de la revisión manual.
import type { NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type Factura } from "@/lib/modelo/tipos";
import { corregirFactura } from "@/lib/procesamiento/corregir";

const noEncontrada = () =>
  Response.json({ error: "Factura no encontrada" }, { status: 404 });

const hashValido = (hash: string) => /^[a-f0-9]{64}$/.test(hash);

export async function GET(
  request: NextRequest,
  contexto: RouteContext<"/api/facturas/[hash]">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { hash } = await contexto.params;
  if (!hashValido(hash)) return noEncontrada();

  const documento = await baseDeDatos().collection(COLECCIONES.facturas).doc(hash).get();
  const factura = documento.data() as Factura | undefined;
  if (!factura || factura.uid !== usuario.uid) return noEncontrada();

  return Response.json({
    hash,
    archivo: factura.archivo,
    numero: factura.numero,
    fecha: factura.fecha,
    proveedor: factura.proveedor,
    nitProveedor: factura.nitProveedor,
    dvProveedor: factura.dvProveedor,
    clienteDocumento: factura.clienteDocumento ?? factura.clienteDocumentoLeido,
    clienteDv: factura.clienteDv,
    clienteNombre: factura.clienteNombre,
    items: factura.items,
    subtotal: factura.subtotal,
    iva: factura.iva,
    impoconsumo: factura.impoconsumo,
    total: factura.total,
    estado: factura.estado,
    motivos: factura.motivos,
    corregidaManualmente: Boolean(factura.corregidaManualmente),
    procesoId: factura.procesoId,
  });
}

export async function PUT(
  request: NextRequest,
  contexto: RouteContext<"/api/facturas/[hash]">,
): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const { hash } = await contexto.params;
  if (!hashValido(hash)) return noEncontrada();

  const { status, cuerpo } = await corregirFactura({
    hash,
    uid: usuario.uid,
    email: usuario.email,
    cuerpo: await request.json().catch(() => null),
  });
  return Response.json(cuerpo, { status });
}
