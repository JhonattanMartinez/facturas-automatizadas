// Diagnóstico del despliegue: convierte "no sé qué pasa en Vercel" en un JSON legible.
// Devuelve solo booleanos y nombres de variables, nunca sus valores.
import { existsSync } from "node:fs";
import path from "node:path";
import { connection, type NextRequest } from "next/server";
import { exigirUsuario } from "@/lib/auth/sesion";

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
];

const RUTA_DATOS_IDIOMA = path.join(
  process.cwd(),
  "node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz",
);

// Se importa dentro de la función para que un sharp roto aparezca como `false`
// en el diagnóstico en vez de tumbar la ruta que debe explicar el problema.
async function sharpFunciona(): Promise<boolean> {
  try {
    const { default: sharp } = await import("sharp");
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  // Sin esto, cacheComponents podría guardar la respuesta de la compilación.
  await connection();

  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;

  const datosIdioma = existsSync(RUTA_DATOS_IDIOMA);
  const sharp = await sharpFunciona();
  const variablesFaltantes = VARIABLES_REQUERIDAS.filter(
    (nombre) => !process.env[nombre],
  );

  return Response.json({
    ok: datosIdioma && sharp && variablesFaltantes.length === 0,
    datosIdioma,
    sharp,
    variablesFaltantes,
  });
}
