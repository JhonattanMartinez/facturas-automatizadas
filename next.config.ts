import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // tesseract.js usa hilos y WASM: si el empaquetador lo procesa, deja de funcionar.
  serverExternalPackages: ["tesseract.js"],
  // Los datos del idioma se cargan con una ruta calculada que el trazador no ve,
  // así que hay que pedirlos a mano. La Fase 5 añade las rutas que hacen OCR.
  outputFileTracingIncludes: {
    "/api/salud": ["./node_modules/@tesseract.js-data/spa/4.0.0_best_int/**/*"],
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
