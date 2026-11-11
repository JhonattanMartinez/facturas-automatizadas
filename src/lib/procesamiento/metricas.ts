// Cálculo de métricas. Funciones puras, compartidas por el servidor y el navegador.
import type { EstadoProceso, Importes, Metricas } from "@/lib/modelo/tipos";

export type EventoMetricas =
  | {
      tipo: "aceptada" | "revision";
      subtotal: number | null;
      iva: number | null;
      impoconsumo: number | null;
      total: number | null;
      nit: string | null;
      nombre: string | null;
      clienteNuevo: boolean;
    }
  | { tipo: "duplicada" }
  | { tipo: "error" }
  | {
      tipo: "correccion";
      anterior: FotoCorreccion | null; // null: es la primera vez que una persona la revisa
      nueva: FotoCorreccion;
      clienteNuevo: boolean;
    };

export type FotoCorreccion = {
  subtotal: number;
  iva: number;
  impoconsumo: number;
  total: number;
  nit: string;
  nombre: string;
};

/** Un incremento: la ruta dentro de `metricas` y cuánto se suma. */
export type Cambio = [string[], number];

const IMPORTES = ["subtotal", "iva", "impoconsumo", "total"] as const;

/** Lo que devuelve la API sobre un lote. */
export type ResumenProceso = {
  id: string;
  carpeta: string;
  estado: EstadoProceso;
  totalArchivos: number;
  inicio: number;
  fin: number | null;
  rutaExcel: string | null;
  metricas: Metricas;
};

const importesVacios = (): Importes => ({
  n: 0, subtotal: 0, iva: 0, impoconsumo: 0, total: 0,
});

export function metricasVacias(): Metricas {
  return {
    aceptadas: importesVacios(),
    revision: importesVacios(),
    manuales: importesVacios(),
    errores: 0,
    duplicadas: 0,
    clientesNuevos: 0,
    proveedores: {},
  };
}

function aporteDeProveedor(foto: FotoCorreccion, signo: 1 | -1): Cambio[] {
  const raiz = ["proveedores", foto.nit];
  return [
    [[...raiz, "n"], signo],
    ...IMPORTES.map((campo): Cambio => [[...raiz, campo], signo * foto[campo]]),
    [[...raiz, "nombres", foto.nombre], signo],
  ];
}

// Firestore rechaza una actualización que mencione dos veces el mismo campo.
function combinar(cambios: Cambio[]): Cambio[] {
  const porRuta = new Map<string, Cambio>();
  for (const [ruta, valor] of cambios) {
    const clave = JSON.stringify(ruta);
    const previo = porRuta.get(clave);
    porRuta.set(clave, [ruta, (previo?.[1] ?? 0) + valor]);
  }
  return [...porRuta.values()];
}

function cambiosDeCorreccion(
  anterior: FotoCorreccion | null,
  nueva: FotoCorreccion,
  clienteNuevo: boolean,
): Cambio[] {
  const cambios: Cambio[] = [];
  if (!anterior) cambios.push([["manuales", "n"], 1]);
  for (const campo of IMPORTES) {
    cambios.push([["manuales", campo], nueva[campo] - (anterior?.[campo] ?? 0)]);
  }
  if (clienteNuevo) cambios.push([["clientesNuevos"], 1]);
  // Al reeditar se quita lo aportado antes y se suma lo nuevo: solo cuenta la diferencia.
  if (anterior) cambios.push(...aporteDeProveedor(anterior, -1));
  cambios.push(...aporteDeProveedor(nueva, 1));
  return combinar(cambios);
}

/** Describe qué contadores cambia un evento. Separado de Firestore para poder probarlo. */
export function cambiosDe(evento: EventoMetricas): Cambio[] {
  if (evento.tipo === "duplicada") return [[["duplicadas"], 1]];
  if (evento.tipo === "error") return [[["errores"], 1]];
  if (evento.tipo === "correccion") {
    return cambiosDeCorreccion(evento.anterior, evento.nueva, evento.clienteNuevo);
  }

  const { tipo, nit, nombre, clienteNuevo } = evento;
  const seccion = tipo === "aceptada" ? "aceptadas" : "revision";
  const cambios: Cambio[] = [[[seccion, "n"], 1]];
  for (const campo of IMPORTES) cambios.push([[seccion, campo], evento[campo] ?? 0]);
  if (clienteNuevo) cambios.push([["clientesNuevos"], 1]);

  // Solo aceptadas: en una factura en revisión el NIT puede estar mal leído.
  if (tipo === "aceptada" && nit) {
    cambios.push([["proveedores", nit, "n"], 1]);
    for (const campo of IMPORTES) {
      cambios.push([["proveedores", nit, campo], evento[campo] ?? 0]);
    }
    if (nombre) cambios.push([["proveedores", nit, "nombres", nombre], 1]);
  }
  return cambios;
}

