// Acceso de administrador a Firebase: SOLO para código de servidor.
// La cuenta de servicio se salta las reglas de Firestore, así que este módulo
// jamás debe importarse desde un componente de cliente.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const VARIABLES = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;

// Se inicializa al primer uso, no al importar: `next build` carga los módulos
// y no debe necesitar credenciales. getApps() evita inicializar dos veces
// cuando una instancia caliente de Vercel atiende varias invocaciones.
export function appFirebase(): App {
  const existente = getApps()[0];
  if (existente) return existente;

  const faltantes = VARIABLES.filter((nombre) => !process.env[nombre]);
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de Firebase: ${faltantes.join(", ")}`);
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Según quién cargue la variable, los saltos de línea llegan como \n literales.
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export function baseDeDatos(): Firestore {
  return getFirestore(appFirebase());
}

export function autenticacion(): Auth {
  return getAuth(appFirebase());
}
