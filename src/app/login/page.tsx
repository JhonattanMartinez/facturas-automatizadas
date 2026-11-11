"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useState, type FormEvent } from "react";
import { autenticacionCliente } from "@/lib/firebase/cliente";
import { cargarPagina } from "@/lib/navegacion";

const claseCampo =
  "rounded border border-zinc-400 bg-transparent px-3 py-2 dark:border-zinc-600";

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
    <main className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={entrar} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <label className="flex flex-col gap-1">
          Correo
          <input
            type="email"
            required
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            className={claseCampo}
          />
        </label>
        <label className="flex flex-col gap-1">
          Contraseña
          <input
            type="password"
            required
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={claseCampo}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="rounded bg-foreground px-3 py-2 font-medium text-background disabled:opacity-50"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
