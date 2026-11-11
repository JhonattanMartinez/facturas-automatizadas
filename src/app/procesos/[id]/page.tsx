import { Suspense } from "react";
import { VistaProceso } from "@/componentes/VistaProceso";

async function Contenido({ params }: { params: PageProps<"/procesos/[id]">["params"] }) {
  const { id } = await params;
  return <VistaProceso id={id} />;
}

// Con cacheComponents, lo que depende de la URL se lee dentro de un Suspense.
export default function Detalle({ params }: PageProps<"/procesos/[id]">) {
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-4 sm:p-8">
      <Suspense fallback={<p className="text-secundario">Cargando…</p>}>
        <Contenido params={params} />
      </Suspense>
    </main>
  );
}
