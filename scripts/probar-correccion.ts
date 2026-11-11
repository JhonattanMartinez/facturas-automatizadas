// Fase 9: prueba la revisión manual contra Firestore real, sin OCR.
// Crea sus propios lotes y facturas y al terminar borra solo lo que creó.
// Uso: npx tsx scripts/probar-correccion.ts
import { createHash, randomInt } from "node:crypto";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { appFirebase, baseDeDatos } from "@/lib/firebase/admin";
import {
  COLECCIONES,
  type Cliente,
  type Factura,
  type Proceso,
} from "@/lib/modelo/tipos";
import { digitoVerificacion } from "@/lib/ocr/nit";
import type { ParcialFactura } from "@/lib/ocr/tipos";
import { corregirFactura } from "@/lib/procesamiento/corregir";
import { guardarFactura } from "@/lib/procesamiento/guardar";
import { metricasVacias } from "@/lib/procesamiento/metricas";
import { crearComprobador, limpiarLote } from "./comun";

process.loadEnvFile(".env");

const UID = "prueba-correccion";
const CORREO = "revisor@prueba.test";
const { comprobar, fallos } = crearComprobador();
const db = baseDeDatos();
const sello = randomInt(100000, 999999);

const documentoNuevo = () => String(randomInt(100_000_000, 999_999_999));
const hashDe = (texto: string) => createHash("sha256").update(`${sello}:${texto}`).digest("hex");
const numero = (n: number) => `PR-${sello}-${n}`;

const facturas = db.collection(COLECCIONES.facturas);
const indices = db.collection(COLECCIONES.indicesNumero);
const clientes = db.collection(COLECCIONES.clientes);

async function crearLote(nombre: string): Promise<string> {
  const proceso: Proceso = {
    uid: UID, carpeta: nombre, estado: "terminado", totalArchivos: 1, inicio: Timestamp.now(),
    fin: null, rutaExcel: null, finalizandoDesde: null,
  };
  return (await db.collection(COLECCIONES.procesos).add(proceso)).id;
}

const NIT = "900123456";

/** Crea una factura como la dejaría la máquina. */
async function facturaDeMaquina(
  loteId: string,
  clave: string,
  datos: Partial<ParcialFactura>,
  motivos: string[],
): Promise<string> {
  const hash = hashDe(clave);
  const referencia = db
    .collection(COLECCIONES.procesos)
    .doc(loteId)
    .collection(COLECCIONES.archivos)
    .doc(`${clave}.png`);
  await referencia.set({ estado: "procesando" });
  await guardarFactura({
    hash,
    proceso: { id: loteId, uid: UID },
    archivo: { referencia, nombre: `${clave}.png`, rutaArchivo: "x" },
    lectura: {
      motivos,
      confianza: 80,
      datos: {
        numero: null, fecha: null, proveedor: null, nitProveedor: null, dvProveedor: null,
        clienteDocumento: null, clienteDv: null, clienteNombre: null, items: [],
        subtotal: null, iva: null, impoconsumo: null, mencionaImpoconsumo: false, total: null,
        ...datos,
      },
    },
  });
  return hash;
}

function correccion(n: number, documento: string, cambios: Record<string, unknown> = {}) {
  return {
    numero: numero(n),
    fecha: "2026-05-10",
    proveedor: "Proveedor de Prueba S.A.S.",
    nitProveedor: NIT,
    dvProveedor: digitoVerificacion(NIT),
    clienteDocumento: documento,
    clienteDv: digitoVerificacion(documento),
    clienteNombre: "Cliente de Prueba",
    items: [{ descripcion: "Producto", cantidad: 2, precioUnitario: 50000 }],
    subtotal: 100000,
    iva: 19000,
    impoconsumo: null,
    total: 119000,
    confirmarValidaciones: false,
    ...cambios,
  };
}

