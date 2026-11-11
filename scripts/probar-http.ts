// Fase 6: recorrido completo por HTTP contra local o producción.
// Al terminar borra solo lo que creó.
// Uso: CORREO=… CLAVE=… npx tsx scripts/probar-http.ts <url> <carpetaImágenes>
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp } from "firebase-admin/app";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";
import { crearComprobador, iniciarSesion, limpiarLote } from "./comun";

const CANTIDAD = 10;
const SIMULTANEAS = 3;
const { comprobar, fallos } = crearComprobador();

type Totales = { aceptadas: number; revision: number; duplicadas: number; errores: number };

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const [url, carpeta] = process.argv.slice(2);
  if (!url || !carpeta || !process.env.CORREO || !process.env.CLAVE) {
    throw new Error("Uso: CORREO=… CLAVE=… probar-http <url> <carpetaImágenes>");
  }

  const nombres = (await readdir(carpeta)).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
  const muestra = Array.from({ length: CANTIDAD }, (_, i) => nombres[200 + i * 41]);
  const cookie = await iniciarSesion(url);
  const json = { "content-type": "application/json", cookie };
  const creados: string[] = [];

  async function correrLote(nombreLote: string): Promise<{ totales: Totales; id: string; ms: number }> {
    const inicio = Date.now();
    const creado = await fetch(`${url}/api/procesos`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ carpeta: nombreLote, totalArchivos: CANTIDAD }),
    });
    comprobar(`${nombreLote}: crear lote`, 201, creado.status);
    const { id } = (await creado.json()) as { id: string };
    creados.push(id);

    let subidas = 0;
    let indice = 1;
    for (const nombre of muestra) {
      const parametros = new URLSearchParams({ indice: String(indice++), nombre });
      const respuesta = await fetch(`${url}/api/procesos/${id}/imagenes?${parametros}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", cookie },
        body: new Uint8Array(await readFile(path.join(carpeta, nombre))),
      });
      if (respuesta.ok) subidas++;
    }
    comprobar(`${nombreLote}: imágenes subidas`, CANTIDAD, subidas);

    const iniciado = await fetch(`${url}/api/procesos/${id}/iniciar`, { method: "POST", headers: json });
    comprobar(`${nombreLote}: iniciar`, 200, iniciado.status);

    const totales: Totales = { aceptadas: 0, revision: 0, duplicadas: 0, errores: 0 };
    await Promise.all(
      Array.from({ length: SIMULTANEAS }, async () => {
        for (;;) {
          const respuesta = await fetch(`${url}/api/procesos/${id}/lote`, { method: "POST", headers: json });
          if (!respuesta.ok) throw new Error(`/lote respondió ${respuesta.status}: ${await respuesta.text()}`);
          const resumen = (await respuesta.json()) as Totales & { reclamados: number };
          if (resumen.reclamados === 0) return;
          totales.aceptadas += resumen.aceptadas;
          totales.revision += resumen.revision;
          totales.duplicadas += resumen.duplicadas;
          totales.errores += resumen.errores;
        }
      }),
    );

    const final = await fetch(`${url}/api/procesos/${id}/finalizar`, { method: "POST", headers: json });
    const { listo } = (await final.json()) as { listo: boolean };
    comprobar(`${nombreLote}: finalizar`, true, listo);
    return { totales, id, ms: Date.now() - inicio };
  }

  try {
    const primero = await correrLote("prueba-http-1");
    const { aceptadas, revision, errores } = primero.totales;
    console.log(`      aceptadas ${aceptadas}, revisión ${revision}, errores ${errores}, ${(primero.ms / 1000).toFixed(1)} s`);
    comprobar("primer lote: facturas distintas procesadas", CANTIDAD, aceptadas + revision + errores);
    comprobar("primer lote: sin errores", 0, errores);

    const facturas = await baseDeDatos()
      .collection(COLECCIONES.facturas)
      .where("procesoId", "==", primero.id)
      .count()
      .get();
    comprobar("facturas guardadas en Firestore", CANTIDAD, facturas.data().count);

    const segundo = await correrLote("prueba-http-2");
    console.log(`      reproceso: ${(segundo.ms / 1000).toFixed(1)} s`);
    comprobar("reproceso: todas duplicadas", CANTIDAD, segundo.totales.duplicadas);
    const nuevas = await baseDeDatos()
      .collection(COLECCIONES.facturas)
      .where("procesoId", "==", segundo.id)
      .count()
      .get();
    comprobar("reproceso: no crea facturas", 0, nuevas.data().count);

    const ajeno = await fetch(`${url}/api/procesos/noexisteeste/lote`, { method: "POST", headers: json });
    comprobar("lote inexistente", 404, ajeno.status);
  } finally {
    for (const id of [...creados].reverse()) await limpiarLote(id);
    console.log(`Limpieza: ${creados.length} lotes de prueba borrados.`);
    await deleteApp(appFirebase());
  }

  console.log(fallos() === 0 ? "\nTodas las comprobaciones pasaron." : `\n${fallos()} comprobaciones fallaron.`);
  process.exitCode = fallos() === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
