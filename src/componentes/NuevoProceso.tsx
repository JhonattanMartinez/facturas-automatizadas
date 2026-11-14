"use client";

import { useState, type ChangeEvent } from "react";
import { totalProcesadas } from "@/lib/procesamiento/metricas";
import { formatoEntero, formatoTamano } from "./formato";
import { ListaProcesos } from "./ListaProcesos";
import { ResumenEnVivo } from "./ResumenEnVivo";
import { Barra, CLASE_BOTON, CLASE_BOTON_PRINCIPAL, CLASE_CAMPO, Tarjeta } from "./ui";
import { EVENTO_LOTE_INICIADO, useMetricas } from "./useMetricas";

const CONCURRENCIA = 6;
const INTENTOS = 3;
const POR_LOTE_INICIAL = 100;
const LECTURAS_POR_FACTURA = 5;

type AvanceLote = { id: string; nombre: string; total: number; subidas: number };
type Tarea = { archivo: File; procesoId: string; indice: number };
type Fallo = { archivo: File; motivo: string };

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

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

export function NuevoProceso() {
  const { datos } = useMetricas();
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
  const procesosDeLaSubida =
    datos?.procesos.filter((p) => lotes.some((lote) => lote.id === p.id)) ?? [];

  /** Crea un lote, sube sus imágenes y lo inicia. No espera a que se procese. */
  async function subirLote(trozo: File[], nombre: string): Promise<Fallo[]> {
    const creado = await fetch("/api/procesos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ carpeta: nombre, totalArchivos: trozo.length }),
    });
    if (!creado.ok) throw new Error(`No se pudo crear el lote (error ${creado.status})`);
    const { id } = (await creado.json()) as { id: string };
    setLotes((actuales) => [...actuales, { id, nombre, total: trozo.length, subidas: 0 }]);

    const fallidos: Fallo[] = [];
    const tareas = trozo.map((archivo, posicion) => ({
      archivo,
      procesoId: id,
      indice: posicion + 1,
    }));
    await enParalelo(tareas, async (tarea) => {
      const motivo = await subirArchivo(tarea);
      if (motivo) {
        fallidos.push({ archivo: tarea.archivo, motivo });
        return;
      }
      setLotes((actuales) =>
        actuales.map((lote) => (lote.id === id ? { ...lote, subidas: lote.subidas + 1 } : lote)),
      );
    });

    if (fallidos.length < trozo.length) {
      const iniciado = await fetch(`/api/procesos/${id}/iniciar`, { method: "POST" });
      if (!iniciado.ok) throw new Error(`No se pudo iniciar el lote (error ${iniciado.status})`);
      // Aquí se separa subir de procesar: el motor toma el lote y seguimos con el siguiente.
      window.dispatchEvent(new CustomEvent(EVENTO_LOTE_INICIADO, { detail: id }));
    }
    return fallidos;
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
        pendientes.push(...(await subirLote(trozo, nombre)));
        setFallos([...pendientes]);
      }
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo subir la carpeta");
    } finally {
      setSubiendo(false);
    }
  }

  // Un lote ya iniciado no admite más imágenes: los archivos fallidos van en un lote nuevo.
  async function reintentar() {
    setSubiendo(true);
    setError(null);
    try {
      setFallos(await subirLote(fallos.map((fallo) => fallo.archivo), `${carpeta} (reintento)`));
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudieron reintentar");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      <Tarjeta titulo="Nueva carga" subtitulo="Elige la carpeta con las imágenes de las facturas (PNG o JPG).">
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-borde bg-superficie-2/60 px-4 py-8 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-acento-suave text-2xl text-acento"
          >
            ⇪
          </span>
          <p className="text-sm text-secundario">
            Se suben a través del servidor, que revisa cada archivo, y se procesan en segundo plano.
          </p>
        <div className="flex flex-wrap justify-center gap-3">
          {/* Un input de archivo sin estilo es solo texto: va oculto dentro de una etiqueta con forma de botón. */}
          <label className={CLASE_BOTON_PRINCIPAL}>
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
          <label className={CLASE_BOTON}>
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
        </div>

        {archivos.length > 0 && (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-acento-suave px-3 py-1 text-sm font-semibold text-acento-fuerte">
                {formatoEntero(archivos.length)} imágenes
              </span>
              <span className="text-sm text-secundario">
                en «{carpeta}», {formatoTamano(tamanoTotal)}
              </span>
            </p>
            <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Facturas por lote (0 = todo en uno)
              <input
                type="number"
                min={0}
                value={porLote}
                disabled={subiendo}
                onChange={(e) => setPorLote(Math.max(0, Math.floor(Number(e.target.value))))}
                className={`w-24 ${CLASE_CAMPO}`}
              />
              <span>= {numeroLotes} lote(s)</span>
            </label>
            <p className="text-sm text-secundario">
              Procesarlas gastará unas {formatoEntero(archivos.length * LECTURAS_POR_FACTURA)}{" "}
              lecturas de la cuota diaria de Firestore.
            </p>
            <button
              type="button"
              onClick={subirTodo}
              disabled={subiendo}
              className={`self-start ${CLASE_BOTON_PRINCIPAL}`}
            >
              {subiendo ? "Subiendo…" : "Subir y procesar"}
            </button>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-malo-suave px-3 py-2 text-sm text-malo">
            ✕ {error}
          </p>
        )}
      </Tarjeta>

      {lotes.length > 0 && (
        <Tarjeta titulo="Avance de esta carga">
          <ul className="flex flex-col gap-3">
            {lotes.map((lote) => {
              const proceso = datos?.procesos.find((p) => p.id === lote.id);
              const procesadas = proceso ? totalProcesadas(proceso.metricas) : 0;
              return (
                <li key={lote.id} className="flex flex-col gap-1.5 rounded-lg bg-superficie-2/60 p-3">
                  <span className="font-semibold">{lote.nombre}</span>
                  <span className="text-sm tabular-nums">
                    Subidas: {lote.subidas} de {lote.total}
                  </span>
                  <Barra valor={lote.subidas} maximo={lote.total} etiqueta={`Subida de ${lote.nombre}`} />
                  <span className="text-sm tabular-nums">
                    Procesadas: {procesadas} de {lote.total}
                  </span>
                  <Barra
                    valor={procesadas}
                    maximo={lote.total}
                    etiqueta={`Procesamiento de ${lote.nombre}`}
                    tono="bueno"
                  />
                </li>
              );
            })}
          </ul>
          <ResumenEnVivo procesos={procesosDeLaSubida} />
        </Tarjeta>
      )}

      {fallos.length > 0 && !subiendo && (
        <Tarjeta tono="peligro">
          <p role="alert" className="font-semibold text-malo">
            ✕ {fallos.length} archivo(s) no se pudieron subir:
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {fallos.map((fallo) => (
              <li key={fallo.archivo.name}>
                {fallo.archivo.name}: {fallo.motivo}
              </li>
            ))}
          </ul>
          <button type="button" onClick={reintentar} className={`self-start ${CLASE_BOTON}`}>
            Reintentar esos archivos
          </button>
        </Tarjeta>
      )}

      <Tarjeta titulo="Lotes">
        <ListaProcesos procesos={datos?.procesos ?? []} />
      </Tarjeta>
    </div>
  );
}
