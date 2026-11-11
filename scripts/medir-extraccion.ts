// Mide el extractor sobre textos ya guardados por ocr-muestras.ts, con la estrategia de
// reintentos prevista para la Fase 5. Sin respuestas correctas solo mide cuántas se aceptan:
// «aceptada» significa que pasó las validaciones, no que esté comprobada contra la imagen.
// Uso: npx tsx scripts/medir-extraccion.ts <carpetaTextos> [--detalle]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extraer } from "@/lib/ocr/extractor";
import { validar } from "@/lib/ocr/validador";

type Lectura = { texto: string; motivos: string[] };

function leer(texto: string): Lectura {
  return { texto, motivos: validar(extraer(texto)) };
}

function mejor(a: Lectura, b: Lectura): Lectura {
  return b.motivos.length < a.motivos.length ? b : a;
}

async function main(): Promise<void> {
  const carpeta = process.argv[2];
  const detalle = process.argv.includes("--detalle");
  if (!carpeta) {
    console.error("Uso: medir-extraccion <carpetaTextos> [--detalle]");
    process.exitCode = 1;
    return;
  }

  const bases = [
    ...new Set(
      (await readdir(carpeta))
        .filter((nombre) => nombre.endsWith(".original.txt"))
        .map((nombre) => nombre.replace(".original.txt", "")),
    ),
  ].sort();

  const leerModo = (base: string, modo: string) =>
    readFile(path.join(carpeta, `${base}.${modo}.txt`), "utf8");

  let aceptadas = 0;
  const conteoMotivos = new Map<string, number>();

  for (const base of bases) {
    let resultado = leer(await leerModo(base, "original"));
    if (resultado.motivos.length > 0) {
      resultado = mejor(resultado, leer(await leerModo(base, "preprocesado")));
    }
    if (resultado.motivos.length > 0) {
      const encabezado = await leerModo(base, "encabezado");
      resultado = mejor(resultado, leer(`${encabezado}\n${resultado.texto}`));
    }

    if (resultado.motivos.length === 0) aceptadas++;
    for (const motivo of resultado.motivos) {
      conteoMotivos.set(motivo, (conteoMotivos.get(motivo) ?? 0) + 1);
    }
    if (detalle) {
      const f = extraer(resultado.texto);
      const estado = resultado.motivos.length === 0 ? "ACEPTADA" : "REVISION";
      console.log(
        `${base} ${estado} ${f.numero} ${f.fecha} | ${f.proveedor} | ${f.nitProveedor}-${f.dvProveedor} | ${f.clienteDocumento}-${f.clienteDv} | ${f.clienteNombre} | items=${f.items.length} | ${f.subtotal} + ${f.iva} + ${f.impoconsumo} = ${f.total}`,
      );
      for (const motivo of resultado.motivos) console.log(`    - ${motivo}`);
    }
  }

  const porcentaje = bases.length ? Math.round((aceptadas / bases.length) * 100) : 0;
  console.log(`\nAceptadas: ${aceptadas} de ${bases.length} (${porcentaje} %)`);
  console.log(`A revisión: ${bases.length - aceptadas}`);
  if (conteoMotivos.size > 0) {
    console.log("Motivos:");
    [...conteoMotivos.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([motivo, n]) => console.log(`  ${n}  ${motivo}`));
  }
}

void main();
