// Fase 6: prueba de servidor contra Firestore y Supabase reales, sin pasar por HTTP.
// Crea sus propios lotes y al terminar borra solo lo que ellos crearon.
// Uso: npx tsx scripts/probar-pipeline.ts <carpetaImágenes>
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp } from "firebase-admin/app";
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { descargar, eliminar, subir } from "@/lib/almacenamiento";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type ArchivoCola,
  type Factura,
  type Proceso,
} from "@/lib/modelo/tipos";
import { cerrarMotor } from "@/lib/ocr/motor";
import { reclamar } from "@/lib/procesamiento/cola";
import { finalizarProceso } from "@/lib/procesamiento/finalizar";
import { guardarFactura } from "@/lib/procesamiento/guardar";
import { iniciarProceso } from "@/lib/procesamiento/iniciar";
import { procesarLote, type ResumenLote } from "@/lib/procesamiento/lote";
import { metricasVacias } from "@/lib/procesamiento/metricas";
import { recalcularMetricas } from "@/lib/procesamiento/metricas-firestore";
import { analizarExcel, crearComprobador, limpiarLote } from "./comun";

const UID = "prueba-pipeline";
type Imagen = { nombre: string; bytes: Buffer };

const { comprobar, fallos } = crearComprobador();
const creados: string[] = [];

async function crearLote(carpeta: string, imagenes: Imagen[]): Promise<DocumentReference> {
  const proceso: Proceso = {
    uid: UID,
    carpeta,
    estado: "subiendo",
    totalArchivos: imagenes.length,
    inicio: Timestamp.now(),
    fin: null,
    rutaExcel: null,
    finalizandoDesde: null,
  };
  const referencia = await baseDeDatos().collection(COLECCIONES.procesos).add(proceso);
  creados.push(referencia.id);
  let indice = 1;
  for (const { nombre, bytes } of imagenes) {
    const numero = String(indice++).padStart(4, "0");
    await subir(`procesos/${referencia.id}/${numero}-${nombre}`, bytes, "image/png");
  }
  return referencia;
}

const delUsuario = async (referencia: DocumentReference) => ({
  referencia,
  datos: (await referencia.get()).data() as Proceso,
});

/** Lanza varias tandas simultáneas hasta vaciar la cola, como hará el motor del navegador. */
async function vaciarCola(referencia: DocumentReference, simultaneas: number) {
  const total: Omit<ResumenLote, "ms"> = {
    reclamados: 0, aceptadas: 0, revision: 0, duplicadas: 0, errores: 0, reintentos: 0, devueltos: 0,
  };
  await Promise.all(
    Array.from({ length: simultaneas }, async () => {
      for (;;) {
        const resumen = await procesarLote(referencia, UID);
        if (resumen.reclamados === 0) return;
        for (const clave of Object.keys(total) as (keyof typeof total)[]) {
          total[clave] += resumen[clave];
        }
      }
    }),
  );
  return total;
}

const cola = async (referencia: DocumentReference): Promise<ArchivoCola[]> =>
  (await referencia.collection(COLECCIONES.archivos).get()).docs.map(
    (d) => d.data() as ArchivoCola,
  );

const facturasDe = (id: string) =>
  baseDeDatos().collection(COLECCIONES.facturas).where("procesoId", "==", id).get();

