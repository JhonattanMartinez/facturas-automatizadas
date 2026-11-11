"use client";

import Link from "next/link";
import { useState } from "react";
import {
  calcularTasas,
  proveedoresOrdenados,
  sumarMetricas,
} from "@/lib/procesamiento/metricas";
import { formatoEntero, formatoPesos, formatoPorcentaje } from "./formato";
import {
  Barra,
  CLASE_CAMPO,
  CLASE_ENLACE,
  Dato,
  Estado,
  estadoDeLote,
  Tabla,
  Tarjeta,
} from "./ui";
import { useMetricas } from "./useMetricas";

function Medidor({
  titulo,
  tono,
  porcentaje,
  cantidad,
  total,
}: {
  titulo: string;
  tono: "bueno" | "malo";
  porcentaje: number;
  cantidad: number;
  total: number;
}) {
  return (
    <Tarjeta>
      <Estado tono={tono} texto={titulo} />
      <span className="text-3xl font-semibold tabular-nums">{formatoPorcentaje(porcentaje)}</span>
      <Barra valor={cantidad} maximo={total} etiqueta={titulo} tono={tono} />
      <span className="text-sm tabular-nums text-secundario">
        {formatoEntero(cantidad)} de {formatoEntero(total)} facturas
      </span>
    </Tarjeta>
  );
}

export function PanelMetricas() {
  const { datos, error } = useMetricas();
  const [seleccion, setSeleccion] = useState("todos");

  if (!datos) {
    return error ? (
      <p role="alert" className="text-malo">
        ✕ {error}
      </p>
    ) : (
      <p className="text-secundario">Cargando…</p>
    );
  }

  const lotes =
    seleccion === "todos"
      ? datos.procesos
      : datos.procesos.filter((proceso) => proceso.id === seleccion);
  const metricas = sumarMetricas(lotes.map((proceso) => proceso.metricas));
  const tasas = calcularTasas(metricas);
  const proveedores = proveedoresOrdenados(metricas);
  const mayorTotal = proveedores[0]?.total ?? 0;
  const { aceptadas, revision, errores } = metricas;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      <label className="flex flex-wrap items-center gap-2">
        Ver
        <select
          value={seleccion}
          onChange={(e) => setSeleccion(e.target.value)}
          className={CLASE_CAMPO}
        >
          <option value="todos">Todos los lotes</option>
          {datos.procesos.map((proceso, i) => (
            <option key={proceso.id} value={proceso.id}>
              Lote {i + 1}: {proceso.carpeta}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Medidor
          titulo="Leídas correctamente"
          tono="bueno"
          porcentaje={tasas.pctCorrectas}
          cantidad={tasas.correctas}
          total={tasas.distintas}
        />
        <Medidor
          titulo="Mal leídas (a revisión)"
          tono="malo"
          porcentaje={tasas.pctMalas}
          cantidad={tasas.malas}
          total={tasas.distintas}
        />
      </div>
      <p className="text-sm text-secundario">
        «Leída correctamente» significa que pasó todas las validaciones; no se compara con una
        respuesta conocida, así que un error que cuadre aritméticamente podría pasar. «Mal leída»
        significa que quedó en revisión o dio error. Los porcentajes son sobre facturas distintas:
        las duplicadas no cuentan porque ya estaban.
      </p>

      <Tarjeta>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Dato etiqueta="Facturas procesadas" valor={formatoEntero(tasas.distintas)} />
          <Dato etiqueta="Duplicadas" valor={formatoEntero(metricas.duplicadas)} />
          <Dato etiqueta="Clientes en la base" valor={formatoEntero(datos.clientes)} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Lo procesado">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Antes de IVA" valor={formatoPesos(aceptadas.subtotal)} />
          <Dato etiqueta="IVA" valor={formatoPesos(aceptadas.iva)} />
          <Dato etiqueta="Impoconsumo" valor={formatoPesos(aceptadas.impoconsumo)} />
          <Dato etiqueta="Total" valor={formatoPesos(aceptadas.total)} />
        </div>
        <p className="text-sm text-secundario">
          Solo facturas aceptadas. {formatoEntero(revision.n + errores)} en revisión o con error no
          están incluidas.
        </p>
      </Tarjeta>

      <Tarjeta titulo="Por razón social">
        <p className="text-sm text-secundario">
          Se agrupa por NIT. Si el OCR leyó el nombre de varias formas, se muestra el más repetido.
        </p>
        <Tabla>
          <thead>
            <tr>
              <th>Razón social</th>
              <th>NIT</th>
              <th className="text-right">Facturas</th>
              <th className="text-right">Antes de IVA</th>
              <th className="text-right">IVA</th>
              <th className="text-right">Impoconsumo</th>
              <th className="text-right">Total</th>
              <th className="min-w-24">Peso</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.nit}>
                <td>{p.nombre}</td>
                <td className="tabular-nums">{p.nit}</td>
                <td className="text-right tabular-nums">{formatoEntero(p.n)}</td>
                <td className="text-right tabular-nums">{formatoPesos(p.subtotal)}</td>
                <td className="text-right tabular-nums">{formatoPesos(p.iva)}</td>
                <td className="text-right tabular-nums">{formatoPesos(p.impoconsumo)}</td>
                <td className="text-right tabular-nums">{formatoPesos(p.total)}</td>
                <td>
                  <Barra valor={p.total} maximo={mayorTotal} etiqueta={`Peso de ${p.nombre}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      <Tarjeta titulo="Por lote">
        <Tabla>
          <thead>
            <tr>
              <th>Lote</th>
              <th className="text-right">Correctas</th>
              <th className="text-right">Mal leídas</th>
              <th className="min-w-24">Proporción</th>
              <th className="text-right">Total aceptado</th>
              <th>Estado</th>
              <th>Enlaces</th>
            </tr>
          </thead>
          <tbody>
            {datos.procesos.map((proceso) => {
              const t = calcularTasas(proceso.metricas);
              return (
                <tr key={proceso.id}>
                  <td>{proceso.carpeta}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {t.correctas} ({formatoPorcentaje(t.pctCorrectas)})
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {t.malas} ({formatoPorcentaje(t.pctMalas)})
                  </td>
                  <td>
                    <div
                      role="img"
                      aria-label={`${t.correctas} correctas y ${t.malas} mal leídas`}
                      className="flex h-2 overflow-hidden rounded bg-borde"
                    >
                      <div className="bg-bueno" style={{ width: `${t.pctCorrectas}%` }} />
                      <div className="bg-malo" style={{ width: `${t.pctMalas}%` }} />
                    </div>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatoPesos(proceso.metricas.aceptadas.total)}
                  </td>
                  <td>{estadoDeLote(proceso.estado)}</td>
                  <td className="whitespace-nowrap">
                    <Link href={`/procesos/${proceso.id}`} className={CLASE_ENLACE}>
                      Detalle
                    </Link>
                    {proceso.rutaExcel && (
                      <>
                        {" · "}
                        <a href={`/api/procesos/${proceso.id}/excel`} className={CLASE_ENLACE}>
                          Excel
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      </Tarjeta>
    </div>
  );
}
