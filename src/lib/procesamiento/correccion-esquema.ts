// Formato de los datos que envía el formulario de revisión. Lo usan el navegador y el servidor.
import { z } from "zod";

const entero = (campo: string, maximo = 1_000_000_000_000) =>
  z
    .number(`${campo}: escribe un número`)
    .int(`${campo}: debe ser un número entero`)
    .min(0, `${campo}: no puede ser negativo`)
    .max(maximo, `${campo}: es demasiado grande`);

function fechaReal(texto: string): boolean {
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

export const esquemaCorreccion = z.object({
  // Va en el id de un documento de Firestore: una barra crearía otra ruta.
  numero: z.string().regex(/^[A-Za-z0-9-]{1,30}$/, "Número: solo letras, números y guiones"),
  fecha: z.string().refine(fechaReal, "Fecha: usa una fecha real"),
  proveedor: z.string().trim().min(1, "Proveedor: es obligatorio").max(200),
  nitProveedor: z.string().regex(/^\d{6,10}$/, "NIT del proveedor: de 6 a 10 dígitos, sin puntos"),
  dvProveedor: z.string().regex(/^\d$/, "Dígito de verificación del proveedor: un dígito"),
  clienteDocumento: z.string().regex(/^\d{6,10}$/, "Documento del cliente: de 6 a 10 dígitos, sin puntos"),
  clienteDv: z.string().regex(/^\d$/, "Dígito de verificación del cliente: un dígito"),
  clienteNombre: z.string().trim().min(1, "Cliente: es obligatorio").max(200),
  items: z
    .array(
      z.object({
        descripcion: z.string().trim().min(1, "Ítem: falta la descripción").max(300),
        cantidad: entero("Cantidad", 1_000_000).min(1, "Cantidad: debe ser al menos 1"),
        precioUnitario: entero("Precio unitario"),
      }),
    )
    .min(1, "Agrega al menos un ítem")
    .max(200),
  subtotal: entero("Subtotal"),
  iva: entero("IVA"),
  impoconsumo: entero("Impoconsumo").nullable(),
  total: entero("Total"),
  confirmarValidaciones: z.boolean(),
});

export type DatosCorreccion = z.infer<typeof esquemaCorreccion>;
