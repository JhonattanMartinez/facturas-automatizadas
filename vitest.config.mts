import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Vitest no lee los alias de tsconfig.json: hay que repetirlo aquí.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: { include: ["src/**/*.test.ts"] },
});
