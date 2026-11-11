import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraer } from "./extractor";
import { validar } from "./validador";

function factura(numero: string): string {
  return readFileSync(
    path.join(process.cwd(), "src/lib/ocr/__fixtures__", `factura_${numero}.txt`),
    "utf8",
  );
}

const cantidades = (texto: string) =>
  extraer(texto).items.map((item) => item.cantidad);

describe("facturas reales, un caso por diseño", () => {
  it("encabezado de color", () => {
    const f = extraer(factura("0001"));
    expect(f).toMatchObject({
      numero: "FE-000833",
      fecha: "2026-10-16",
      proveedor: "Infotec Rico Rubio S.A.",
      nitProveedor: "856162509",
      dvProveedor: "7",
      clienteDocumento: "869745262",
      clienteDv: "3",
      clienteNombre: "Inversiones Rangel Batista S.A.S.",
      subtotal: 5457000,
      iva: 1036830,
      impoconsumo: null,
      total: 6493830,
    });
    expect(f.items).toEqual([
      { descripcion: "Monitor LED 24 pulgadas Full HD", cantidad: 5, precioUnitario: 763900, subtotal: 3819500 },
      { descripcion: "Impresora multifuncional láser monocromática con red", cantidad: 1, precioUnitario: 1637500, subtotal: 1637500 },
    ]);
    expect(validar(f)).toEqual([]);
  });

  it("tabla clásica, con cantidades perdidas por el OCR", () => {
    const f = extraer(factura("0101"));
    expect(f).toMatchObject({
      numero: "FE-000564",
      fecha: "2026-08-28",
      proveedor: "Infotec Rico Rubio S.A.",
      nitProveedor: "856162509",
      clienteDocumento: "811329549",
      clienteNombre: "Tomás Ramos Ávila Pantoja Pineda",
      subtotal: 17414600,
      total: 20723374,
    });
    expect(cantidades(factura("0101"))).toEqual([1, 5, 3, 8, 1]);
    expect(f.items[0].descripcion).toBe("Impresora multifuncional láser monocromática con red");
    expect(f.items[3].descripcion).toBe("Monitor LED 24 pulgadas Full HD");
    expect(validar(f)).toEqual([]);
  });

  it("ticket angosto, con la descripción antes de los importes", () => {
    const f = extraer(factura("0701"));
    expect(f).toMatchObject({
      numero: "FE-000357",
      fecha: "2026-09-09",
      proveedor: "DIGITALWARE GARRIDO SALINAS S.A.S.",
      nitProveedor: "863060268",
      clienteDocumento: "855419738",
      clienteNombre: "Inversiones Briseño Gallegos S.A.S.",
      subtotal: 2480400,
      iva: 471276,
      total: 2951676,
    });
    expect(cantidades(factura("0701"))).toEqual([1, 9, 7, 5]);
    expect(f.items[0].descripcion).toBe("UPS interactiva 1000 VA");
    expect(validar(f)).toEqual([]);
  });

  it("caja con borde doble, con impoconsumo", () => {
    const f = extraer(factura("0008"));
    expect(f).toMatchObject({
      numero: "FE-000655",
      fecha: "2026-05-30",
      proveedor: "COMUNICACIONES MÓVILES PONCE ROSAS S.A.",
      nitProveedor: "893333396",
      clienteDocumento: "866596161",
      clienteNombre: "Agroindustrias Montemayor Muñiz S.A.S.",
      subtotal: 2130900,
      iva: 404871,
      impoconsumo: 85236,
      mencionaImpoconsumo: true,
      total: 2621007,
    });
    expect(cantidades(factura("0008"))).toEqual([4, 16, 15, 7]);
    expect(validar(f)).toEqual([]);
  });
});

describe("razón social", () => {
  it("partida en dos líneas con el título en medio", () => {
    const f = extraer(factura("0558"));
    expect(f.proveedor).toBe("Operadora de Telecomunicaciones Bravo Leyva S.A.S.");
    expect(f.impoconsumo).toBe(113568);
    expect(f.items[1].descripcion).toBe("Plan postpago móvil 25 GB y voz ilimitada, línea corporativa");
    expect(validar(f)).toEqual([]);
  });

  it("partida en tres líneas con el título repartido", () => {
    const f = extraer(factura("0908"));
    expect(f.proveedor).toBe("Distribuidora de Acabados Camarillo Arguello S.A.");
    // «…suspensión de 4» no es la cantidad: la cantidad real (16) cumple la aritmética.
    expect(cantidades(factura("0908"))).toEqual([14, 7, 16, 50, 3]);
  });

  it("en dos líneas, con el sufijo junto a la segunda parte", () => {
    expect(extraer(factura("0458")).proveedor).toBe("MATERIALES Y CONSTRUCCIONES CALDERA ALARCÓN S.A.S.");
  });

  it("reconoce un sufijo mal leído (LIDA por LTDA)", () => {
    expect(extraer(factura("0508")).proveedor).toBe("DISTRIBUCIONES ESCOLARES TAMEZ RUBIO LIDA.");
  });
});

