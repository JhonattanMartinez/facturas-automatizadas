import { NuevoProceso } from "@/componentes/NuevoProceso";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-8">
      <h1 className="w-full max-w-4xl text-2xl font-semibold">Procesar facturas</h1>
      <NuevoProceso />
    </main>
  );
}
