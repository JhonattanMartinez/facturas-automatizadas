"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { autenticacionCliente } from "@/lib/firebase/cliente";
import { cargarPagina } from "@/lib/navegacion";
import { CLASE_BOTON_PRINCIPAL, CLASE_CAMPO, Logotipo } from "@/componentes/ui";


function mensajeDeError(error: unknown): string {
  if (
    error instanceof FirebaseError &&
    ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error.code)
  ) {
    return "Correo o contraseña incorrectos.";
  }
  return error instanceof Error && !(error instanceof FirebaseError)
    ? error.message
    : "No se pudo iniciar sesión. Intenta de nuevo.";
}

export default function PaginaLogin() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const auth = autenticacionCliente();
    try {
      const credencial = await signInWithEmailAndPassword(auth, correo, clave);
      const idToken = await credencial.user.getIdToken();
      const respuesta = await fetch("/api/sesion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!respuesta.ok) {
        const datos = (await respuesta.json()) as { error?: string };
        throw new Error(datos.error ?? "No se pudo iniciar sesión.");
      }
      cargarPagina("/");
    } catch (causa) {
      setError(mensajeDeError(causa));
      setEnviando(false);
    } finally {
      // La sesión real vive en la cookie del servidor; el navegador no guarda nada de Firebase.
      await signOut(auth);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-tarjeta md:grid-cols-2">
        <section className="flex flex-col justify-between gap-8 bg-gradient-to-br from-acento-fuerte to-acento p-8 text-sobre-acento">
          <div className="flex items-center gap-3">
            <Logotipo tamano={40} />
            <span className="text-lg font-bold tracking-tight">Procesador de facturas</span>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
              Lee, valida y organiza tus facturas automáticamente.
            </h2>
            <ul className="flex flex-col gap-2 text-sm opacity-90">
              <li>✓ OCR de miles de facturas en segundo plano</li>
              <li>✓ Validación de NIT, IVA y totales</li>
              <li>✓ Revisión manual y un Excel por lote</li>
            </ul>
          </div>
          <p className="text-xs opacity-75">Tendencias en desarrollo de software · automatización</p>
        </section>

        <form onSubmit={entrar} className="flex flex-col justify-center gap-5 p-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-secundario">Solo pueden entrar las cuentas autorizadas.</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Correo
            <input
              type="email"
              required
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className={CLASE_CAMPO}
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-malo-suave px-3 py-2 text-sm text-malo">
              ✕ {error}
            </p>
          )}
          <button type="submit" disabled={enviando} className={`${CLASE_BOTON_PRINCIPAL} py-2.5`}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
