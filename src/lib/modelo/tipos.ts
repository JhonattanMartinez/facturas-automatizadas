// Forma de los documentos de Firestore. Firestore no tiene UNIQUE: la unicidad
// se obtiene usando el valor único como ID del documento y creándolo en una transacción.
// Las Fases 8 (métricas) y 9 (revisión manual) añadirán campos.
import type { Timestamp } from "firebase-admin/firestore";

export const COLECCIONES = {
  clientes: "clientes",
  facturas: "facturas",
  indicesNumero: "indices_numero",
  procesos: "procesos",
  archivos: "archivos", // subcolección: procesos/{id}/archivos
} as const;

/**
 * ID del documento: el NIT/CC sin puntos, guion ni DV.
 * Un cliente se identifica por documento y nunca por nombre, porque el OCR altera los nombres.
 */
export type Cliente = {
  documento: string;
  dv: string;
  nombre: string;
  creadoEn: Timestamp;
  primerProcesoId: string;
};

export type ItemFactura = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export type EstadoFactura = "aceptada" | "revision";

/**
 * ID del documento: el SHA-256 de la imagen, que existe aunque el OCR falle
 * y hace imposible guardar dos veces el mismo archivo.
 * Lo que el OCR no pudo leer queda en null: nunca se inventa un valor.
 * Los importes son pesos COP enteros. Los ítems van embebidos porque siempre se leen con la factura.
 */
export type Factura = {
  numero: string | null;
  fecha: string | null; // emisión, yyyy-mm-dd
  proveedor: string | null;
  nitProveedor: string | null;
  clienteDocumento: string | null; // null si no pasó el dígito de verificación
  clienteNombre: string | null;
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  estado: EstadoFactura;
  motivos: string[];
  archivo: string;
  rutaArchivo: string; // ruta dentro del bucket de Supabase Storage
  confianzaOcr: number | null;
  procesoId: string;
  uid: string;
  creadoEn: Timestamp;
  items: ItemFactura[];
};

/** ID del documento: el número de factura (FE-000123). Se crea en la misma transacción que la factura. */
export type IndiceNumero = {
  hashArchivo: string;
};

export type EstadoProceso = "subiendo" | "ejecutando" | "terminado";

/** Un lote de facturas. ID automático. */
export type Proceso = {
  uid: string;
  carpeta: string;
  estado: EstadoProceso;
  totalArchivos: number;
  inicio: Timestamp;
  fin: Timestamp | null;
  rutaExcel: string | null;
  finalizandoDesde: Timestamp | null;
};

export type EstadoArchivo = "pendiente" | "procesando" | "ok" | "error";
export type ResultadoArchivo = "aceptada" | "revision" | "duplicada" | "error";

/** Elemento de la cola de trabajo (procesos/{id}/archivos). ID del documento: sale del nombre del archivo. */
export type ArchivoCola = {
  rutaArchivo: string;
  nombre: string;
  estado: EstadoArchivo;
  resultado: ResultadoArchivo | null;
  clienteNuevo: boolean;
  clienteExistente: boolean;
  hashArchivo: string | null;
  intentos: number;
  error: string | null;
  /**
   * Arrendamiento, en milisegundos de época: 0 mientras espera, ahora + 5 min
   * mientras alguien lo procesa (caduca solo si la función se cae) y
   * Number.MAX_SAFE_INTEGER al terminar. Así la cola se consulta con un
   * solo campo y no necesita índice compuesto.
   */
  disponibleDesde: number;
};
