import { ListaRevision } from "@/componentes/ListaRevision";

export default function Revision() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Revisión manual</h1>
      <ListaRevision />
    </main>
  );
}
