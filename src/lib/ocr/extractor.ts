// Convierte el texto del OCR en datos de factura. Función pura: sin OCR ni base de datos,
// para poder probarla con textos de ejemplo. Lo que no se encuentra queda en null.
import {
  CANTIDAD_MAXIMA_REPARABLE,
  PRECIO_MINIMO_ITEM,
} from "./constantes";
import { dvValido } from "./nit";
import type { ItemParcial, ParcialFactura } from "./tipos";

const aEntero = (texto: string): number => Number(texto.replace(/\./g, ""));

// ---------- Normalización: deshace errores típicos del OCR antes de interpretar ----------

// «119426.500$4.691.500» es 11 × $426.500 = $4.691.500 con el primer $ leído como 9.
// Solo se separa si la aritmética lo confirma; si no, se deja como estaba.
function separarPegados(linea: string): string {
  return linea.replace(
    /(^|\s)(\d{3,})\.(\d{3}(?:\.\d{3})*)\$(\d{1,3}(?:\.\d{3})+)/,
    (original: string, inicio: string, digitos: string, resto: string, final: string) => {
      const subtotal = aEntero(final);
      for (let corte = 1; corte < digitos.length; corte++) {
        for (const signo of [1, 0]) {
          const inicioPrecio = digitos.slice(corte + signo);
          if (!inicioPrecio) continue;
          const cantidad = Number(digitos.slice(0, corte));
          if (cantidad * aEntero(`${inicioPrecio}${resto}`) === subtotal) {
            return `${inicio}${cantidad} $${inicioPrecio}.${resto} $${final}`;
          }
        }
      }
      return original;
    },
  );
}

function normalizarLinea(original: string): string {
  let linea = separarPegados(original.replace(/\s+/g, " ").trim());
  linea = linea.replace(/\$\s+(?=\d)/g, "$"); // «$ 496.000»
  // «$496 .000» y «$496. 000»: el OCR parte el importe con un espacio.
  let anterior: string;
  do {
    anterior = linea;
    linea = linea.replace(/(\$\d[\d.]*?) ?\. ?(\d{3})(?!\d)/g, "$1.$2");
  } while (linea !== anterior);
  // «S146.500»: la S es un $ mal leído.
  linea = linea.replace(/(^|[\s|])[Ss](\d{1,3}(?:\.\d{3})+)(?=$|[\s|])/g, "$1$$$2");
  // «3$146.500»: cantidad pegada al precio.
  return linea.replace(/(\d)\$(\d)/g, "$1 $$$2");
}

// ---------- Fecha ----------

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const RE_FECHA =
  /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/gi;

