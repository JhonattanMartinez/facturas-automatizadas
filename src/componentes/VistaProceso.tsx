"use client";

import { useEffect, useState } from "react";
import { totalProcesadas, type ResumenProceso } from "@/lib/procesamiento/metricas";
import { formatoFechaHora, formatoPesos } from "./formato";
import { ResumenEnVivo } from "./ResumenEnVivo";
import { Barra, CLASE_CAMPO, CLASE_ENLACE, Estado, estadoDeLote, Tabla, Tarjeta } from "./ui";

const INTERVALO_MS = 4000;

type FilaFactura = {
  hash: string;
  archivo: string;
  numero: string | null;
  fecha: string | null;
  proveedor: string | null;
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  estado: "aceptada" | "revision";
  motivos: string[];
};

type Filtro = "todas" | "aceptada" | "revision";

export function VistaProceso({ id }: { id: string }) {
  const [proceso, setProceso] = useState<ResumenProceso | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [facturas, setFacturas] = useState<FilaFactura[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  useEffect(() => {
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout>;

    async function consultar() {
      try {
        const respuesta = await fetch(`/api/procesos/${id}`);
        if (!vigente) return;
        if (respuesta.status === 404) {
          setNoExiste(true);
          return;
        }
        if (respuesta.ok) {
          const datos = (await respuesta.json()) as ResumenProceso;
          if (!vigente) return;
          setProceso(datos);
          if (datos.estado === "terminado") return; // ya no va a cambiar
        }
      } catch {
        // Una falla de red pasajera: se reintenta en el siguiente ciclo.
      }
      temporizador = setTimeout(esperarVisible, INTERVALO_MS);
    }

    // Una pestaña oculta no consulta: cada consulta gasta cuota.
    function esperarVisible() {
      if (document.visibilityState === "visible") void consultar();
      else temporizador = setTimeout(esperarVisible, INTERVALO_MS);
    }

    void consultar();
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [id]);

  const terminado = proceso?.estado === "terminado";

  // La lista cuesta unas 2 lecturas por factura: se pide una sola vez, cuando el lote termina.
  useEffect(() => {
    if (!terminado) return;
    let vigente = true;
    async function cargar() {
      const respuesta = await fetch(`/api/procesos/${id}/facturas`);
      if (!respuesta.ok) return;
      const datos = (await respuesta.json()) as { facturas: FilaFactura[] };
      if (vigente) setFacturas(datos.facturas);
    }
    void cargar();
    return () => {
      vigente = false;
    };
  }, [id, terminado]);

  if (noExiste) return <p className="text-malo">✕ Este lote no existe o no es tuyo.</p>;
  if (!proceso) return <p className="text-secundario">Cargando…</p>;

  const procesadas = totalProcesadas(proceso.metricas);
  const visibles = (facturas ?? []).filter((f) => filtro === "todas" || f.estado === filtro);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <Tarjeta titulo={proceso.carpeta}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          {estadoDeLote(proceso.estado)}
          <span className="text-sm text-secundario">
            Inicio: {formatoFechaHora(proceso.inicio)}
            {proceso.fin ? ` · Fin: ${formatoFechaHora(proceso.fin)}` : ""}
          </span>
          {proceso.rutaExcel && (
            <a href={`/api/procesos/${id}/excel`} className={CLASE_ENLACE}>
              Descargar Excel
            </a>
          )}
        </div>
        <span className="text-sm tabular-nums">
          Procesadas: {procesadas} de {proceso.totalArchivos}
        </span>
        <Barra valor={procesadas} maximo={proceso.totalArchivos} etiqueta="Avance del lote" tono="bueno" />
        <ResumenEnVivo procesos={[proceso]} />
      </Tarjeta>

      {terminado && (
        <Tarjeta titulo="Facturas">
          <label className="flex flex-wrap items-center gap-2">
            Mostrar
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className={CLASE_CAMPO}
            >
              <option value="todas">Todas</option>
              <option value="aceptada">Aceptadas</option>
              <option value="revision">En revisión</option>
            </select>
          </label>
          {facturas === null ? (
            <p className="text-secundario">Cargando facturas…</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th className="text-right">Antes de IVA</th>
                  <th className="text-right">IVA</th>
                  <th className="text-right">Impoconsumo</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th>Imagen</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.hash}>
                    <td className="whitespace-nowrap">{f.archivo}</td>
                    <td className="whitespace-nowrap">{f.numero ?? "—"}</td>
                    <td className="whitespace-nowrap">{f.fecha ?? "—"}</td>
                    <td>{f.proveedor ?? "—"}</td>
                    <td className="text-right tabular-nums">{formatoPesos(f.subtotal)}</td>
                    <td className="text-right tabular-nums">{formatoPesos(f.iva)}</td>
                    <td className="text-right tabular-nums">{formatoPesos(f.impoconsumo)}</td>
                    <td className="text-right tabular-nums">{formatoPesos(f.total)}</td>
                    <td>
                      {f.estado === "aceptada" ? (
                        <Estado tono="bueno" texto="Aceptada" />
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Estado tono="malo" texto="En revisión" />
                          <span className="text-xs text-secundario">{f.motivos.join("; ")}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <a
                        href={`/api/facturas/${f.hash}/imagen`}
                        target="_blank"
                        rel="noreferrer"
                        className={CLASE_ENLACE}
                      >
                        Ver
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
