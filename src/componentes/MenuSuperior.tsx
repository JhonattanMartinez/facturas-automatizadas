"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cargarPagina } from "@/lib/navegacion";
import { Motor } from "./Motor";

const ENLACES = [
  { ruta: "/", texto: "Procesar facturas" },
  { ruta: "/metricas", texto: "Métricas" },
];

export function MenuSuperior() {
  const rutaActual = usePathname();
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
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-borde bg-superficie px-4 py-3">
      <nav className="flex flex-wrap gap-4">
        {ENLACES.map(({ ruta, texto }) => {
          const activo = rutaActual === ruta;
          return (
            <Link
              key={ruta}
              href={ruta}
              aria-current={activo ? "page" : undefined}
              className={activo ? "font-semibold text-acento underline" : "text-foreground"}
            >
              {texto}
            </Link>
          );
        })}
      </nav>
      <Motor />
      <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
        {correo && <span className="text-secundario">{correo}</span>}
        <button type="button" onClick={cerrarSesion} className="cursor-pointer underline">
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
