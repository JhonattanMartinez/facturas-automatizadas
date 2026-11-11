// Utilidades de los scripts de prueba.
import { eliminar, listarNombres } from "@/lib/almacenamiento";
import { baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES, type IndiceNumero } from "@/lib/modelo/tipos";

export function crearComprobador() {
  let fallos = 0;
  return {
    comprobar(nombre: string, esperado: unknown, obtenido: unknown): void {
      const bien = esperado === obtenido;
      if (!bien) fallos++;
      console.log(
        `${bien ? "OK   " : "FALLO"} ${nombre.padEnd(52)} esperado ${String(esperado)}, obtenido ${String(obtenido)}`,
      );
    },
    fallos: () => fallos,
  };
}

/** Inicia sesión como un navegador y devuelve la cookie. Usa CORREO y CLAVE del entorno. */
export async function iniciarSesion(url: string): Promise<string> {
  const respuesta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: process.env.CORREO,
        password: process.env.CLAVE,
        returnSecureToken: true,
      }),
    },
  );
  if (!respuesta.ok) throw new Error("Correo o contraseña incorrectos");
  const { idToken } = (await respuesta.json()) as { idToken: string };

  const sesion = await fetch(`${url}/api/sesion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!sesion.ok) throw new Error(`El servidor no dio sesión (${sesion.status})`);
  const cookie = sesion.headers.getSetCookie().find((c) => c.startsWith("sesion="));
  if (!cookie) throw new Error("El servidor no devolvió la cookie");
  return cookie.split(";")[0];
}

/**
 * Borra SOLO lo que creó un lote. «Lo que creó» se comprueba, no se supone: un número
 * de factura o un cliente pueden pertenecer a otro lote. Por eso un índice se borra
 * solo si apunta a una factura de este lote y un cliente solo si lo creó este lote.
 */
export async function limpiarLote(id: string): Promise<void> {
  const db = baseDeDatos();
  const facturas = await db
    .collection(COLECCIONES.facturas)
    .where("procesoId", "==", id)
    .get();

  for (const factura of facturas.docs) {
    const numero = factura.get("numero") as string | null;
    if (numero) {
      const indice = db.collection(COLECCIONES.indicesNumero).doc(numero);
      const datos = (await indice.get()).data() as IndiceNumero | undefined;
      if (datos?.hashArchivo === factura.id) await indice.delete();
    }
    await factura.ref.delete();
  }

  const clientes = await db
    .collection(COLECCIONES.clientes)
    .where("primerProcesoId", "==", id)
    .get();
  await Promise.all(clientes.docs.map((cliente) => cliente.ref.delete()));

  const proceso = db.collection(COLECCIONES.procesos).doc(id);
  const cola = await proceso.collection(COLECCIONES.archivos).get();
  await Promise.all(cola.docs.map((archivo) => archivo.ref.delete()));
  await proceso.delete();

  const carpeta = `procesos/${id}`;
  const nombres = await listarNombres(carpeta);
  await eliminar(nombres.map((nombre) => `${carpeta}/${nombre}`));
}
