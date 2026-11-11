import { EstadoSesion } from "@/componentes/EstadoSesion";
import { NuevoProceso } from "@/componentes/NuevoProceso";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Procesador de facturas</h1>
      <EstadoSesion />
      <NuevoProceso />
    </main>
  );
}
