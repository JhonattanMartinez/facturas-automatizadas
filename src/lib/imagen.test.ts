import { describe, expect, it } from "vitest";
import { detectarTipoImagen } from "./imagen";
import { limpiarNombre, rutaImagen } from "./rutas";

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff, 0xe0];

describe("tipo real por los primeros bytes", () => {
  it("reconoce un PNG", () => {
    expect(detectarTipoImagen(Buffer.from([...FIRMA_PNG, 1, 2, 3]))).toBe("png");
  });

  it("reconoce un JPEG", () => {
    expect(detectarTipoImagen(Buffer.from([...FIRMA_JPEG, 1, 2, 3]))).toBe("jpeg");
  });

  it("rechaza un texto, aunque se llame .png", () => {
    expect(detectarTipoImagen(Buffer.from("esto no es una imagen"))).toBeNull();
  });

  it("rechaza un archivo más corto que la firma", () => {
    expect(detectarTipoImagen(Buffer.from([0x89, 0x50]))).toBeNull();
  });

  it("rechaza un archivo vacío", () => {
    expect(detectarTipoImagen(Buffer.alloc(0))).toBeNull();
  });
});

describe("rutas de archivo", () => {
  it("quita la extensión declarada, tildes y espacios", () => {
    expect(limpiarNombre("Factura Ñandú 01.PNG")).toBe("Factura-Nandu-01");
  });

  it("no deja salir de la carpeta con ../", () => {
    expect(limpiarNombre("../../secreto.png")).toBe("secreto");
    expect(limpiarNombre("..\\..\\secreto.png")).toBe("secreto");
  });

  it("nunca deja un nombre vacío", () => {
    expect(limpiarNombre("....png")).toBe("archivo");
  });

  it("usa la extensión del tipo real, no la del nombre", () => {
    expect(rutaImagen("abc", 7, "factura_0001.jpg", "png")).toBe(
      "procesos/abc/0007-factura_0001.png",
    );
    expect(rutaImagen("abc", 12, "factura.png", "jpeg")).toBe(
      "procesos/abc/0012-factura.jpg",
    );
  });
});
