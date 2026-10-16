import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    // "node" por defecto: jsdom usa su propio realm para TextEncoder/
    // Uint8Array, lo que rompe los chequeos `instanceof` de jose al firmar
    // JWT. Los tests de lib/ y app/api/ son lógica de servidor, no DOM.
    // Un test de componente que necesite DOM puede anular esto por archivo
    // con la pragma `// @vitest-environment jsdom` al inicio del archivo.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./tests/db-global-setup.ts"],
    // Los tests de lib/data/*.test.ts comparten una sola base de datos real
    // (ver tests/db-global-setup.ts): correr archivos de test en paralelo
    // los haría competir por las mismas filas y producir resultados
    // inestables, así que se corren secuencialmente.
    fileParallelism: false,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "app/api/**"],
    },
  },
});
