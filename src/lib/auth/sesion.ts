// Verificación de la sesión en el servidor. Aquí se decide de verdad quién entra.
import type { NextRequest } from "next/server";
import { autenticacion } from "@/lib/firebase/admin";

export const NOMBRE_COOKIE = "sesion";
export const DURACION_SESION_MS = 5 * 24 * 60 * 60 * 1000;

export type Usuario = { uid: string; email: string };

/**
 * Autorización: Firebase dice quién eres; esta lista dice si puedes usar la app.
 * Hace falta porque la apiKey es pública y cualquiera puede registrarse en el proyecto.
 * Si la variable no está definida, nadie entra (falla cerrado).
 */
export function correoPermitido(correo: string | undefined): boolean {
  if (!correo) return false;
  const permitidos = (process.env.USUARIOS_PERMITIDOS ?? "")
    .split(",")
    // Tolera las comillas y espacios que suelen colarse al pegar en el panel de Vercel.
    .map((c) => c.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
  return permitidos.includes(correo.toLowerCase());
}

// Un token malo es culpa del cliente (401). Cualquier otro fallo, como una
// credencial del servidor rota, debe verse como error y no disfrazarse de "no autorizado".
export function esErrorDeAuth(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("auth/")
  );
}

function noAutorizado(): Response {
  return Response.json({ error: "No autorizado" }, { status: 401 });
}

/**
 * Se usa en TODAS las rutas:
 * const u = await exigirUsuario(request); if (u instanceof Response) return u;
 */
export async function exigirUsuario(
  request: NextRequest,
): Promise<Usuario | Response> {
  const cookie = request.cookies.get(NOMBRE_COOKIE)?.value;
  if (!cookie) return noAutorizado();

  try {
    // El `true` consulta si la sesión fue revocada, no solo si la firma es válida.
    const datos = await autenticacion().verifySessionCookie(cookie, true);
    if (!datos.email || !correoPermitido(datos.email)) return noAutorizado();
    return { uid: datos.uid, email: datos.email };
  } catch (error) {
    if (esErrorDeAuth(error)) return noAutorizado();
    throw error;
  }
}
