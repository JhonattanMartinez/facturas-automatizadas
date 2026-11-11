// Fase 0: comprueba que este computador llega a los tres servicios antes de
// construir nada encima; sin esto, los errores de fases posteriores no se pueden interpretar.
// Solo imprime "OK" o un error limpio: nunca el valor de una variable.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const VARIABLES_REQUERIDAS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_BUCKET_FACTURAS",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "USUARIOS_PERMITIDOS",
] as const;

const TOPE_MS = 30_000;

function variable(nombre: (typeof VARIABLES_REQUERIDAS)[number]): string {
  return process.env[nombre] ?? "";
}

// Un mensaje de error de una librería podría citar un valor recibido: se borra por si acaso.
function mensajeLimpio(error: unknown): string {
  let mensaje = error instanceof Error ? error.message : String(error);
  for (const nombre of VARIABLES_REQUERIDAS) {
    const valor = variable(nombre);
    if (valor.length >= 8) mensaje = mensaje.split(valor).join(`<${nombre}>`);
  }
  return mensaje.split("\n")[0];
}

// Las librerías de Google reintentan por minutos ante un fallo de red; el tope da una respuesta clara.
function conTope<T>(promesa: Promise<T>): Promise<T> {
  let temporizador: NodeJS.Timeout;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`sin respuesta tras ${TOPE_MS / 1000} s`)),
      TOPE_MS,
    );
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(temporizador));
}

async function probarFirestore(): Promise<void> {
  const documento = getFirestore()
    .collection("_prueba_conexion")
    .doc(randomUUID());
  const marca = randomUUID();
  await documento.create({ marca });
  try {
    const leido = await documento.get();
    if (leido.get("marca") !== marca) {
      throw new Error("lo leído no coincide con lo escrito");
    }
  } finally {
    // Se borra solo el documento que esta prueba creó.
    await documento.delete();
  }
}

async function probarAuth(): Promise<void> {
  await getAuth().listUsers(1);
}

async function probarSupabase(): Promise<void> {
  const nombreBucket = variable("SUPABASE_BUCKET_FACTURAS");
  const supabase = createClient(
    variable("SUPABASE_URL"),
    variable("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const bucket = await supabase.storage.getBucket(nombreBucket);
  if (bucket.error) throw new Error(`bucket: ${bucket.error.message}`);
  // Las facturas tienen datos de clientes: un bucket público las dejaría abiertas a cualquiera.
  if (bucket.data.public) {
    throw new Error("el bucket es PÚBLICO; debe ser privado");
  }

  const lista = await supabase.storage
    .from(nombreBucket)
    .list("", { limit: 1 });
  if (lista.error) throw new Error(`listar: ${lista.error.message}`);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    console.error("No se pudo leer .env: ejecuta el script desde la raíz del proyecto.");
    process.exit(1);
  }

  const faltantes = VARIABLES_REQUERIDAS.filter((nombre) => !variable(nombre));
  if (faltantes.length > 0) {
    console.error(`Faltan variables en .env: ${faltantes.join(", ")}`);
    process.exit(1);
  }

  const app = initializeApp({
    credential: cert({
      projectId: variable("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: variable("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: variable("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });

  const pruebas: [string, () => Promise<void>][] = [
    ["Firestore", probarFirestore],
    ["Auth", probarAuth],
    ["Supabase Storage", probarSupabase],
  ];

  let todoBien = true;
  for (const [nombre, probar] of pruebas) {
    try {
      await conTope(probar());
      console.log(`${nombre} OK`);
    } catch (error) {
      todoBien = false;
      console.log(`${nombre} ERROR: ${mensajeLimpio(error)}`);
    }
  }

  // Se cierra Firebase en vez de llamar process.exit: en Windows, salir con
  // conexiones abiertas aborta Node con un error interno de libuv.
  await deleteApp(app);
  process.exitCode = todoBien ? 0 : 1;
}

void main();
