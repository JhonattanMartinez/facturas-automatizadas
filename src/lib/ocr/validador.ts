// Decide si una factura se acepta sola. Devuelve los motivos de revisión; vacío = aceptable.
// "Aceptable" significa que pasó las validaciones, no que sea correcta: un dígito mal
// leído en el número de factura, por ejemplo, no altera ninguna suma.
import {
  MINIMO_LETRAS_RAZON_SOCIAL,
  PORCENTAJE_IMPOCONSUMO,
  PORCENTAJE_IVA,
  TOLERANCIA_IMPUESTO,
} from "./constantes";
import { dvValido } from "./nit";
import type { ParcialFactura } from "./tipos";

function impuestoCuadra(valor: number, base: number, porcentaje: number): boolean {
  const esperado = Math.round((base * porcentaje) / 100);
  return Math.abs(valor - esperado) <= TOLERANCIA_IMPUESTO;
}

export function validar(f: ParcialFactura): string[] {
  const motivos: string[] = [];

  const obligatorios: [unknown, string][] = [
    [f.numero, "No se leyó el número de factura"],
    [f.fecha, "No se leyó la fecha de emisión"],
    [f.proveedor, "No se leyó el proveedor"],
    [f.nitProveedor, "No se leyó el NIT del proveedor"],
    [f.clienteDocumento, "No se leyó el documento del cliente"],
    [f.subtotal, "No se leyó el subtotal"],
    [f.iva, "No se leyó el IVA"],
    [f.total, "No se leyó el total"],
  ];
  for (const [valor, motivo] of obligatorios) {
    if (valor === null) motivos.push(motivo);
  }
  if (f.items.length === 0) motivos.push("No se leyó ningún ítem");

  if (
    f.proveedor !== null &&
    (f.proveedor.match(/\p{L}/gu)?.length ?? 0) < MINIMO_LETRAS_RAZON_SOCIAL
  ) {
    motivos.push("La razón social no es legible");
  }

  if (f.nitProveedor !== null && !dvValido(f.nitProveedor, f.dvProveedor)) {
    motivos.push("El dígito de verificación del NIT del proveedor no es válido");
  }
  if (f.clienteDocumento !== null && !dvValido(f.clienteDocumento, f.clienteDv)) {
    motivos.push("El dígito de verificación del documento del cliente no es válido");
  }

  const itemsMalos = f.items.filter(
    (item) =>
      item.cantidad === null ||
      item.cantidad * item.precioUnitario !== item.subtotal,
  );
  if (itemsMalos.length > 0) {
    motivos.push("Hay ítems donde cantidad × precio no da el subtotal");
  }

  const { subtotal, iva, impoconsumo, total } = f;

  if (subtotal !== null && f.items.length > 0) {
    const suma = f.items.reduce((acumulado, item) => acumulado + item.subtotal, 0);
    if (suma !== subtotal) motivos.push("Los ítems no suman el subtotal");
  }

  if (subtotal !== null && iva !== null && !impuestoCuadra(iva, subtotal, PORCENTAJE_IVA)) {
    motivos.push(`El IVA no es el ${PORCENTAJE_IVA} % del subtotal`);
  }

  if (
    subtotal !== null &&
    impoconsumo !== null &&
    !impuestoCuadra(impoconsumo, subtotal, PORCENTAJE_IMPOCONSUMO)
  ) {
    motivos.push(`El impoconsumo no es el ${PORCENTAJE_IMPOCONSUMO} % del subtotal`);
  }

  if (subtotal !== null && iva !== null && total !== null) {
    if (subtotal + iva + (impoconsumo ?? 0) !== total) {
      motivos.push("El total no cuadra con subtotal + IVA + impoconsumo");
      if (f.mencionaImpoconsumo && impoconsumo === null) {
        motivos.push("El texto menciona impoconsumo pero no se pudo leer su valor");
      }
    }
  }

  return motivos;
}
