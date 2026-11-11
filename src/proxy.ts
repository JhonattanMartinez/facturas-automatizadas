// Redirección optimista: si no hay cookie, a /login. Solo mira si la cookie existe;
// no la verifica. La verificación real está en exigirUsuario, dentro de cada ruta.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  // Mismo nombre que NOMBRE_COOKIE. No se importa de sesion.ts para no arrastrar firebase-admin aquí.
  if (!request.cookies.has("sesion")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon\\.ico).*)"],
};