describe("documentos", () => {
  it("guion perdido: acepta el último dígito si es un DV válido", () => {
    const f = extraer(factura("0601"));
    expect(f.clienteDocumento).toBe("895283102");
    expect(f.clienteDv).toBe("4");
  });

  it("guion perdido en un NIT con puntos", () => {
    const f = extraer("Ferretería Cerda de Anda Ltda.\nNIT:869.718.8065 No. FE-000630");
    expect(f.nitProveedor).toBe("869718806");
    expect(f.dvProveedor).toBe("5");
  });

  it("no acepta un NIT mal leído aunque tenga el formato correcto", () => {
    // La imagen dice 869.718.806-5; el OCR leyó un 8 como 9 y perdió el guion.
    expect(extraer(factura("0301")).nitProveedor).toBeNull();
  });

  it("guion perdido: no acepta un último dígito que no sea DV válido", () => {
    const f = extraer("Documento: 8952831029\nSubtotal $1.000");
    expect(f.clienteDocumento).toBeNull();
  });

  it("«Monitor» contiene «nit» pero no es un NIT", () => {
    const f = extraer("1 Monitor 123456789-1 $100.000 $100.000\nSubtotal $100.000");
    expect(f.nitProveedor).toBeNull();
  });

  it("el número de resolución de 14 dígitos no es un documento", () => {
    const f = extraer("Resolución DIAN No. 18764721181387 del 2026-02-02");
    expect(f.nitProveedor).toBeNull();
    expect(f.clienteDocumento).toBeNull();
  });

  it("si el NIT del proveedor no se leyó, no toma el del cliente en su lugar", () => {
    const f = extraer("CLIENTE: Pepe Pérez\nNIT: 855419738-9\nSUBTOTAL $1.000");
    expect(f.nitProveedor).toBeNull();
    expect(f.clienteDocumento).toBe("855419738");
  });
});

describe("cifras que no son lo buscado", () => {
  it("la fecha de emisión gana a la de vencimiento y la de resolución", () => {
    const f = extraer(
      "Resolución DIAN 18764 de 2 de febrero de 2026\nVence: 2026-09-27\nEmisión: 2026-08-28",
    );
    expect(f.fecha).toBe("2026-08-28");
  });

  it("ignora la resolución del ticket, que va en su propia línea", () => {
    const f = extraer("Res. DIAN 18764056692409\n19/02/2026 Pref. FE\nFecha: 09/09/2026 16:37:39");
    expect(f.fecha).toBe("2026-09-09");
  });

  it("descarta una fecha que no existe", () => {
    expect(extraer("Emisión: 31/02/2026").fecha).toBeNull();
  });

  it("el número de factura no sale del rango de numeración", () => {
    const f = extraer("Prefijo FE, rango del FE-000001 al FE-050000.\nNo. FE-000564");
    expect(f.numero).toBe("FE-000564");
  });

  it("el CUFE no se confunde con el número de factura", () => {
    expect(extraer("CUFE 000123abc").numero).toBeNull();
  });
});

