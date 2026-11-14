"use client";

import { useState } from "react";
import { cargarPagina } from "@/lib/navegacion";
import { CLASE_BOTON, CLASE_BOTON_PELIGRO, CLASE_CAMPO, Tarjeta } from "./ui";

const PALABRA = "BORRAR";

export function BorrarTodo() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [hayActivos, setHayActivos] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permitido = texto === PALABRA && (!hayActivos || forzar) && !borrando;

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/datos/borrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmacion: texto, forzar }),
      });
      if (respuesta.ok) {
        cargarPagina("/");
        return;
      }
      if (respuesta.status === 409) {
        setHayActivos(true);
        return;
      }
      setError(`No se pudo borrar (error ${respuesta.status}).`);
    } catch {
      setError("No se pudo borrar: falla de red.");
    } finally {
      setBorrando(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`self-start ${CLASE_BOTON_PELIGRO}`}>
        Borrar todos los datos…
      </button>
    );
  }

  return (
    <Tarjeta titulo="Borrar todos los datos" tono="peligro">
      <p className="rounded-lg bg-malo-suave px-3 py-2 text-sm text-malo">
        ✕ Esto borra todas las facturas, clientes, lotes, imágenes y Excel, de todos los usuarios.
        No se puede deshacer y gasta el límite diario de borrados de Firestore.
      </p>
      <label className="flex flex-col gap-1">
        Escribe {PALABRA} para confirmar
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoComplete="off"
          className={`max-w-xs ${CLASE_CAMPO}`}
        />
      </label>
      {hayActivos && (
        <label className="flex items-center gap-2 text-malo">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
          Hay lotes procesándose. Borrar de todos modos.
        </label>
      )}
      {error && (
        <p role="alert" className="text-malo">
          ✕ {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={borrar} disabled={!permitido} className={CLASE_BOTON_PELIGRO}>
          {borrando ? "Borrando…" : "Borrar definitivamente"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={CLASE_BOTON}>
          Cancelar
        </button>
      </div>
    </Tarjeta>
  );
}
