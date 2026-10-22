import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Las pruebas comparten una base Postgres real.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
