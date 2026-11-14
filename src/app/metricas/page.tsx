import { BorrarTodo } from "@/componentes/BorrarTodo";
import { PanelMetricas } from "@/componentes/PanelMetricas";
import { EncabezadoPagina } from "@/componentes/ui";

export default function Metricas() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8">
      <EncabezadoPagina
        titulo="Métricas"
        descripcion="Qué tan bien leyó la máquina, lo procesado y el detalle por proveedor y por lote."
      />
      <PanelMetricas />
      <div className="flex w-full max-w-6xl flex-col">
        <BorrarTodo />
      </div>
    </main>
  );
}
