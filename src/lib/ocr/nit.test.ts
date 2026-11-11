import { describe, expect, it } from "vitest";
import { digitoVerificacion, dvValido } from "./nit";

describe("dígito de verificación del NIT", () => {
  it.each([
    ["890903938", "8"],
    ["860034313", "7"],
    ["899999068", "1"],
    ["856162509", "7"], // tomados de facturas reales del conjunto
    ["893333396", "0"],
  ])("%s tiene DV %s", (nit, dv) => {
    expect(digitoVerificacion(nit)).toBe(dv);
    expect(dvValido(nit, dv)).toBe(true);
  });

  it("rechaza un DV equivocado", () => {
    expect(dvValido("856162509", "4")).toBe(false);
  });

  it("rechaza datos ausentes en vez de darlos por buenos", () => {
    expect(dvValido("856162509", null)).toBe(false);
    expect(dvValido(null, "7")).toBe(false);
  });
});
