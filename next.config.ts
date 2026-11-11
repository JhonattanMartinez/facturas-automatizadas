import type { NextConfig } from "next";

const DATOS_IDIOMA = "./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*";

// tesseract carga su núcleo y sus dependencias con require dinámico desde otro hilo:
// el trazador de archivos no los ve y, sin esta lista, no entran en la función.
// Va todo el núcleo porque la variante que se usa depende de la CPU de cada instancia.
const ARCHIVOS_OCR = [
  DATOS_IDIOMA,
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/**/*",
  "./node_modules/bmp-js/**/*",
  "./node_modules/idb-keyval/**/*",
  "./node_modules/is-url/**/*",
  "./node_modules/regenerator-runtime/**/*",
  "./node_modules/wasm-feature-detect/**/*",
  "./node_modules/zlibjs/**/*",
  "./node_modules/whatwg-url/**/*",
  "./node_modules/tr46/**/*",
  "./node_modules/webidl-conversions/**/*",
];

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // tesseract.js usa hilos y WASM: si el empaquetador lo procesa, deja de funcionar.
  serverExternalPackages: ["tesseract.js"],
  outputFileTracingIncludes: {
    "/api/salud": [DATOS_IDIOMA],
    "/api/procesos/**": ARCHIVOS_OCR,
    "/api/prueba-ocr": ARCHIVOS_OCR, // temporal, Fase 5
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
