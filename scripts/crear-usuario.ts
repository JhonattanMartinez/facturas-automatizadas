// Crea un usuario de Firebase Auth. El correo y la clave llegan por variables de
// entorno para que la contraseña no quede escrita en ningún archivo.
import { deleteApp } from "firebase-admin/app";
import { appFirebase, autenticacion } from "@/lib/firebase/admin";

async function main(): Promise<void> {
  process.loadEnvFile(".env");
  const email = process.env.CORREO;
  const password = process.env.CLAVE;
  if (!email || !password) {
    console.error("Define las variables de entorno CORREO y CLAVE.");
    process.exitCode = 1;
    return;
  }

  const usuario = await autenticacion().createUser({ email, password });
  console.log(`Usuario creado: ${usuario.email}`);
  await deleteApp(appFirebase());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
