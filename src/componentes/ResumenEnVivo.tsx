import type { ResumenProceso } from "@/lib/procesamiento/metricas";
import {
  estadoRevision,
  importesProcesados,
  sumarMetricas,
} from "@/lib/procesamiento/metricas";
import { formatoEntero, formatoPesos } from "./formato";
import { Dato } from "./ui";

export function ResumenEnVivo({ procesos }: { procesos: ResumenProceso[] }) {
  const metricas = sumarMetricas(procesos.map((p) => p.metricas));
  const procesado = importesProcesados(metricas);
  const { pendientes } = estadoRevision(metricas);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Antes de IVA" valor={formatoPesos(procesado.subtotal)} />
        <Dato etiqueta="IVA" valor={formatoPesos(procesado.iva)} />
        <Dato etiqueta="Impoconsumo" valor={formatoPesos(procesado.impoconsumo)} />
        <Dato etiqueta="Total" valor={formatoPesos(procesado.total)} />
      </div>
      <p className="text-sm text-secundario">
        Cifras de {formatoEntero(procesado.n)} facturas: las aceptadas y las revisadas a mano.{" "}
        {formatoEntero(pendientes)} pendientes de revisión no están incluidas.
      </p>
    </div>
  );
}