function fechaIso(a: number, m: number, d: number): string | null {
  const fecha = new Date(Date.UTC(a, m - 1, d));
  // Date acepta el 31 de febrero y lo convierte en marzo: se comprueba que siga igual.
  if (fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return null;
  return fecha.toISOString().slice(0, 10);
}

function aFecha(c: RegExpExecArray): string | null {
  if (c[1]) return fechaIso(+c[1], +c[2], +c[3]);
  if (c[4]) return fechaIso(+c[6], +c[5], +c[4]);
  const mes = MESES[c[8].toLowerCase()];
  return mes ? fechaIso(+c[9], mes, +c[7]) : null;
}

function buscarFecha(lineas: string[]): string | null {
  let sinEtiqueta: string | null = null;
  for (const linea of lineas) {
    let finAnterior = 0;
    for (const coincidencia of linea.matchAll(RE_FECHA)) {
      const inicio = coincidencia.index;
      const delante = linea.slice(finAnterior, inicio);
      const detras = linea.slice(inicio + coincidencia[0].length);
      finAnterior = inicio + coincidencia[0].length;

      // Hay otras fechas que no son la de emisión; se descartan por lo que las acompaña.
      if (/venc|l[ií]mite|resoluci|autoriz|rango|dian|res\./i.test(delante)) continue;
      if (/pref/i.test(detras)) continue; // la resolución del ticket va en su propia línea

      const fecha = aFecha(coincidencia as RegExpExecArray);
      if (!fecha) continue;
      if (/emisi[oó]n|expedici[oó]n|\bfecha\b/i.test(delante)) return fecha;
      sinEtiqueta ??= fecha;
    }
  }
  return sinEtiqueta;
}

// ---------- Número de factura ----------

function buscarNumero(lineas: string[]): string | null {
  for (const linea of lineas) {
    if (/rango|resoluci|autoriz/i.test(linea)) continue;
    // El \b inicial evita tomar el final de «CUFE».
    const m = linea.match(/\bF\s?E\s?[-—–~.]?\s?(\d{6})\b/);
    if (m) return `FE-${m[1]}`;
  }
  return null;
}

// ---------- Documentos (NIT / CC) ----------

// \b evita que «Monitor» cuente como «nit». Se exige una etiqueta para no confundir
// el documento con la resolución (14 dígitos), el teléfono o el CUFE.
const RE_DOCUMENTO =
  /\b(?:N[I1L]T(?:\s*\/\s*CC)?|CC|Documento)\b[\s:.;]*(\d[\d.]*\d(?:\s?-\s?\d)?)/i;
const RE_CONTEXTO_CLIENTE = /\b(?:cliente|adquirente|se[ñn]ores|documento|nit\s*\/\s*cc)\b/i;

type Documento = { linea: number; numero: string; dv: string | null };

function interpretarDocumento(
  texto: string,
): { numero: string; dv: string | null } | null {
  const conGuion = texto.match(/^([\d.]+?)\s?-\s?(\d)$/);
  if (conGuion) {
    const numero = conGuion[1].replace(/\./g, "");
    return numero.length >= 6 && numero.length <= 10
      ? { numero, dv: conGuion[2] }
      : null;
  }
  const digitos = texto.replace(/\./g, "");
  if (digitos.length === 10) {
    // Sin guion, diez dígitos solo son documento + DV si el último dígito lo confirma.
    const numero = digitos.slice(0, -1);
    const dv = digitos.slice(-1);
    return dvValido(numero, dv) ? { numero, dv } : null;
  }
  return digitos.length >= 6 && digitos.length < 10
    ? { numero: digitos, dv: null }
    : null;
}

function buscarDocumentos(lineas: string[]): {
  proveedor: Documento | null;
  cliente: Documento | null;
} {
  let proveedor: Documento | null = null;
  let cliente: Documento | null = null;

  lineas.forEach((linea, i) => {
    const m = linea.match(RE_DOCUMENTO);
    const leido = m && interpretarDocumento(m[1]);
    if (!leido) return;
    const documento = { linea: i, ...leido };
    // El nombre del cliente puede partirse, así que su etiqueta puede estar hasta dos líneas arriba.
    const contexto = lineas.slice(Math.max(0, i - 2), i + 1).join(" ");
    if (RE_CONTEXTO_CLIENTE.test(contexto)) cliente ??= documento;
    else proveedor ??= documento;
  });

  return { proveedor, cliente };
}

// ---------- Nombres ----------

function limpiarTexto(texto: string): string {
  return texto
    .replace(/[|_[\]—–]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\d]+/u, "")
    .replace(/[\s\-,;:]+$/u, "");
}

const RE_ETIQUETA_NIT = /\bN[I1L]T\b/i;
const RE_SUFIJO_SOLO = /^(?:S\.\s?A\.?(?:\s?S\.?)?|L[TI1]DA\.?|E\.\s?U\.?)$/i;
const RE_CORTE_SUFIJO =
  /^(.*?\p{L}.*?\s(?:S\.\s?A\.\s?S\.?|S\.\s?A\.?|L[TI1]DA\.?|E\.\s?U\.?))(?=\s|$)/iu;

// El título va en la misma zona que la razón social y a veces se parte entre sus líneas.
// Solo se busca en mayúsculas para no tocar un nombre como «Ventas del Norte».
function quitarTitulo(linea: string): string {
  return linea
    .replace(/\bFACTURA(?:\s+ELECTR[ÓO]NICA)?(?:\s+DE)?(?:\s+VENTA)?\b/g, " ")
    .replace(/\bELECTR[ÓO]NICA(?:\s+DE)?(?:\s+VENTA)?\b/g, " ")
    .replace(/\bVENTA\b/g, " ");
}

function buscarRazonSocial(lineas: string[], iNit: number): string | null {
  const partes: string[] = [];
  const mismaLinea = lineas[iNit].split(RE_ETIQUETA_NIT)[0];
  if (mismaLinea) partes.push(limpiarTexto(quitarTitulo(mismaLinea)));

  for (let i = iNit - 1; i >= Math.max(0, iNit - 4); i--) {
    if (/\d/.test(lineas[i])) break; // ya no es el bloque del nombre
    const parte = limpiarTexto(quitarTitulo(lineas[i]));
    // «. e . .» o «Ze Z» son ruido del logotipo, salvo que sea un sufijo como «S.A.».
    if (/\p{L}{4,}/u.test(parte) || RE_SUFIJO_SOLO.test(parte)) partes.unshift(parte);
  }

  const nombre = partes.filter(Boolean).join(" ").trim();
  if (!nombre) return null;
  return nombre.match(RE_CORTE_SUFIJO)?.[1] ?? nombre;
}

