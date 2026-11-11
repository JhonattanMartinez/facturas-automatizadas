import Link from "next/link";
import { totalProcesadas, type ResumenProceso } from "@/lib/procesamiento/metricas";
import { formatoFechaHora } from "./formato";
import { CLASE_ENLACE, estadoDeLote, Tabla } from "./ui";

export function ListaProcesos({ procesos }: { procesos: ResumenProceso[] }) {
  if (procesos.length === 0) {
    return <p className="text-secundario">Todavía no hay lotes.</p>;
  }
  const recientes = [...procesos].sort((a, b) => b.inicio - a.inicio);
  return (
    <Tabla>
      <thead>
        <tr>
          <th>Lote</th>
          <th>Inicio</th>
          <th>Avance</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {recientes.map((proceso) => (
          <tr key={proceso.id}>
            <td>
              <Link href={`/procesos/${proceso.id}`} className={CLASE_ENLACE}>
                {proceso.carpeta}
              </Link>
            </td>
            <td className="whitespace-nowrap">{formatoFechaHora(proceso.inicio)}</td>
            <td className="whitespace-nowrap tabular-nums">
              {totalProcesadas(proceso.metricas)} de {proceso.totalArchivos}
            </td>
            <td>{estadoDeLote(proceso.estado)}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}
