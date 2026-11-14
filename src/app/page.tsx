import { NuevoProceso } from "@/componentes/NuevoProceso";
import { EncabezadoPagina } from "@/componentes/ui";

export default function Inicio() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8">
      <EncabezadoPagina
        titulo="Procesar facturas"
        descripcion="Sube una carpeta y la aplicación leerá, validará y guardará cada factura."
        ancho="max-w-4xl"
      />
      <NuevoProceso />
    </main>
  );
}
