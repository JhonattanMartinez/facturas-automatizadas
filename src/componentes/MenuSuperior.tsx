"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cargarPagina } from "@/lib/navegacion";
import { Motor } from "./Motor";
import { Logotipo } from "./ui";

const ENLACES = [
  { ruta: "/", texto: "Procesar facturas" },
  { ruta: "/revision", texto: "Revisión" },
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
    <header className="sticky top-0 z-10 border-b border-borde bg-superficie/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Logotipo />
          <span className="font-bold tracking-tight">Procesador de facturas</span>
        </Link>

        <nav className="flex flex-wrap gap-1">
          {ENLACES.map(({ ruta, texto }) => {
            const activo = ruta === "/" ? rutaActual === "/" : rutaActual.startsWith(ruta);
            return (
              <Link
                key={ruta}
                href={ruta}
                aria-current={activo ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  activo
                    ? "bg-acento-suave text-acento-fuerte"
                    : "text-secundario hover:bg-superficie-2 hover:text-foreground"
                }`}
              >
                {texto}
              </Link>
            );
          })}
        </nav>

        <Motor />

        <div className="ml-auto flex items-center gap-3 text-sm">
          {correo && (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-acento text-sm font-bold uppercase text-sobre-acento"
              >
                {correo[0]}
              </span>
              <span className="hidden text-secundario md:inline">{correo}</span>
            </span>
          )}
          <button
            type="button"
            onClick={cerrarSesion}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 font-medium text-secundario transition hover:bg-superficie-2 hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
