import { ListaRevision } from "@/componentes/ListaRevision";
import { EncabezadoPagina } from "@/componentes/ui";

export default function Revision() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-8">
      <EncabezadoPagina
        titulo="Revisión manual"
        descripcion="Las facturas que la máquina no pudo aceptar. Una persona las revisa con la imagen al lado."
      />
      <div className="w-full max-w-6xl">
        <ListaRevision />
      </div>
    </main>
  );
}
