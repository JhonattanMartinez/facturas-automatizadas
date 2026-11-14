import type { ReactNode } from "react";

const BASE_BOTON =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento disabled:cursor-not-allowed disabled:opacity-50";

export const CLASE_BOTON = `${BASE_BOTON} border border-borde bg-superficie text-foreground shadow-sm hover:border-acento hover:text-acento focus-within:ring-2 focus-within:ring-acento/40`;
export const CLASE_BOTON_PRINCIPAL = `${BASE_BOTON} bg-acento text-sobre-acento shadow-sm hover:bg-acento-fuerte`;
export const CLASE_BOTON_PELIGRO = `${BASE_BOTON} border border-malo/40 bg-malo-suave text-malo hover:border-malo`;
export const CLASE_CAMPO =
  "rounded-lg border border-borde bg-superficie px-3 py-2 text-foreground shadow-sm outline-none transition focus:border-acento focus:ring-2 focus:ring-acento/30";
export const CLASE_ENLACE =
  "font-medium text-acento underline-offset-2 hover:text-acento-fuerte hover:underline";

export function EncabezadoPagina({
  titulo,
  descripcion,
  ancho = "max-w-6xl",
}: {
  titulo: string;
  descripcion?: string;
  ancho?: string;
}) {
  return (
    <header className={`flex w-full flex-col gap-1 ${ancho}`}>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
      {descripcion && <p className="text-secundario">{descripcion}</p>}
    </header>
  );
}

export function Tarjeta({
  titulo,
  subtitulo,
  children,
  tono = "normal",
}: {
  titulo?: string;
  subtitulo?: string;
  children: ReactNode;
  tono?: "normal" | "peligro";
}) {
  const borde = tono === "peligro" ? "border-malo/40" : "border-borde";
  return (
    <section
      className={`flex flex-col gap-4 rounded-xl border ${borde} bg-superficie p-5 shadow-tarjeta`}
    >
      {(titulo || subtitulo) && (
        <div className="flex flex-col gap-0.5">
          {titulo && <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>}
          {subtitulo && <p className="text-sm text-secundario">{subtitulo}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-superficie-2 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-secundario">
        {etiqueta}
      </span>
      <span className="text-xl font-bold tabular-nums">{valor}</span>
    </div>
  );
}

/** Lo bueno y lo malo llevan icono y texto: el color solo no basta. */
export function Estado({
  tono,
  texto,
}: {
  tono: "bueno" | "malo" | "neutro";
  texto: string;
}) {
  const estilos = {
    bueno: { icono: "✓", clase: "bg-bueno-suave text-bueno" },
    malo: { icono: "✕", clase: "bg-malo-suave text-malo" },
    neutro: { icono: "●", clase: "bg-aviso-suave text-aviso" },
  }[tono];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${estilos.clase}`}
    >
      <span aria-hidden="true">{estilos.icono}</span>
      {texto}
    </span>
  );
}

export function Barra({
  valor,
  maximo,
  etiqueta,
  tono = "acento",
}: {
  valor: number;
  maximo: number;
  etiqueta: string;
  tono?: "acento" | "bueno" | "malo";
}) {
  const porcentaje = maximo > 0 ? Math.min(100, (valor / maximo) * 100) : 0;
  const color = { acento: "bg-acento", bueno: "bg-bueno", malo: "bg-malo" }[tono];
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={maximo}
      className="h-2 w-full overflow-hidden rounded-full bg-superficie-2"
    >
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-500`}
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  );
}

/** Las tablas largas hacen scroll dentro de su caja, no en toda la página. */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde">
      <table className="w-full border-collapse text-sm [&_tbody_tr:hover]:bg-acento-suave/40 [&_tbody_tr:nth-child(even)]:bg-superficie-2/60 [&_td]:border-t [&_td]:border-borde [&_td]:px-3 [&_td]:py-2.5 [&_th]:bg-superficie-2 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-secundario">
        {children}
      </table>
    </div>
  );
}

export function estadoDeLote(estado: string) {
  if (estado === "terminado") return <Estado tono="bueno" texto="Terminado" />;
  if (estado === "ejecutando") return <Estado tono="neutro" texto="Procesando" />;
  return <Estado tono="neutro" texto="Subiendo" />;
}

/** El símbolo de la aplicación: una factura con una marca de verificación. */
export function Logotipo({ tamano = 32 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--acento)" />
      <path d="M10 7h9l4 4v14H10z" fill="var(--sobre-acento)" opacity="0.95" />
      <path d="M19 7v4h4" fill="none" stroke="var(--acento)" strokeWidth="1.4" />
      <path
        d="M13 18.5l2.4 2.4 4.6-5"
        fill="none"
        stroke="var(--acento)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
