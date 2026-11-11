// Estrategia de lectura: cada reintento cuesta CPU, así que solo se hace si la lectura
// anterior dejó motivos de revisión. Se conserva el resultado con menos motivos.
import { extraer } from "./extractor";
import { leerImagen } from "./motor";
import type { ParcialFactura } from "./tipos";
import { validar } from "./validador";

export type ResultadoLectura = {
  datos: ParcialFactura;
  motivos: string[];
  texto: string;
  confianza: number;
};

function interpretar(texto: string, confianza: number): ResultadoLectura {
  const datos = extraer(texto);
  return { datos, motivos: validar(datos), texto, confianza };
}

function elegirMejor(
  actual: ResultadoLectura,
  nuevo: ResultadoLectura,
): ResultadoLectura {
  return nuevo.motivos.length < actual.motivos.length ? nuevo : actual;
}

export async function leerFactura(imagen: Buffer): Promise<ResultadoLectura> {
  const original = await leerImagen(imagen, "original");
  let mejor = interpretar(original.texto, original.confianza);
  if (mejor.motivos.length === 0) return mejor;

  const preprocesado = await leerImagen(imagen, "preprocesado");
  mejor = elegirMejor(mejor, interpretar(preprocesado.texto, preprocesado.confianza));
  if (mejor.motivos.length === 0) return mejor;

  // El encabezado se antepone porque solo trae los datos de arriba;
  // los ítems y los totales siguen saliendo de la mejor lectura completa.
  const encabezado = await leerImagen(imagen, "encabezado");
  return elegirMejor(
    mejor,
    interpretar(`${encabezado.texto}\n${mejor.texto}`, mejor.confianza),
  );
}
