import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import path from "node:path";

// Live provider smoke tests: real API calls, real tokens. Run manually with `npm run ai:smoke`.
// Keys are loaded from .env.local into the test process only; tests never print them.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/unit/empty.ts") } },
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
