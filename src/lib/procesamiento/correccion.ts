// Funciones puras de la revisión manual, compartidas por el navegador y el servidor.
import { PORCENTAJE_IMPOCONSUMO, PORCENTAJE_IVA } from "@/lib/ocr/constantes";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import type { DatosCorreccion } from "./correccion-esquema";

/** Convierte lo escrito en la forma que entiende `validar`: mismas reglas que el OCR. */
export function aParcial(datos: DatosCorreccion): ParcialFactura {
  return {
    numero: datos.numero,
    fecha: datos.fecha,
    proveedor: datos.proveedor,
    nitProveedor: datos.nitProveedor,
    dvProveedor: datos.dvProveedor,
    clienteDocumento: datos.clienteDocumento,
    clienteDv: datos.clienteDv,
    clienteNombre: datos.clienteNombre,
    items: datos.items.map((item) => ({
      ...item,
      subtotal: item.cantidad * item.precioUnitario,
    })),
    subtotal: datos.subtotal,
    iva: datos.iva,
    impoconsumo: datos.impoconsumo,
    mencionaImpoconsumo: datos.impoconsumo !== null,
    total: datos.total,
  };
}

/** Los totales que corresponderían a estos ítems; la persona puede cambiarlos. */
export function totalesPropuestos(
  items: { cantidad: number; precioUnitario: number }[],
  conImpoconsumo: boolean,
) {
  const subtotal = items.reduce((suma, i) => suma + i.cantidad * i.precioUnitario, 0);
  const iva = Math.round((subtotal * PORCENTAJE_IVA) / 100);
  const impoconsumo = conImpoconsumo
    ? Math.round((subtotal * PORCENTAJE_IMPOCONSUMO) / 100)
    : null;
  return { subtotal, iva, impoconsumo, total: subtotal + iva + (impoconsumo ?? 0) };
}