function sumarEn(destino: Record<string, unknown>, ruta: string[], valor: number): void {
  const [clave, ...resto] = ruta;
  if (resto.length === 0) {
    destino[clave] = ((destino[clave] as number | undefined) ?? 0) + valor;
    return;
  }
  destino[clave] ??= {};
  sumarEn(destino[clave] as Record<string, unknown>, resto, valor);
}

/** Reconstruye las métricas de un lote, por ejemplo uno anterior a los contadores. */
export function metricasDesdeEventos(eventos: EventoMetricas[]): Metricas {
  const metricas = metricasVacias();
  for (const evento of eventos) {
    for (const [ruta, valor] of cambiosDe(evento)) sumarEn(metricas, ruta, valor);
  }
  return metricas;
}

export function sumarMetricas(lista: Metricas[]): Metricas {
  const total = metricasVacias();
  for (const metricas of lista) {
    for (const seccion of ["aceptadas", "revision", "manuales"] as const) {
      for (const campo of ["n", ...IMPORTES] as const) {
        total[seccion][campo] += metricas[seccion][campo];
      }
    }
    total.errores += metricas.errores;
    total.duplicadas += metricas.duplicadas;
    total.clientesNuevos += metricas.clientesNuevos;

    for (const [nit, proveedor] of Object.entries(metricas.proveedores)) {
      const acumulado = (total.proveedores[nit] ??= { ...importesVacios(), nombres: {} });
      for (const campo of ["n", ...IMPORTES] as const) acumulado[campo] += proveedor[campo];
      for (const [nombre, veces] of Object.entries(proveedor.nombres ?? {})) {
        acumulado.nombres[nombre] = (acumulado.nombres[nombre] ?? 0) + veces;
      }
    }
  }
  return total;
}

// El OCR altera algunos nombres, pero casi nunca igual: el más repetido suele ser el correcto.
function nombreMasRepetido(nombres: Record<string, number>): string {
  const [ganador] = Object.entries(nombres)
    .filter(([, veces]) => veces > 0) // una corrección puede haber dejado un nombre en cero
    .sort(
      ([nombreA, vecesA], [nombreB, vecesB]) =>
        vecesB - vecesA || nombreA.localeCompare(nombreB), // empate: siempre el mismo
    );
  return ganador?.[0] ?? "(sin nombre legible)";
}

export function proveedoresOrdenados(metricas: Metricas) {
  return Object.entries(metricas.proveedores)
    .filter(([, proveedor]) => proveedor.n > 0)
    .map(([nit, proveedor]) => ({
      nit,
      nombre: nombreMasRepetido(proveedor.nombres ?? {}),
      n: proveedor.n,
      subtotal: proveedor.subtotal,
      iva: proveedor.iva,
      impoconsumo: proveedor.impoconsumo,
      total: proveedor.total,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Los porcentajes son sobre facturas distintas: las duplicadas ya estaban. */
export function calcularTasas(metricas: Metricas) {
  const correctas = metricas.aceptadas.n;
  const malas = metricas.revision.n + metricas.errores;
  const distintas = correctas + malas;
  return {
    distintas,
    correctas,
    malas,
    pctCorrectas: distintas ? (correctas / distintas) * 100 : 0,
    pctMalas: distintas ? (malas / distintas) * 100 : 0,
  };
}

/** Cuántas de las mal leídas ya revisó una persona y cuántas siguen esperando. */
export function estadoRevision(metricas: Metricas) {
  const { malas } = calcularTasas(metricas);
  const revisadas = metricas.manuales.n;
  return { revisadas, pendientes: Math.max(0, malas - revisadas) };
}

/** Lo procesado: lo que aceptó la máquina más lo que revisó una persona. */
export function importesProcesados(metricas: Metricas): Importes {
  const { aceptadas, manuales } = metricas;
  return {
    n: aceptadas.n + manuales.n,
    subtotal: aceptadas.subtotal + manuales.subtotal,
    iva: aceptadas.iva + manuales.iva,
    impoconsumo: aceptadas.impoconsumo + manuales.impoconsumo,
    total: aceptadas.total + manuales.total,
  };
}

/** Archivos terminados del lote, para la barra de avance. */
export function totalProcesadas(metricas: Metricas): number {
  return (
    metricas.aceptadas.n + metricas.revision.n + metricas.errores + metricas.duplicadas
  );
}