const clientesDe = (id: string) =>
  baseDeDatos().collection(COLECCIONES.clientes).where("primerProcesoId", "==", id).get();

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const carpeta = process.argv[2];
  if (!carpeta) throw new Error("Indica la carpeta de imágenes");

  const nombres = (await readdir(carpeta)).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
  const elegir = (desde: number, cuantas: number, paso = 37) =>
    Promise.all(
      Array.from({ length: cuantas }, async (_, i) => {
        const nombre = nombres[desde + i * paso];
        return { nombre, bytes: await readFile(path.join(carpeta, nombre)) };
      }),
    );
  const principales = await elegir(30, 10);
  const caida = await elegir(5, 2, 1);
  const db = baseDeDatos();

  // Si estas facturas ya estuvieran en la base, los conteos no demostrarían nada.
  for (const { bytes } of [...principales, ...caida]) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    if ((await db.collection(COLECCIONES.facturas).doc(hash).get()).exists) {
      throw new Error("Las imágenes de prueba ya están en la base: abortado sin cambiar nada");
    }
  }

  try {
    console.log("--- 1. Lote normal con 3 tandas simultáneas");
    const a = await crearLote("prueba-a", principales);
    comprobar("iniciar crea la cola", 10, (await iniciarProceso(await delUsuario(a))).archivos);
    await iniciarProceso(await delUsuario(a));
    comprobar("repetir iniciar no duplica la cola", 10, (await cola(a)).length);

    const resumenA = await vaciarCola(a, 3);
    const colaA = await cola(a);
    comprobar("ningún archivo se procesó dos veces", true, colaA.every((x) => x.intentos === 1));
    comprobar("todos terminaron", true, colaA.every((x) => x.estado === "ok"));
    comprobar("aceptadas + revisión", 10, resumenA.aceptadas + resumenA.revision);
    console.log(`      aceptadas ${resumenA.aceptadas}, revisión ${resumenA.revision}`);
    comprobar("finalizar", true, (await finalizarProceso(await delUsuario(a))).listo);
    comprobar("estado del lote", "terminado", (await delUsuario(a)).datos.estado);

    const facturasA = await facturasDe(a.id);
    comprobar("facturas guardadas", 10, facturasA.size);
    const clientesNuevos = colaA.filter((x) => x.clienteNuevo).length;
    const clientesA = await clientesDe(a.id);
    comprobar("clientes creados = los anotados en la cola", clientesNuevos, clientesA.size);

    const aceptadas = facturasA.docs.map((d) => d.data() as Factura).filter((f) => f.estado === "aceptada");
    const sumaTotal = aceptadas.reduce((s, f) => s + (f.total ?? 0), 0);
    const sumaPartes = aceptadas.reduce(
      (s, f) => s + (f.subtotal ?? 0) + (f.iva ?? 0) + (f.impoconsumo ?? 0),
      0,
    );
    comprobar("la suma de totales cuadra con sus partes", sumaPartes, sumaTotal);
    for (const documento of facturasA.docs) {
      const numero = documento.get("numero") as string | null;
      if (!numero) continue;
      const indice = await db.collection(COLECCIONES.indicesNumero).doc(numero).get();
      comprobar(`índice ${numero} apunta a su factura`, documento.id, indice.get("hashArchivo"));
    }

    console.log("--- Excel del lote");
    const excelA = await analizarExcel(await descargar((await delUsuario(a)).datos.rutaExcel ?? ""));
    const todas = facturasA.docs.map((d) => d.data() as Factura);
    const sumaFirestore = todas.reduce((s, f) => s + (f.total ?? 0), 0);
    comprobar("hojas", "Facturas,Ítems,Clientes,Resumen", excelA.hojas);
    comprobar("filas de facturas", 10, excelA.filasFacturas);
    comprobar("filas de ítems", todas.reduce((s, f) => s + f.items.length, 0), excelA.filasItems);
    comprobar("suma de la columna Total = Firestore", sumaFirestore, excelA.sumaTotal);
    comprobar("los totales son números, no texto", true, excelA.totalesNumericos);
    comprobar("las fechas son fechas, no texto", true, excelA.fechasReales);

    console.log("--- Contadores del lote");
    const metricasDe = async (r: DocumentReference) => ({
      ...metricasVacias(),
      ...(await delUsuario(r)).datos.metricas,
    });
    const m = await metricasDe(a);
    comprobar("contador de aceptadas", resumenA.aceptadas, m.aceptadas.n);
    comprobar("contador de revisión", resumenA.revision, m.revision.n);
    comprobar("el total aceptado cuadra con las facturas", sumaTotal, m.aceptadas.total);
    comprobar("contador de clientes nuevos", clientesA.size, m.clientesNuevos);
    const porProveedor = Object.values(m.proveedores);
    comprobar("los proveedores suman las aceptadas", m.aceptadas.n, porProveedor.reduce((s, p) => s + p.n, 0));
    // Los nombres llevan puntos (S.A.S.): si se guardaran mal, se partirían en varios campos.
    comprobar(
      "los nombres se cuentan completos, con sus puntos",
      m.aceptadas.n,
      porProveedor.reduce((s, p) => s + Object.values(p.nombres).reduce((x, y) => x + y, 0), 0),
    );
    const recalculadas = await recalcularMetricas(a);
    comprobar("recalcular da el mismo total", m.aceptadas.total, recalculadas.aceptadas.total);
    comprobar("recalcular da los mismos proveedores", porProveedor.length, Object.keys(recalculadas.proveedores).length);

    console.log("--- 2. Reproceso: las mismas imágenes en otra ruta");
    const b = await crearLote("prueba-b", principales);
    await iniciarProceso(await delUsuario(b));
    const resumenB = await vaciarCola(b, 3);
    comprobar("duplicadas", 10, resumenB.duplicadas);
    await finalizarProceso(await delUsuario(b));
    const excelB = await analizarExcel(await descargar((await delUsuario(b)).datos.rutaExcel ?? ""));
    comprobar("contador de duplicadas", 10, (await metricasDe(b)).duplicadas);
    comprobar("el reproceso no suma aceptadas", 0, (await metricasDe(b)).aceptadas.n);
    comprobar("el Excel del reproceso no sale vacío", 10, excelB.filasFacturas);
    comprobar("y suma lo mismo", sumaFirestore, excelB.sumaTotal);
    comprobar("el reproceso no crea facturas", 0, (await facturasDe(b.id)).size);
    comprobar("el reproceso no crea clientes", 0, (await clientesDe(b.id)).size);
    comprobar("las facturas originales no cambian", 10, (await facturasDe(a.id)).size);

    console.log("--- 3. Función caída a mitad de lote");
    const c = await crearLote("prueba-c", caida);
    await iniciarProceso(await delUsuario(c));
    const tomados = await reclamar(c); // reclama y «se cae» sin procesar
    comprobar("archivos tomados por la función caída", 2, tomados.length);
    comprobar("mientras dura la reserva nadie los toma", 0, (await procesarLote(c, UID)).reclamados);
    // Simula que pasaron los 5 minutos de la reserva.
    await Promise.all(tomados.map(({ referencia }) => referencia.update({ disponibleDesde: 1 })));
    const resumenC = await vaciarCola(c, 2);
    comprobar("al caducar la reserva se retoman", 2, resumenC.reclamados);
    comprobar("no duplica facturas", 2, (await facturasDe(c.id)).size);

    console.log("--- 4. Número repetido con otra imagen");
    const primera = aceptadas[0];
    if (primera) {
      const d = await crearLote("prueba-d", []);
      const refArchivo = d.collection(COLECCIONES.archivos).doc("otra.png");
      await refArchivo.set({ estado: "procesando" });
      const { resultado } = await guardarFactura({
        hash: "a".repeat(64),
        proceso: { id: d.id, uid: UID },
        archivo: { referencia: refArchivo, nombre: "otra.png", rutaArchivo: "x" },
        lectura: {
          datos: {
            numero: primera.numero, fecha: primera.fecha, proveedor: primera.proveedor,
            nitProveedor: primera.nitProveedor, dvProveedor: null, clienteDocumento: null,
            clienteDv: null, clienteNombre: null, items: [], subtotal: 1, iva: 1,
            impoconsumo: null, mencionaImpoconsumo: false, total: 2,
          },
          motivos: [],
          confianza: 90,
        },
      });
      comprobar("no se descarta: va a revisión", "revision", resultado);
      const motivos = (await db.collection(COLECCIONES.facturas).doc("a".repeat(64)).get()).get("motivos") as string[];
      comprobar("con el motivo correcto", true, motivos.some((m) => m.includes("ya existe")));
    } else {
      comprobar("hay una factura aceptada para probar", true, false);
    }

    console.log("--- 5. Imagen que no se puede descargar");
    const e = await crearLote("prueba-e", caida.slice(0, 1));
    await iniciarProceso(await delUsuario(e));
    await eliminar([`procesos/${e.id}/0001-${caida[0].nombre}`]);
    const resumenE = await vaciarCola(e, 1);
    const [archivoE] = await cola(e);
    comprobar("reintenta y termina en error", 1, resumenE.errores);
    comprobar("usó los 3 intentos", 3, archivoE.intentos);
    comprobar("contador de errores", 1, (await metricasDe(e)).errores);
    const facturasE = await facturasDe(e.id);
    comprobar("la factura queda en revisión, no se pierde", "revision", facturasE.docs[0]?.get("estado"));
  } finally {
    for (const id of [...creados].reverse()) await limpiarLote(id);
    console.log(`Limpieza: ${creados.length} lotes de prueba borrados.`);
    await cerrarMotor();
    await deleteApp(appFirebase());
  }

  console.log(fallos() === 0 ? "\nTodas las comprobaciones pasaron." : `\n${fallos()} comprobaciones fallaron.`);
  process.exitCode = fallos() === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
