export type ItemParcial = {
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number;
  subtotal: number;
};

/** Lo que se alcanzó a leer de una factura. Lo que no se encontró queda en null: nunca se inventa. */
export type ParcialFactura = {
  numero: string | null;
  fecha: string | null; // emisión, yyyy-mm-dd
  proveedor: string | null;
  nitProveedor: string | null;
  dvProveedor: string | null;
  clienteDocumento: string | null;
  clienteDv: string | null;
  clienteNombre: string | null;
  items: ItemParcial[];
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  mencionaImpoconsumo: boolean;
  total: number | null;
};
