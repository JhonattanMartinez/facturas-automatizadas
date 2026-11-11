// Acceso a Supabase Storage. SOLO para código de servidor: la clave secreta da
// acceso total al almacén y se salta las políticas de seguridad de Supabase.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | undefined;

// Se crea al primer uso para que `next build` no necesite las credenciales.
function obtenerCliente(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error("Faltan variables de Supabase");
  cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

function bucket() {
  const nombre = process.env.SUPABASE_BUCKET_FACTURAS;
  if (!nombre) throw new Error("Falta la variable SUPABASE_BUCKET_FACTURAS");
  return obtenerCliente().storage.from(nombre);
}

export async function descargar(ruta: string): Promise<Buffer> {
  const { data, error } = await bucket().download(ruta);
  if (error) throw new Error(`No se pudo descargar ${ruta}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function subir(
  ruta: string,
  contenido: Buffer,
  tipoContenido: string,
): Promise<void> {
  const { error } = await bucket().upload(ruta, contenido, {
    contentType: tipoContenido,
    // Un reintento tras una falla de red escribe en la misma ruta y no debe fallar.
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir ${ruta}: ${error.message}`);
}

export async function listarNombres(
  carpeta: string,
  limite = 1000,
): Promise<string[]> {
  const { data, error } = await bucket().list(carpeta, {
    limit: limite,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`No se pudo listar ${carpeta}: ${error.message}`);
  return data.map((archivo) => archivo.name);
}
