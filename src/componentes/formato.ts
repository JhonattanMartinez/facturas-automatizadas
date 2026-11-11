const PESOS = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatoPesos(valor: number | null): string {
  return valor === null ? "—" : PESOS.format(valor);
}

export function formatoPorcentaje(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")} %`;
}

export function formatoEntero(valor: number): string {
  return valor.toLocaleString("es-CO");
}

export function formatoTamano(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatoFechaHora(milisegundos: number): string {
  return new Date(milisegundos).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });
}
