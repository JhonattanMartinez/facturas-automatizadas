"use client";

import { useEffect, useState } from "react";
import { cargarPagina } from "@/lib/navegacion";

export function EstadoSesion() {
  const [correo, setCorreo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      const respuesta = await fetch("/api/sesion");
      // El proxy solo mira si hay cookie; una cookie caducada se detecta aquí.
      if (respuesta.status === 401) {
        cargarPagina("/login");
        return;
      }
      if (!respuesta.ok) return;
      const datos = (await respuesta.json()) as { email: string };
      if (vigente) setCorreo(datos.email);
    }
    void cargar();
    return () => {
      vigente = false;
    };
  }, []);

  async function cerrarSesion() {
    await fetch("/api/sesion", { method: "DELETE" });
    cargarPagina("/login");
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {correo && <span>Sesión iniciada como {correo}</span>}
      <button type="button" onClick={cerrarSesion} className="underline">
        Cerrar sesión
      </button>
    </div>
  );
}
