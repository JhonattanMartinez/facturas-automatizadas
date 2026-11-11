"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResumenProceso } from "@/lib/procesamiento/metricas";

export const EVENTO_LOTE_INICIADO = "lote-iniciado";
export const EVENTO_LOTE_TERMINADO = "lote-terminado";

const INTERVALO_MS = 8000;

export type DatosMetricas = { procesos: ResumenProceso[]; clientes: number };

export function useMetricas() {
  const [datos, setDatos] = useState<DatosMetricas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/metricas");
      if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
      setDatos((await respuesta.json()) as DatosMetricas);
      setError(null);
    } catch {
      setError("No se pudieron cargar las métricas.");
    }
  }, []);

  useEffect(() => {
    const primera = setTimeout(() => void recargar(), 0);
    const alCambiar = () => void recargar();
    window.addEventListener(EVENTO_LOTE_INICIADO, alCambiar);
    window.addEventListener(EVENTO_LOTE_TERMINADO, alCambiar);
    return () => {
      clearTimeout(primera);
      window.removeEventListener(EVENTO_LOTE_INICIADO, alCambiar);
      window.removeEventListener(EVENTO_LOTE_TERMINADO, alCambiar);
    };
  }, [recargar]);

  // Solo se consulta si hay algo en curso y la pestaña se ve: cada consulta gasta cuota.
  const hayActivos = datos?.procesos.some((p) => p.estado === "ejecutando") ?? false;
  useEffect(() => {
    if (!hayActivos) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") void recargar();
    }, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [hayActivos, recargar]);

  return { datos, error, recargar };
}
