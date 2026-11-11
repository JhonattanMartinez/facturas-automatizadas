import type { ReactNode } from "react";

export const CLASE_BOTON =
  "inline-block cursor-pointer rounded border border-borde bg-superficie px-3 py-2 font-medium focus-within:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
export const CLASE_BOTON_PRINCIPAL =
  "cursor-pointer rounded bg-acento px-3 py-2 font-medium text-sobre-acento disabled:cursor-not-allowed disabled:opacity-50";
export const CLASE_CAMPO =
  "rounded border border-borde bg-superficie px-2 py-1";
export const CLASE_ENLACE = "text-acento underline";

export function Tarjeta({
  titulo,
  children,
}: {
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4">
      {titulo && <h2 className="text-lg font-semibold">{titulo}</h2>}
      {children}
    </section>
  );
}

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-secundario">{etiqueta}</span>
      <span className="text-xl font-semibold tabular-nums">{valor}</span>
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
    bueno: { icono: "✓", color: "text-bueno" },
    malo: { icono: "✕", color: "text-malo" },
    neutro: { icono: "…", color: "text-secundario" },
  }[tono];
  return (
    <span className={`whitespace-nowrap font-medium ${estilos.color}`}>
      <span aria-hidden="true">{estilos.icono}</span> {texto}
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
      className="h-2 w-full overflow-hidden rounded bg-borde"
    >
      <div className={`h-full ${color}`} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

/** Las tablas largas hacen scroll dentro de su caja, no en toda la página. */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-borde [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold">
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
