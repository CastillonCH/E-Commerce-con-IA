import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const MOCK_AI_PORT = 8099;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // Mock del módulo de IA en modo demo (F4.10) — no hace falta Python
      // ni PyTorch instalados solo para correr Playwright; ai-service real
      // tiene su propia suite de pytest (ver ai-service/README.md).
      command: `node tests/e2e/mock-ai-service.mjs`,
      url: `http://localhost:${MOCK_AI_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { MOCK_AI_PORT: String(MOCK_AI_PORT) },
    },
    {
      command: `npm run build && npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        AUTH_SECRET: "e2e-test-only-secret-key-at-least-32-characters",
        // En CI la variable real la pone el job (Postgres como servicio, ver
        // .github/workflows/ci.yml); en local toma la de tu .env.local si ya
        // corriste db/novastore_postgresql.sql contra tu propio Postgres.
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://postgres:postgres@localhost:5432/novastore_db",
        // Apunta al mock de arriba — nunca al ai-service real en los E2E.
        AI_SERVICE_URL: `http://localhost:${MOCK_AI_PORT}`,
        // lib/storage.ts (vía APP_CONFIG.siteUrl) necesita el origen real
        // para armar la URL absoluta de las fotos subidas localmente (ver
        // migración 001 — producto_imagenes.url exige URL absoluta).
        NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      },
    },
  ],
});
