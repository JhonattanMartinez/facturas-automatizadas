// Inicio y cierre de sesión: cambia el ID token de Firebase por una cookie del servidor.
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  correoPermitido,
  DURACION_SESION_MS,
  esErrorDeAuth,
  exigirUsuario,
  NOMBRE_COOKIE,
} from "@/lib/auth/sesion";
import { autenticacion } from "@/lib/firebase/admin";

const esquemaEntrada = z.object({ idToken: z.string().min(1) });

export async function POST(request: NextRequest): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null);
  const entrada = esquemaEntrada.safeParse(cuerpo);
  if (!entrada.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const { idToken } = entrada.data;

  let correo: string | undefined;
  try {
    correo = (await autenticacion().verifyIdToken(idToken)).email;
  } catch (error) {
    if (esErrorDeAuth(error)) {
      return Response.json({ error: "Token inválido" }, { status: 401 });
    }
    throw error;
  }

  if (!correoPermitido(correo)) {
    return Response.json(
      { error: "Este correo no está autorizado" },
      { status: 403 },
    );
  }

  const sesion = await autenticacion().createSessionCookie(idToken, {
    expiresIn: DURACION_SESION_MS,
  });

  (await cookies()).set(NOMBRE_COOKIE, sesion, {
    httpOnly: true, // el JavaScript de la página no puede leerla
    // En http://localhost una cookie `secure` puede no guardarse.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_MS / 1000,
  });

  return Response.json({ ok: true });
}

export async function GET(request: NextRequest): Promise<Response> {
  const usuario = await exigirUsuario(request);
  if (usuario instanceof Response) return usuario;
  return Response.json({ email: usuario.email });
}

export async function DELETE(): Promise<Response> {
  (await cookies()).delete(NOMBRE_COOKIE);
  return Response.json({ ok: true });
}