function buscarNombreCliente(lineas: string[], iDocumento: number): string | null {
  const RE_ETIQUETA = /\b(?:cliente|adquirente|se[ñn]ores)\b/i;
  let inicio = -1;
  for (let i = iDocumento; i >= Math.max(0, iDocumento - 3); i--) {
    if (RE_ETIQUETA.test(lineas[i])) {
      inicio = i;
      break;
    }
  }
  if (inicio < 0) return null;

  const partes: string[] = [];
  for (let i = inicio; i <= iDocumento; i++) {
    let parte = lineas[i];
    if (i === inicio) {
      parte = parte
        .replace(/^.*?\b(?:cliente|adquirente|se[ñn]ores)\b\s*[:.]?/i, "")
        .replace(/^\s*datos de la factura\s*$/i, "");
    }
    // En la misma línea pueden venir los datos de la columna vecina.
    parte = limpiarTexto(
      parte.replace(/\b(?:N[I1L]T|Documento|Emisi[oó]n|Vence|Fecha)\b.*$/i, ""),
    );
    if (parte) partes.push(parte);
  }
  return partes.join(" ") || null;
}

// ---------- Ítems ----------

const RE_DIRECCION =
  /^\W*(?:cra|carrera|calle|cl|av|avenida|diag|diagonal|transversal|tv)\b/i;

function parecerDescripcion(texto: string): boolean {
  return /\p{Ll}{3,}/u.test(texto) && !/^\W*cant\b|descripci[oó]n/i.test(texto);
}

function interpretarItem(linea: string): (ItemParcial & { conDescripcion: boolean }) | null {
  if (RE_DIRECCION.test(linea)) return null;
  const importes = [...linea.matchAll(/\$(\d{1,3}(?:\.\d{3})*)/g)];
  if (importes.length < 2) return null;

  const precioUnitario = aEntero(importes[importes.length - 2][1]);
  const subtotal = aEntero(importes[importes.length - 1][1]);
  if (precioUnitario < PRECIO_MINIMO_ITEM) return null;

  // El «1 |» inicial es la columna con el número de fila, no la cantidad.
  const izquierda = linea
    .slice(0, importes[0].index)
    .replace(/^[|\s]*\d+\s*\|/, "");
  const alFinal = izquierda.match(/(\d+)\s*[xX×|]*\s*$/);
  const alInicio = izquierda.match(/^[|\s]*(\d+)\b/);

  let cantidad: number | null = null;
  let descripcion = izquierda;

  // La cantidad puede ir al inicio o al final, y «… suspensión de 4» también termina
  // en número: se elige el candidato que cumple cantidad × precio = subtotal.
  if (alFinal && Number(alFinal[1]) * precioUnitario === subtotal) {
    cantidad = Number(alFinal[1]);
    descripcion = izquierda.slice(0, alFinal.index);
  } else if (alInicio && Number(alInicio[1]) * precioUnitario === subtotal) {
    cantidad = Number(alInicio[1]);
    descripcion = izquierda.slice(alInicio[0].length);
  } else {
    // Redundancia aritmética: si el subtotal es múltiplo exacto del precio, la cantidad se deduce.
    const deducida = subtotal / precioUnitario;
    if (Number.isInteger(deducida) && deducida > 0 && deducida <= CANTIDAD_MAXIMA_REPARABLE) {
      cantidad = deducida;
      if (alInicio) descripcion = izquierda.slice(alInicio[0].length);
    }
  }

  // «la Monitor LED»: «4 |» mal leído antes de la descripción.
  const limpia = limpiarTexto(descripcion).replace(/^\p{L}{1,2}\s+(?=\p{Lu})/u, "");
  return {
    descripcion: limpia,
    cantidad,
    precioUnitario,
    subtotal,
    conDescripcion: parecerDescripcion(limpia),
  };
}

