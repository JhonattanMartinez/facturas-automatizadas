// TEMPORAL (Fase 5): demuestra que el OCR funciona dentro de una función de Vercel.
// Se borra al terminar la fase, junto con las imágenes de prueba.
import type { NextRequest } from "next/server";
import { descargar, listarNombres } from "@/lib/almacenamiento";
import { exigirUsuario } from "@/lib/auth/sesion";
import { leerFactura } from "@/lib/ocr/leer-factura";

export const maxDuration = 300;

const CARPETA = "pruebas/fase-5";

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const inicio = Date.now();
  const nombres = await listarNombres(CARPETA);
  const resultados = [];

  for (const nombre of nombres) {
    const inicioImagen = Date.now();
    const { datos, motivos, confianza } = await leerFactura(
      await descargar(`${CARPETA}/${nombre}`),
    );
    resultados.push({
      archivo: nombre,
      ms: Date.now() - inicioImagen,
      aceptada: motivos.length === 0,
      motivos,
      confianza,
      numero: datos.numero,
      fecha: datos.fecha,
      proveedor: datos.proveedor,
      nitProveedor: datos.nitProveedor,
      clienteDocumento: datos.clienteDocumento,
      items: datos.items.length,
      subtotal: datos.subtotal,
      iva: datos.iva,
      impoconsumo: datos.impoconsumo,
      total: datos.total,
    });
  }

  const tiempoTotalMs = Date.now() - inicio;
  return Response.json({
    facturas: resultados.length,
    aceptadas: resultados.filter((r) => r.aceptada).length,
    tiempoTotalMs,
    tiempoPorImagenMs: resultados.length
      ? Math.round(tiempoTotalMs / resultados.length)
      : 0,
    resultados,
  });
}
