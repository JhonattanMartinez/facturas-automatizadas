import { describe, expect, it } from "vitest";
import {
  calcularTasas,
  cambiosDe,
  metricasDesdeEventos,
  metricasVacias,
  proveedoresOrdenados,
  sumarMetricas,
  totalProcesadas,
  type EventoMetricas,
} from "./metricas";

const aceptada = (
  nit: string,
  total: number,
  clienteNuevo = false,
  nombre = `Proveedor ${nit}`,
): Extract<EventoMetricas, { subtotal: unknown }> => ({
  tipo: "aceptada",
  subtotal: total - 19,
  iva: 19,
  impoconsumo: 0,
  total,
  nit,
  nombre,
  clienteNuevo,
});

describe("cambiosDe", () => {
  it("una aceptada suma a sus importes y a su proveedor", () => {
    const cambios = cambiosDe(aceptada("900", 119, true));
    expect(cambios).toContainEqual([["aceptadas", "n"], 1]);
    expect(cambios).toContainEqual([["aceptadas", "total"], 119]);
    expect(cambios).toContainEqual([["proveedores", "900", "n"], 1]);
    expect(cambios).toContainEqual([["proveedores", "900", "total"], 119]);
    expect(cambios).toContainEqual([["proveedores", "900", "nombres", "Proveedor 900"], 1]);
    expect(cambios).toContainEqual([["clientesNuevos"], 1]);
  });

  it("una en revisión no toca a los proveedores: su NIT puede estar mal leído", () => {
    const cambios = cambiosDe({ ...aceptada("900", 119), tipo: "revision" });
    expect(cambios).toContainEqual([["revision", "n"], 1]);
    expect(cambios.some(([ruta]) => ruta[0] === "proveedores")).toBe(false);
  });

  it("los importes que no se leyeron cuentan como cero", () => {
    const cambios = cambiosDe({
      tipo: "revision", subtotal: null, iva: null, impoconsumo: null, total: null,
      nit: null, nombre: null, clienteNuevo: false,
    });
    expect(cambios).toContainEqual([["revision", "total"], 0]);
  });

  it("duplicadas y errores solo suman su contador", () => {
    expect(cambiosDe({ tipo: "duplicada" })).toEqual([[["duplicadas"], 1]]);
    expect(cambiosDe({ tipo: "error" })).toEqual([[["errores"], 1]]);
  });
});

describe("reconstrucción y suma", () => {
  it("reconstruye las métricas desde los eventos", () => {
    const m = metricasDesdeEventos([
      aceptada("900", 100, true),
      aceptada("900", 50),
      { tipo: "duplicada" },
      { tipo: "error" },
    ]);
    expect(m.aceptadas.n).toBe(2);
    expect(m.aceptadas.total).toBe(150);
    expect(m.duplicadas).toBe(1);
    expect(m.errores).toBe(1);
    expect(m.clientesNuevos).toBe(1);
    expect(m.proveedores["900"]).toMatchObject({ n: 2, total: 150 });
  });

  it("suma varios lotes, uniendo proveedores por NIT", () => {
    const suma = sumarMetricas([
      metricasDesdeEventos([aceptada("900", 100)]),
      metricasDesdeEventos([aceptada("900", 50), aceptada("800", 10)]),
    ]);
    expect(suma.aceptadas.n).toBe(3);
    expect(suma.proveedores["900"].total).toBe(150);
    expect(suma.proveedores["800"].n).toBe(1);
  });

  it("sumar no modifica las métricas originales", () => {
    const original = metricasDesdeEventos([aceptada("900", 100)]);
    sumarMetricas([original, original]);
    expect(original.aceptadas.n).toBe(1);
    expect(original.proveedores["900"].n).toBe(1);
    expect(original.proveedores["900"].nombres["Proveedor 900"]).toBe(1);
  });

  it("ordena los proveedores por total, de mayor a menor", () => {
    const m = metricasDesdeEventos([aceptada("1", 10), aceptada("2", 30), aceptada("3", 20)]);
    expect(proveedoresOrdenados(m).map((p) => p.nit)).toEqual(["2", "3", "1"]);
  });
});

describe("un solo nombre por NIT", () => {
  it("muestra el nombre más repetido, no el último leído", () => {
    const m = metricasDesdeEventos([
      aceptada("900", 10, false, "Cavazos Rendón S.A."),
      aceptada("900", 10, false, "Cavazos Rendón S.A."),
      aceptada("900", 10, false, "Cavazos Rendón ECTURA S.A."),
    ]);
    expect(proveedoresOrdenados(m)[0].nombre).toBe("Cavazos Rendón S.A.");
  });

  it("cuenta los nombres de todos los lotes juntos", () => {
    const suma = sumarMetricas([
      metricasDesdeEventos([aceptada("900", 10, false, "Bien")]),
      metricasDesdeEventos([aceptada("900", 10, false, "Bien"), aceptada("900", 10, false, "Mal")]),
    ]);
    expect(proveedoresOrdenados(suma)[0].nombre).toBe("Bien");
  });

  it("en un empate elige siempre el mismo", () => {
    const a = metricasDesdeEventos([aceptada("9", 1, false, "B"), aceptada("9", 1, false, "A")]);
    const b = metricasDesdeEventos([aceptada("9", 1, false, "A"), aceptada("9", 1, false, "B")]);
    expect(proveedoresOrdenados(a)[0].nombre).toBe(proveedoresOrdenados(b)[0].nombre);
  });
});

describe("tasas", () => {
  it("las duplicadas no cuentan en los porcentajes", () => {
    const tasas = calcularTasas(
      metricasDesdeEventos([
        aceptada("900", 100),
        aceptada("900", 100),
        aceptada("900", 100),
        { ...aceptada("900", 100), tipo: "revision" },
        { tipo: "duplicada" },
      ]),
    );
    expect(tasas).toEqual({ distintas: 4, correctas: 3, malas: 1, pctCorrectas: 75, pctMalas: 25 });
  });

  it("un error cuenta como mal leída", () => {
    expect(calcularTasas(metricasDesdeEventos([{ tipo: "error" }])).malas).toBe(1);
  });

  it("sin datos no divide entre cero", () => {
    expect(calcularTasas(metricasVacias())).toEqual({
      distintas: 0, correctas: 0, malas: 0, pctCorrectas: 0, pctMalas: 0,
    });
  });

  it("el avance incluye las duplicadas, que también son archivos terminados", () => {
    const m = metricasDesdeEventos([aceptada("900", 1), { tipo: "duplicada" }, { tipo: "error" }]);
    expect(totalProcesadas(m)).toBe(3);
  });
});
