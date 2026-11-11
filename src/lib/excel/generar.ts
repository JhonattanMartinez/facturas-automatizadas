// Genera el Excel de un lote a partir de la base de datos, no de la memoria:
// así muestra exactamente lo que quedó guardado.
import ExcelJS from "exceljs";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type ArchivoCola,
  type Cliente,
  type Factura,
  type Proceso,
} from "@/lib/modelo/tipos";

export const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FORMATO_MONEDA = '"$"#,##0';
const FORMATO_FECHA = "yyyy-mm-dd";

async function leerVarios<T>(
  db: Firestore,
  coleccion: string,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const coleccionRef = db.collection(coleccion);
  const documentos = await db.getAll(...ids.map((id) => coleccionRef.doc(id)));
  return documentos.filter((d) => d.exists).map((d) => d.data() as T);
}

// A medianoche UTC: exceljs escribe la fecha en UTC y así no se corre un día.
function aFecha(texto: string | null): Date | null {
  if (!texto) return null;
  const [anio, mes, dia] = texto.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function prepararHoja(hoja: ExcelJS.Worksheet, columnas: number): void {
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnas },
  };
}

function formatoDuracion(ms: number): string {
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

function hojaFacturas(libro: ExcelJS.Workbook, facturas: Factura[]): void {
  const hoja = libro.addWorksheet("Facturas");
  hoja.columns = [
    { header: "Archivo", key: "archivo", width: 22 },
    { header: "Número", key: "numero", width: 13 },
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: FORMATO_FECHA } },
    { header: "Proveedor", key: "proveedor", width: 38 },
    { header: "NIT proveedor", key: "nitProveedor", width: 14 },
    { header: "Documento cliente", key: "clienteDocumento", width: 18 },
    { header: "Cliente", key: "clienteNombre", width: 38 },
    { header: "Valor antes de IVA", key: "subtotal", width: 18, style: { numFmt: FORMATO_MONEDA } },
    { header: "IVA", key: "iva", width: 14, style: { numFmt: FORMATO_MONEDA } },
    { header: "Impoconsumo", key: "impoconsumo", width: 14, style: { numFmt: FORMATO_MONEDA } },
    { header: "Total", key: "total", width: 16, style: { numFmt: FORMATO_MONEDA } },
    { header: "Estado", key: "estado", width: 11 },
    { header: "Motivos", key: "motivos", width: 60 },
    { header: "Confianza OCR", key: "confianzaOcr", width: 14 },
  ];
  for (const f of facturas) {
    hoja.addRow({ ...f, fecha: aFecha(f.fecha), motivos: f.motivos.join("; ") });
  }
  prepararHoja(hoja, hoja.columns.length);
}

function hojaItems(libro: ExcelJS.Workbook, facturas: Factura[]): void {
  const hoja = libro.addWorksheet("Ítems");
  hoja.columns = [
    { header: "Número de factura", key: "numero", width: 18 },
    { header: "Descripción", key: "descripcion", width: 60 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Precio unitario", key: "precioUnitario", width: 16, style: { numFmt: FORMATO_MONEDA } },
    { header: "Subtotal", key: "subtotal", width: 16, style: { numFmt: FORMATO_MONEDA } },
  ];
  for (const factura of facturas) {
    for (const item of factura.items) {
      hoja.addRow({ ...item, numero: factura.numero });
    }
  }
  prepararHoja(hoja, hoja.columns.length);
}

function hojaClientes(
  libro: ExcelJS.Workbook,
  facturas: Factura[],
  clientes: Cliente[],
): void {
  const hoja = libro.addWorksheet("Clientes");
  hoja.columns = [
    { header: "Documento", key: "documento", width: 16 },
    { header: "Nombre", key: "nombre", width: 40 },
    { header: "Número de facturas", key: "facturas", width: 18 },
    { header: "Total comprado", key: "total", width: 18, style: { numFmt: FORMATO_MONEDA } },
  ];
  for (const cliente of clientes) {
    const suyas = facturas.filter((f) => f.clienteDocumento === cliente.documento);
    hoja.addRow({
      documento: cliente.documento,
      nombre: cliente.nombre,
      facturas: suyas.length,
      total: suyas.reduce((suma, f) => suma + (f.total ?? 0), 0),
    });
  }
  prepararHoja(hoja, hoja.columns.length);
}

function hojaResumen(
  libro: ExcelJS.Workbook,
  proceso: Proceso,
  cola: ArchivoCola[],
): void {
  const contar = (filtro: (a: ArchivoCola) => boolean) => cola.filter(filtro).length;
  const hoja = libro.addWorksheet("Resumen");
  hoja.columns = [
    { header: "Concepto", key: "concepto", width: 24 },
    { header: "Valor", key: "valor", width: 40 },
  ];
  hoja.addRows([
    { concepto: "Carpeta", valor: proceso.carpeta },
    { concepto: "Total de archivos", valor: cola.length },
    { concepto: "Aceptadas", valor: contar((a) => a.resultado === "aceptada") },
    { concepto: "En revisión", valor: contar((a) => a.resultado === "revision") },
    { concepto: "Duplicadas", valor: contar((a) => a.resultado === "duplicada") },
    { concepto: "Con error", valor: contar((a) => a.resultado === "error") },
    { concepto: "Clientes nuevos", valor: contar((a) => a.clienteNuevo) },
    { concepto: "Clientes existentes", valor: contar((a) => a.clienteExistente) },
    { concepto: "Duración", valor: formatoDuracion(Date.now() - proceso.inicio.toMillis()) },
  ]);
  prepararHoja(hoja, hoja.columns.length);
}

export async function generarExcel(
  referencia: DocumentReference,
  proceso: Proceso,
): Promise<Buffer> {
  const db = baseDeDatos();
  const cola = (await referencia.collection(COLECCIONES.archivos).get()).docs.map(
    (documento) => documento.data() as ArchivoCola,
  );

  // Por hash y no por procesoId: así entran las duplicadas y un reproceso no sale vacío.
  const hashes = [...new Set(cola.flatMap((a) => a.hashArchivo ?? []))];
  const facturas = await leerVarios<Factura>(db, COLECCIONES.facturas, hashes);
  const documentos = [...new Set(facturas.flatMap((f) => f.clienteDocumento ?? []))];
  const clientes = await leerVarios<Cliente>(db, COLECCIONES.clientes, documentos);

  const libro = new ExcelJS.Workbook();
  hojaFacturas(libro, facturas);
  hojaItems(libro, facturas);
  hojaClientes(libro, facturas, clientes);
  hojaResumen(libro, proceso, cola);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Con la hora de Colombia: un servidor en la nube no está en esa zona horaria. */
export function nombreExcel(fecha: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map((parte) => [parte.type, parte.value]),
  );
  return `resultado_${partes.year}-${partes.month}-${partes.day}_${partes.hour}${partes.minute}.xlsx`;
}
