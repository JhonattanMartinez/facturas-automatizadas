// Firebase en el navegador: solo se usa Authentication.
// Estas variables son públicas por diseño; la seguridad está en el servidor y en las reglas.
import { getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export function autenticacionCliente(): Auth {
  const app =
    getApps()[0] ??
    initializeApp({
      // Next solo incrusta estas variables si se escriben completas, sin construir el nombre.
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  return getAuth(app);
}
