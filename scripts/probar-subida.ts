// Fase 3: comprueba por HTTP que la API acepta una imagen válida y rechaza las demás.
// Crea un lote propio y al terminar borra solo ese lote y sus archivos.
// Uso: CORREO=… CLAVE=… npx tsx scripts/probar-subida.ts <url> <carpetaImágenes>
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { deleteApp } from "firebase-admin/app";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

let fallos = 0;

function comprobar(nombre: string, esperado: number | string, obtenido: number | string) {
  const bien = esperado === obtenido;
  if (!bien) fallos++;
  console.log(`${bien ? "OK   " : "FALLO"} ${nombre.padEnd(44)} esperado ${esperado}, obtenido ${obtenido}`);
}

async function iniciarSesion(url: string): Promise<string> {
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

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const [url, carpeta] = process.argv.slice(2);
  if (!url || !carpeta || !process.env.CORREO || !process.env.CLAVE) {
    throw new Error("Uso: CORREO=… CLAVE=… probar-subida <url> <carpetaImágenes>");
  }

  const bucket = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).storage.from(process.env.SUPABASE_BUCKET_FACTURAS ?? "");

  const nombres = await readdir(carpeta);
  const nombrePng = nombres.find((n) => n.endsWith(".png"));
  if (!nombrePng) throw new Error("No hay ningún PNG en la carpeta");
  const png = await readFile(path.join(carpeta, nombrePng));

  const cookie = await iniciarSesion(url);
  const creado = await fetch(`${url}/api/procesos`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ carpeta: "prueba-subida", totalArchivos: 2 }),
  });
  comprobar("crear lote", 201, creado.status);
  const { id } = (await creado.json()) as { id: string };
  const carpetaLote = `procesos/${id}`;

  const enviar = (
    lote: string,
    parametros: string,
    cuerpo: Buffer,
    conSesion = true,
  ) =>
    fetch(`${url}/api/procesos/${lote}/imagenes?${parametros}`, {
      method: "POST",
      headers: { "content-type": "image/png", ...(conSesion ? { cookie } : {}) },
      body: new Uint8Array(cuerpo),
    });

  try {
    const firmaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    comprobar("sin sesión", 401, (await enviar(id, "indice=1&nombre=a.png", png, false)).status);
    comprobar("texto con nombre .png", 415, (await enviar(id, "indice=1&nombre=a.png", Buffer.from("no soy una imagen"))).status);
    comprobar("firma PNG con el resto dañado", 415, (await enviar(id, "indice=1&nombre=a.png", Buffer.concat([firmaPng, Buffer.alloc(5000, 7)]))).status);
    // 4,3 MB: pasa de nuestro tope (4 MB) sin llegar al límite de Vercel (4,5 MB).
    comprobar("más de 4 MB", 413, (await enviar(id, "indice=1&nombre=a.png", Buffer.concat([firmaPng, Buffer.alloc(4_300_000, 7)]))).status);
    comprobar("lote inexistente", 404, (await enviar("noexisteeste", "indice=1&nombre=a.png", png)).status);
    comprobar("índice inválido", 400, (await enviar(id, "indice=abc&nombre=a.png", png)).status);

    const valida = await enviar(id, "indice=1&nombre=mi factura.jpg", png);
    comprobar("imagen válida", 200, valida.status);
    const { pathname } = (await valida.json()) as { pathname: string };
    // El nombre decía .jpg, pero los bytes son PNG: manda el tipo real.
    comprobar("guarda con la extensión real", `${carpetaLote}/0001-mi-factura.png`, pathname);

    const { data } = await bucket.list(carpetaLote, { limit: 10 });
    comprobar("archivos en el almacén", 1, data?.length ?? -1);
  } finally {
    // Limpia solo lo de este lote.
    const { data } = await bucket.list(carpetaLote, { limit: 100 });
    if (data && data.length > 0) {
      await bucket.remove(data.map((a) => `${carpetaLote}/${a.name}`));
    }
    await baseDeDatos().collection(COLECCIONES.procesos).doc(id).delete();
    await deleteApp(appFirebase());
    console.log("Limpieza: lote de prueba y sus archivos borrados.");
  }

  console.log(fallos === 0 ? "\nTodas las comprobaciones pasaron." : `\n${fallos} comprobaciones fallaron.`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
