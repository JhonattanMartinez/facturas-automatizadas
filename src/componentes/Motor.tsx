"use client";

import { useEffect, useState } from "react";
import { EVENTO_LOTE_INICIADO, EVENTO_LOTE_TERMINADO } from "./useMetricas";

const TRABAJADORES = 3;
const ESPERA_REINTENTO_FINALIZAR_MS = 5000;
const ESPERA_SIN_TRABAJO_MS = 2000;
const ESPERA_MINIMA_ERROR_MS = 1000;
const ESPERA_MAXIMA_ERROR_MS = 30000;

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Pide al servidor que procese los lotes. Vive en el menú, que no se desmonta al cambiar de
 * página, así que el trabajo sigue mientras navegas. Tres trabajadores son tres invocaciones
 * simultáneas: el paralelismo real, porque cada función de Vercel tiene una sola CPU.
 */
export function Motor() {
  const [activos, setActivos] = useState(0);

  useEffect(() => {
    let detenido = false;
    // Lotes en curso y el momento a partir del cual vale la pena volver a mirarlos.
    const lotes = new Map<string, number>();

    const agregar = (id: string) => {
      if (lotes.has(id)) return;
      lotes.set(id, 0);
      setActivos(lotes.size);
    };
    const quitar = (id: string) => {
      lotes.delete(id);
      setActivos(lotes.size);
    };
    const alIniciar = (evento: Event) => agregar((evento as CustomEvent<string>).detail);

    const elegir = (): string | null => {
      const ahora = Date.now();
      for (const [id, noAntesDe] of lotes) {
        if (noAntesDe <= ahora) return id;
      }
      return null;
    };

    async function intentarFinalizar(id: string): Promise<void> {
      const respuesta = await fetch(`/api/procesos/${id}/finalizar`, { method: "POST" });
      if (respuesta.status === 404) return quitar(id);
      if (!respuesta.ok) throw new Error(`finalizar respondió ${respuesta.status}`);
      const { listo } = (await respuesta.json()) as { listo: boolean };
      if (listo) {
        quitar(id);
        window.dispatchEvent(new CustomEvent(EVENTO_LOTE_TERMINADO, { detail: id }));
      } else {
        // Otra llamada aún procesa archivos, o una reserva debe caducar: se vuelve a mirar luego.
        lotes.set(id, Date.now() + ESPERA_REINTENTO_FINALIZAR_MS);
      }
    }

    async function trabajador(): Promise<void> {
      let esperaError = ESPERA_MINIMA_ERROR_MS;
      while (!detenido) {
        const id = elegir();
        if (!id) {
          await dormir(ESPERA_SIN_TRABAJO_MS);
          continue;
        }
        try {
          const respuesta = await fetch(`/api/procesos/${id}/lote`, { method: "POST" });
          if (respuesta.status === 404) {
            quitar(id); // el lote se borró
            continue;
          }
          if (respuesta.status === 401) {
            detenido = true; // la sesión caducó: el menú lleva al inicio de sesión
            return;
          }
          if (!respuesta.ok) throw new Error(`lote respondió ${respuesta.status}`);
          const { reclamados } = (await respuesta.json()) as { reclamados: number };
          if (reclamados === 0) await intentarFinalizar(id);
          esperaError = ESPERA_MINIMA_ERROR_MS;
        } catch {
          await dormir(esperaError);
          esperaError = Math.min(esperaError * 2, ESPERA_MAXIMA_ERROR_MS);
        }
      }
    }

    // Retoma los lotes que quedaron a medias, por ejemplo si se cerró la pestaña.
    async function descubrir(): Promise<void> {
      try {
        const respuesta = await fetch("/api/procesos?estado=ejecutando");
        if (!respuesta.ok) return;
        const { procesos } = (await respuesta.json()) as { procesos: { id: string }[] };
        procesos.forEach((proceso) => agregar(proceso.id));
      } catch {
        // Sin red no hay nada que retomar; el siguiente lote que se inicie vuelve a activarlo.
      }
    }

    window.addEventListener(EVENTO_LOTE_INICIADO, alIniciar);
    void descubrir();
    for (let i = 0; i < TRABAJADORES; i++) void trabajador();

    return () => {
      detenido = true;
      window.removeEventListener(EVENTO_LOTE_INICIADO, alIniciar);
    };
  }, []);

  if (activos === 0) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 rounded-full bg-aviso-suave px-3 py-1 text-xs font-semibold text-aviso"
    >
      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-aviso" />
      Procesando {activos} {activos === 1 ? "lote" : "lotes"}…
    </span>
  );
}
