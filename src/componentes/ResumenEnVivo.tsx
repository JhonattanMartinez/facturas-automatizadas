import type { ResumenProceso } from "@/lib/procesamiento/metricas";
import { sumarMetricas } from "@/lib/procesamiento/metricas";
import { formatoEntero, formatoPesos } from "./formato";
import { Dato } from "./ui";

export function ResumenEnVivo({ procesos }: { procesos: ResumenProceso[] }) {
  const { aceptadas, revision, errores } = sumarMetricas(procesos.map((p) => p.metricas));
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Antes de IVA" valor={formatoPesos(aceptadas.subtotal)} />
        <Dato etiqueta="IVA" valor={formatoPesos(aceptadas.iva)} />
        <Dato etiqueta="Impoconsumo" valor={formatoPesos(aceptadas.impoconsumo)} />
        <Dato etiqueta="Total" valor={formatoPesos(aceptadas.total)} />
      </div>
      <p className="text-sm text-secundario">
        Cifras de {formatoEntero(aceptadas.n)} facturas aceptadas.{" "}
        {formatoEntero(revision.n + errores)} en revisión no están incluidas.
      </p>
    </div>
  );
}