function buscarItems(lineas: string[], desde: number, hasta: number): ItemParcial[] {
  const items: ItemParcial[] = [];
  let pendientes: string[] = [];

  for (const linea of lineas.slice(desde, hasta)) {
    const interpretado = interpretarItem(linea);
    if (!interpretado) {
      const texto = limpiarTexto(linea);
      if (parecerDescripcion(texto)) pendientes.push(texto);
      continue;
    }

    const { conDescripcion, ...item } = interpretado;
    if (conDescripcion) {
      // Con la descripción en la línea de los importes, lo que quedó pendiente
      // era la continuación del ítem anterior (o encabezados, si aún no hay ítems).
      const anterior = items[items.length - 1];
      if (anterior && pendientes.length > 0) {
        anterior.descripcion = [anterior.descripcion, ...pendientes].join(" ");
      }
    } else {
      // Ticket: la descripción va en las líneas de arriba.
      item.descripcion = pendientes.join(" ");
    }
    pendientes = [];
    items.push(item);
  }

  const ultimo = items[items.length - 1];
  if (ultimo && pendientes.length > 0) {
    ultimo.descripcion = [ultimo.descripcion, ...pendientes].join(" ");
  }
  return items;
}

// ---------- Totales ----------

const RE_SUBTOTAL = /\b(?:sub\s?total|valor\s+antes|base\s+gravable)\b/i;
// Empieza por IVA, para no tomar «Responsable de IVA»; admite la etiqueta pegada «IVA19%».
const RE_IVA = /^[^\p{L}]*I\s?V\s?A(?!\p{L})/iu;
// «Impresora» también empieza por «imp»: se exige la palabra «consumo».
const RE_IMPOCONSUMO =
  /\bimpoconsumo\b|\bimp\.?\s*consumo\b|\bimpuesto\s+(?:nacional\s+)?al\s+consumo\b/i;
const RE_TOTAL = /\btotal\b/i;

function ultimoImporte(linea: string): number | null {
  // Sin esto, el 19 de «19%» podría confundirse con un importe.
  const sinPorcentajes = linea.replace(/\d+\s*%/g, " ");
  const importes = [...sinPorcentajes.matchAll(/\$\d+(?:\.\d{3})*|\d{1,3}(?:\.\d{3})+/g)];
  const ultimo = importes[importes.length - 1];
  return ultimo ? aEntero(ultimo[0].replace("$", "")) : null;
}

function esLineaDeTotales(linea: string): boolean {
  if (ultimoImporte(linea) === null) return false;
  return RE_SUBTOTAL.test(linea) || RE_IVA.test(linea) || RE_TOTAL.test(linea);
}

function buscarTotales(lineas: string[], desde: number) {
  let subtotal: number | null = null;
  let iva: number | null = null;
  let impoconsumo: number | null = null;
  let total: number | null = null;

  for (const linea of lineas.slice(desde)) {
    const valor = ultimoImporte(linea);
    if (valor === null) continue;
    if (RE_SUBTOTAL.test(linea)) subtotal ??= valor;
    else if (RE_IVA.test(linea)) iva ??= valor;
    else if (RE_IMPOCONSUMO.test(linea)) impoconsumo ??= valor;
    else if (RE_TOTAL.test(linea)) total = valor; // la última línea «total» es la buena
  }
  return { subtotal, iva, impoconsumo, total };
}

// ---------- Función principal ----------

export function extraer(textoOcr: string): ParcialFactura {
  const lineas = textoOcr.split(/\r?\n/).map(normalizarLinea).filter(Boolean);

  const { proveedor, cliente } = buscarDocumentos(lineas);
  const desdeItems = cliente ? cliente.linea + 1 : 0;

  // El encabezado de la tabla también dice «Subtotal», pero no trae importe: no abre los totales.
  const inicioTotales = lineas.findIndex(
    (linea, i) =>
      i >= desdeItems && esLineaDeTotales(linea) && !/descripci[oó]n/i.test(linea),
  );
  const hayTotales = inicioTotales >= 0;

  return {
    numero: buscarNumero(lineas),
    fecha: buscarFecha(lineas),
    proveedor: proveedor ? buscarRazonSocial(lineas, proveedor.linea) : null,
    nitProveedor: proveedor?.numero ?? null,
    dvProveedor: proveedor?.dv ?? null,
    clienteDocumento: cliente?.numero ?? null,
    clienteDv: cliente?.dv ?? null,
    clienteNombre: cliente ? buscarNombreCliente(lineas, cliente.linea) : null,
    items: buscarItems(
      lineas,
      desdeItems,
      hayTotales ? inicioTotales : lineas.length,
    ),
    mencionaImpoconsumo: lineas.some((linea) => RE_IMPOCONSUMO.test(linea)),
    ...(hayTotales
      ? buscarTotales(lineas, inicioTotales)
      : { subtotal: null, iva: null, impoconsumo: null, total: null }),
  };
}
