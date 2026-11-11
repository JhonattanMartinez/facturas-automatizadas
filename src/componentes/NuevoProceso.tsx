"use client";

import { useState, type ChangeEvent } from "react";

const CONCURRENCIA = 6;
const INTENTOS = 3;
const POR_LOTE_INICIAL = 100;

type AvanceLote = { id: string; nombre: string; total: number; subidas: number };
type Tarea = { archivo: File; procesoId: string; indice: number };
type Fallo = Tarea & { motivo: string };

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

function formatoTamano(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Devuelve null si subió, o el motivo por el que no se pudo. */
async function subirArchivo({ archivo, procesoId, indice }: Tarea): Promise<string | null> {
  const parametros = new URLSearchParams({ indice: String(indice), nombre: archivo.name });
  let motivo = "Falla de red";

  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const respuesta = await fetch(`/api/procesos/${procesoId}/imagenes?${parametros}`, {
        method: "POST",
        headers: { "content-type": archivo.type || "application/octet-stream" },
        body: archivo,
      });
      if (respuesta.ok) return null;
      const datos = (await respuesta.json().catch(() => null)) as { error?: string } | null;
      motivo = datos?.error ?? `Error ${respuesta.status}`;
      // Un 4xx significa que el archivo es el problema: repetirlo daría lo mismo.
      if (respuesta.status < 500) return motivo;
    } catch {
      motivo = "Falla de red";
    }
    if (intento < INTENTOS) await esperar(500 * 2 ** intento);
  }
  return motivo;
}

async function enParalelo<T>(tareas: T[], hacer: (tarea: T) => Promise<void>) {
  let siguiente = 0;
  const trabajadores = Math.min(CONCURRENCIA, tareas.length);
  await Promise.all(
    Array.from({ length: trabajadores }, async () => {
      while (siguiente < tareas.length) await hacer(tareas[siguiente++]);
    }),
  );
}

const claseBoton =
  "cursor-pointer rounded border border-current px-3 py-2 font-medium focus-within:ring-2";

export function NuevoProceso() {
  const [archivos, setArchivos] = useState<File[]>([]);
  const [carpeta, setCarpeta] = useState("");
  const [porLote, setPorLote] = useState(POR_LOTE_INICIAL);
  const [lotes, setLotes] = useState<AvanceLote[]>([]);
  const [fallos, setFallos] = useState<Fallo[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function elegir(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = [...(evento.target.files ?? [])]
      .filter((archivo) => /\.(png|jpe?g)$/i.test(archivo.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    setArchivos(elegidos);
    setCarpeta(elegidos[0]?.webkitRelativePath.split("/")[0] || "Archivos sueltos");
    setLotes([]);
    setFallos([]);
    setError(null);
    evento.target.value = ""; // permite volver a elegir la misma carpeta
  }

  const tamanoLote = porLote > 0 ? porLote : archivos.length || 1;
  const numeroLotes = Math.ceil(archivos.length / tamanoLote);
  const tamanoTotal = archivos.reduce((suma, archivo) => suma + archivo.size, 0);

  async function procesarTareas(tareas: Tarea[]): Promise<Fallo[]> {
    const nuevos: Fallo[] = [];
    await enParalelo(tareas, async (tarea) => {
      const motivo = await subirArchivo(tarea);
      if (motivo) {
        nuevos.push({ ...tarea, motivo });
        return;
      }
      setLotes((actuales) =>
        actuales.map((lote) =>
          lote.id === tarea.procesoId ? { ...lote, subidas: lote.subidas + 1 } : lote,
        ),
      );
    });
    return nuevos;
  }

  async function subirTodo() {
    setSubiendo(true);
    setError(null);
    setFallos([]);
    setLotes([]);
    try {
      const pendientes: Fallo[] = [];
      for (let i = 0; i < numeroLotes; i++) {
        const trozo = archivos.slice(i * tamanoLote, (i + 1) * tamanoLote);
        const nombre = numeroLotes > 1 ? `${carpeta} (${i + 1} de ${numeroLotes})` : carpeta;
        const respuesta = await fetch("/api/procesos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ carpeta: nombre, totalArchivos: trozo.length }),
        });
        if (!respuesta.ok) throw new Error(`No se pudo crear el lote (error ${respuesta.status})`);
        const { id } = (await respuesta.json()) as { id: string };

        setLotes((actuales) => [
          ...actuales,
          { id, nombre, total: trozo.length, subidas: 0 },
        ]);
        pendientes.push(
          ...(await procesarTareas(
            trozo.map((archivo, posicion) => ({
              archivo,
              procesoId: id,
              indice: posicion + 1,
            })),
          )),
        );
      }
      setFallos(pendientes);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo subir la carpeta");
    } finally {
      setSubiendo(false);
    }
  }

  async function reintentar() {
    setSubiendo(true);
    setFallos(await procesarTareas(fallos));
    setSubiendo(false);
  }

  return (
    <section className="flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {/* Un input de archivo sin estilo es solo texto: se oculta dentro de una etiqueta con forma de botón. */}
        <label className={claseBoton}>
          Elegir carpeta…
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={subiendo}
            onChange={elegir}
            // @ts-expect-error webkitdirectory no está en los tipos de React, pero los navegadores lo admiten
            webkitdirectory=""
          />
        </label>
        {/* Algunos navegadores móviles no permiten elegir carpetas. */}
        <label className={claseBoton}>
          Elegir archivos…
          <input
            type="file"
            multiple
            accept=".png,.jpg,.jpeg"
            className="sr-only"
            disabled={subiendo}
            onChange={elegir}
          />
        </label>
      </div>

      {archivos.length > 0 && (
        <>
          <p>
            {archivos.length} imágenes en «{carpeta}», {formatoTamano(tamanoTotal)}.
          </p>
          <label className="flex flex-wrap items-center gap-2">
            Facturas por lote (0 = todo en uno)
            <input
              type="number"
              min={0}
              value={porLote}
              disabled={subiendo}
              onChange={(e) => setPorLote(Math.max(0, Math.floor(Number(e.target.value))))}
              className="w-24 rounded border border-zinc-400 bg-transparent px-2 py-1 dark:border-zinc-600"
            />
            <span>= {numeroLotes} lote(s)</span>
          </label>
          <button
            type="button"
            onClick={subirTodo}
            disabled={subiendo}
            className="self-start rounded bg-foreground px-3 py-2 font-medium text-background disabled:opacity-50"
          >
            {subiendo ? "Subiendo…" : "Subir"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {lotes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lotes.map((lote) => (
            <li key={lote.id} className="flex flex-col gap-1">
              <span>
                {lote.nombre}: {lote.subidas} de {lote.total} subidas
              </span>
              <progress value={lote.subidas} max={lote.total} className="w-full" />
            </li>
          ))}
        </ul>
      )}

      {fallos.length > 0 && !subiendo && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="font-medium text-red-700 dark:text-red-400">
            ✕ {fallos.length} archivo(s) no se pudieron subir:
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {fallos.map((fallo) => (
              <li key={`${fallo.procesoId}-${fallo.indice}`}>
                {fallo.archivo.name}: {fallo.motivo}
              </li>
            ))}
          </ul>
          <button type="button" onClick={reintentar} className={`${claseBoton} self-start`}>
            Reintentar esos archivos
          </button>
        </div>
      )}
    </section>
  );
}
