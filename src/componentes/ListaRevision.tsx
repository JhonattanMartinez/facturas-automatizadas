"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatoPesos } from "./formato";
import { CLASE_ENLACE, Tabla, Tarjeta } from "./ui";

type Pendiente = {
  hash: string;
  archivo: string;
  numero: string | null;
  proveedor: string | null;
  total: number | null;
  motivos: string[];
};

export function ListaRevision() {
  const [facturas, setFacturas] = useState<Pendiente[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      try {
        const respuesta = await fetch("/api/facturas");
        if (!respuesta.ok) throw new Error();
        const datos = (await respuesta.json()) as { facturas: Pendiente[] };
        if (vigente) setFacturas(datos.facturas);
      } catch {
        if (vigente) setError(true);
      }
    }
    void cargar();
    return () => {
      vigente = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-malo">
        ✕ No se pudo cargar la lista.
      </p>
    );
  }
  if (!facturas) return <p className="text-secundario">Cargando…</p>;
  if (facturas.length === 0) {
    return <p className="text-secundario">No hay facturas pendientes de revisión.</p>;
  }

  return (
    <Tarjeta titulo={`${facturas.length} facturas esperan a una persona`}>
      <Tabla>
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Número</th>
            <th>Proveedor</th>
            <th className="text-right">Total</th>
            <th>Motivos</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr key={f.hash}>
              <td className="whitespace-nowrap">{f.archivo}</td>
              <td className="whitespace-nowrap">{f.numero ?? "—"}</td>
              <td>{f.proveedor ?? "—"}</td>
              <td className="text-right tabular-nums">{formatoPesos(f.total)}</td>
              <td className="text-secundario">{f.motivos.join("; ")}</td>
              <td>
                <Link href={`/revision/${f.hash}`} className={CLASE_ENLACE}>
                  Revisar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Tarjeta>
  );
}
