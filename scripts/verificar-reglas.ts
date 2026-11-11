// Fase 2: actúa como un desconocido en internet, solo con la apiKey pública, y
// comprueba que Firestore lo rechaza. La cuenta de servicio se salta las reglas,
// así que probar con ella no demostraría nada: hay que entrar sin credenciales.
import { randomUUID } from "node:crypto";
import { deleteApp } from "firebase-admin/app";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import { COLECCIONES } from "@/lib/modelo/tipos";

const COLECCIONES_A_PROBAR = [
  COLECCIONES.clientes,
  COLECCIONES.facturas,
  COLECCIONES.procesos,
];

type Intento = { accion: string; estado: number };

async function intentar(
  coleccion: string,
  apiKey: string,
  base: string,
): Promise<{ intentos: Intento[]; creado: string | null }> {
  const parametro = `key=${encodeURIComponent(apiKey)}`;
  const idPrueba = `_prueba_reglas_${randomUUID()}`;

  const leer = await fetch(`${base}/${coleccion}/${idPrueba}?${parametro}`);
  const listar = await fetch(`${base}/${coleccion}?pageSize=1&${parametro}`);
  // Se crea con un ID nuevo: aunque las reglas estuvieran abiertas, no se pisa ningún dato real.
  const escribir = await fetch(
    `${base}/${coleccion}?documentId=${idPrueba}&${parametro}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fields: { prueba: { booleanValue: true } },
      }),
    },
  );

  return {
    intentos: [
      { accion: "leer", estado: leer.status },
      { accion: "listar", estado: listar.status },
      { accion: "escribir", estado: escribir.status },
    ],
    creado: escribir.ok ? idPrueba : null,
  };
}

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const proyecto = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!proyecto || !apiKey) {
    console.error("Faltan variables NEXT_PUBLIC_FIREBASE_* en .env");
    process.exitCode = 1;
    return;
  }

  const base = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents`;
  let todoBien = true;
  let usoAdmin = false;

  for (const coleccion of COLECCIONES_A_PROBAR) {
    const { intentos, creado } = await intentar(coleccion, apiKey, base);
    for (const { accion, estado } of intentos) {
      // Solo 403 demuestra las reglas: un 400 sería una apiKey mala, no una puerta cerrada.
      const bien = estado === 403;
      todoBien = todoBien && bien;
      console.log(
        `${coleccion.padEnd(9)} ${accion.padEnd(9)} ${estado} ${bien ? "OK" : "FALLO"}`,
      );
    }
    if (creado) {
      await baseDeDatos().collection(coleccion).doc(creado).delete();
      usoAdmin = true;
      console.log(`${coleccion}: se borró el documento de prueba que entró`);
    }
  }

  if (usoAdmin) await deleteApp(appFirebase());

  console.log(
    todoBien
      ? "Reglas cerradas: todo acceso anónimo fue rechazado."
      : "LAS REGLAS NO ESTÁN CERRADAS: revisa Firestore Database → Reglas.",
  );
  process.exitCode = todoBien ? 0 : 1;
}

void main();
