import { BorrarTodo } from "@/componentes/BorrarTodo";
import { PanelMetricas } from "@/componentes/PanelMetricas";

export default function Metricas() {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-8">
      <h1 className="w-full max-w-6xl text-2xl font-semibold">Métricas</h1>
      <PanelMetricas />
      <div className="flex w-full max-w-6xl flex-col">
        <BorrarTodo />
      </div>
    </main>
  );
}