async function main(): Promise<void> {
  const creados: string[] = [];
  const corregir = (hash: string, cuerpo: unknown, uid = UID) =>
    corregirFactura({ hash, uid, email: CORREO, cuerpo });
  const leerFactura = async (hash: string) => (await facturas.doc(hash).get()).data() as Factura;

  try {
    const lote = await crearLote("prueba-correccion");
    creados.push(lote);
    const metricas = async () => {
      const proceso = (await db.collection(COLECCIONES.procesos).doc(lote).get()).data() as Proceso;
      return { ...metricasVacias(), ...proceso.metricas };
    };

    const hash = await facturaDeMaquina(lote, "a", { numero: numero(1) }, ["Motivo de la máquina"]);
    const documento = documentoNuevo();

    console.log("--- Rechazos sin escribir nada");
    const malFormato = await corregir(hash, { numero: "a/b" });
    comprobar("formato inválido", 400, malFormato.status);

    const sinConfirmar = await corregir(hash, correccion(2, documento, { total: 999 }));
    comprobar("validación sin confirmar", 422, sinConfirmar.status);
    comprobar("devuelve los motivos", true, (sinConfirmar.cuerpo.motivos?.length ?? 0) > 0);
    comprobar("la factura sigue en revisión", "revision", (await leerFactura(hash)).estado);
    comprobar("no crea el índice", false, (await indices.doc(numero(2)).get()).exists);
    comprobar("no crea el cliente", false, (await clientes.doc(documento).get()).exists);

    console.log("--- Guardado con todos sus efectos");
    comprobar("guarda", 200, (await corregir(hash, correccion(1, documento))).status);
    const corregida = await leerFactura(hash);
    comprobar("queda aceptada", "aceptada", corregida.estado);
    comprobar("marcada como manual", true, corregida.corregidaManualmente);
    comprobar("deja constancia de quién", CORREO, corregida.corregidaPor);
    comprobar("conserva el motivo de la máquina", "Motivo de la máquina", corregida.motivosOriginales?.[0]);
    comprobar("calcula el subtotal del ítem", 100000, corregida.items[0].subtotal);
    comprobar("índice apunta a la factura", hash, (await indices.doc(numero(1)).get()).get("hashArchivo"));
    const cliente = (await clientes.doc(documento).get()).data() as Cliente | undefined;
    comprobar("crea el cliente", documento, cliente?.documento);
    comprobar("el cliente es de este lote", lote, cliente?.primerProcesoId);

    let m = await metricas();
    comprobar("cuenta como manual", 1, m.manuales.n);
    comprobar("importe manual", 119000, m.manuales.total);
    comprobar("NO cuenta como leída por la máquina", 0, m.aceptadas.n);
    comprobar("la revisión de la máquina no cambia", 1, m.revision.n);
    comprobar("entra en su proveedor", 119000, m.proveedores[NIT].total);
    comprobar("el nombre se cuenta completo", 1, m.proveedores[NIT].nombres["Proveedor de Prueba S.A.S."]);
    comprobar("cuenta el cliente nuevo", 1, m.clientesNuevos);

    console.log("--- Reedición: solo la diferencia");
    const reedicion = correccion(1, documento, {
      items: [{ descripcion: "Producto", cantidad: 3, precioUnitario: 50000 }],
      subtotal: 150000,
      iva: 28500,
      total: 178500,
    });
    comprobar("guarda la reedición", 200, (await corregir(hash, reedicion)).status);
    m = await metricas();
    comprobar("no vuelve a contar la factura", 1, m.manuales.n);
    comprobar("aplica la diferencia", 178500, m.manuales.total);
    comprobar("el proveedor sigue con una", 1, m.proveedores[NIT].n);
    comprobar("el proveedor refleja el nuevo total", 178500, m.proveedores[NIT].total);
    comprobar("no vuelve a contar el cliente", 1, m.clientesNuevos);
    comprobar("conserva el motivo original", "Motivo de la máquina", (await leerFactura(hash)).motivosOriginales?.[0]);

    console.log("--- Cambio de número");
    comprobar("cambia el número", 200, (await corregir(hash, correccion(3, documento))).status);
    comprobar("libera el índice anterior", false, (await indices.doc(numero(1)).get()).exists);
    comprobar("crea el índice nuevo", hash, (await indices.doc(numero(3)).get()).get("hashArchivo"));

    console.log("--- Número repetido");
    const otra = await facturaDeMaquina(lote, "b", {}, ["Motivo"]);
    const repetido = await corregir(otra, correccion(3, documentoNuevo()));
    comprobar("rechaza un número de otra factura", 409, repetido.status);
    comprobar("la factura sigue en revisión", "revision", (await leerFactura(otra)).estado);
    comprobar("el índice sigue siendo del dueño", hash, (await indices.doc(numero(3)).get()).get("hashArchivo"));

    console.log("--- Factura ya aceptada por la máquina");
    const deMaquina = await facturaDeMaquina(lote, "c", { numero: numero(4) }, []);
    comprobar("rechaza editarla", 409, (await corregir(deMaquina, correccion(4, documentoNuevo()))).status);

    console.log("--- Acceso");
    comprobar("factura ajena", 404, (await corregir(otra, correccion(5, documentoNuevo()), "otro-usuario")).status);
    comprobar("factura inexistente", 404, (await corregir(hashDe("nada"), correccion(6, documentoNuevo()))).status);

    console.log("--- Confirmar lo que no cuadra");
    const confirmada = await facturaDeMaquina(lote, "d", {}, ["Motivo"]);
    const conConfirmacion = correccion(7, documentoNuevo(), { total: 200000, confirmarValidaciones: true });
    comprobar("guarda si la persona confirma", 200, (await corregir(confirmada, conConfirmacion)).status);
    comprobar("deja constancia de lo ignorado", true, ((await leerFactura(confirmada)).validacionesIgnoradas?.length ?? 0) > 0);

    console.log("--- Dígito de verificación equivocado");
    const conDvMalo = await facturaDeMaquina(lote, "e", {}, ["Motivo"]);
    const docMalo = documentoNuevo();
    const dvMalo = String((Number(digitoVerificacion(docMalo)) + 1) % 10);
    const respuestaDv = await corregir(
      conDvMalo,
      correccion(8, docMalo, { clienteDv: dvMalo, confirmarValidaciones: true }),
    );
    comprobar("guarda con confirmación", 200, respuestaDv.status);
    comprobar("no identifica al cliente", null, (await leerFactura(conDvMalo)).clienteDocumento);
    comprobar("no crea el cliente", false, (await clientes.doc(docMalo).get()).exists);
    comprobar("conserva lo escrito", docMalo, (await leerFactura(conDvMalo)).clienteDocumentoLeido);
  } finally {
    for (const id of creados) await limpiarLote(id);
    console.log(`Limpieza: ${creados.length} lote de prueba borrado.`);
    await deleteApp(appFirebase());
  }

  console.log(fallos() === 0 ? "\nTodas las comprobaciones pasaron." : `\n${fallos()} comprobaciones fallaron.`);
  process.exitCode = fallos() === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
