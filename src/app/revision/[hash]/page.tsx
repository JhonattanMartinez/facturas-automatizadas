import { Suspense } from "react";
import { FormularioFactura } from "@/componentes/FormularioFactura";

async function Contenido({ params }: { params: PageProps<"/revision/[hash]">["params"] }) {
  const { hash } = await params;
  // key: sin ella, React reutiliza el formulario y conservaría los datos de la factura anterior.
  return <FormularioFactura key={hash} hash={hash} />;
}

export default function RevisarFactura({ params }: PageProps<"/revision/[hash]">) {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-8">
      <Suspense fallback={<p className="text-secundario">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