describe("importes y normalización", () => {
  it("une un importe que el OCR partió con un espacio", () => {
    expect(extraer(factura("0058")).items[3].subtotal).toBe(405000);
    expect(validar(extraer(factura("0058")))).toEqual([]);
  });

  it("entiende la S como un $ mal leído", () => {
    const f = extraer("CLIENTE: A\nNIT: 855419738-9\n3 Cable S146.500 $439.500\nSubtotal $439.500");
    expect(f.items[0]).toMatchObject({ cantidad: 3, precioUnitario: 146500, subtotal: 439500 });
  });

  it("separa cantidad y precio pegados", () => {
    const f = extraer("CLIENTE: A\nNIT: 855419738-9\nCable HDMI 3$146.500 $439.500\nSubtotal $439.500");
    expect(f.items[0]).toMatchObject({ cantidad: 3, precioUnitario: 146500 });
  });

  it("separa cantidad, precio y subtotal pegados si la aritmética cuadra", () => {
    const f = extraer("CLIENTE: A\nNIT: 855419738-9\nCable HDMI 119426.500$4.691.500\nSubtotal $4.691.500");
    expect(f.items[0]).toMatchObject({ cantidad: 11, precioUnitario: 426500, subtotal: 4691500 });
  });

  it("repara una cantidad mal leída con la aritmética", () => {
    expect(cantidades("CLIENTE: A\nNIT: 855419738-9\n7 Cable $100.000 $300.000\nSubtotal $300.000")).toEqual([3]);
  });

  it("una dirección no es un ítem", () => {
    const f = extraer("CLIENTE: A\nNIT: 855419738-9\nCra 115 $48 $7\nSubtotal $1.000");
    expect(f.items).toEqual([]);
  });
});

describe("etiquetas de los totales", () => {
  const base = "CLIENTE: A\nNIT: 855419738-9\n1 Cable $100.000 $100.000\n";

  it("acepta la etiqueta pegada IVA19%", () => {
    expect(extraer(`${base}Subtotal $100.000\nIVA19% $19.000\nTotal $119.000`).iva).toBe(19000);
  });

  it("«Responsable de IVA» no es la línea del IVA", () => {
    const f = extraer(`${base}Subtotal $100.000\nResponsable de IVA $5.000\nTotal $119.000`);
    expect(f.iva).toBeNull();
  });

  it("«Impresora» no es la etiqueta de impoconsumo", () => {
    const f = extraer(`CLIENTE: A\nNIT: 855419738-9\n1 Impresora $100.000 $100.000\nSubtotal $100.000\nImpresora $4.000\nTotal $119.000`);
    expect(f.impoconsumo).toBeNull();
    expect(f.mencionaImpoconsumo).toBe(false);
  });

  it("acepta «Imp. consumo 4 %»", () => {
    expect(extraer(`${base}Subtotal $100.000\nIVA 19% $19.000\nImp. consumo 4 % $4.000\nTotal $123.000`).impoconsumo).toBe(4000);
  });

  it("el encabezado «Subtotal» de la tabla no abre los totales", () => {
    const f = extraer("CLIENTE: A\nNIT: 855419738-9\nCant. Descripción Precio unitario Subtotal\n1 Cable $100.000 $100.000\nSubtotal $100.000");
    expect(f.items).toHaveLength(1);
    expect(f.subtotal).toBe(100000);
  });
});

describe("validar", () => {
  const buena = () => extraer(factura("0701"));

  it("nunca inventa: un texto vacío deja todo en null y da motivos", () => {
    const f = extraer("");
    expect(f.numero).toBeNull();
    expect(f.total).toBeNull();
    expect(f.items).toEqual([]);
    expect(validar(f).length).toBeGreaterThan(0);
  });

  it("detecta un total que no cuadra", () => {
    expect(validar({ ...buena(), total: 9 })).toContainEqual(expect.stringContaining("total"));
  });

  it("detecta un IVA que no es el 19 %", () => {
    expect(validar({ ...buena(), iva: 1000 })).toContainEqual(expect.stringContaining("IVA"));
  });

  it("tolera $1 de redondeo en el IVA", () => {
    const f = buena();
    expect(validar({ ...f, iva: f.iva! + 1, total: f.total! + 1 })).toEqual([]);
  });

  it("detecta un DV de cliente equivocado", () => {
    expect(validar({ ...buena(), clienteDv: "0" })).toContainEqual(expect.stringContaining("cliente"));
  });

  it("detecta ítems que no suman el subtotal", () => {
    const f = buena();
    expect(validar({ ...f, items: f.items.slice(1) })).toContainEqual(expect.stringContaining("ítems"));
  });

  it("detecta una razón social ilegible", () => {
    expect(validar({ ...buena(), proveedor: "A S" })).toContainEqual(expect.stringContaining("razón social"));
  });

  it("detecta impoconsumo mencionado pero ilegible si el total no cuadra sin él", () => {
    const f = extraer(factura("0008"));
    expect(validar({ ...f, impoconsumo: null })).toContainEqual(expect.stringContaining("impoconsumo"));
  });

  it("una factura dañada por el OCR va a revisión", () => {
    expect(validar(extraer(factura("0301"))).length).toBeGreaterThan(0);
  });
});
