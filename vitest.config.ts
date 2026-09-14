import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // See tests/stubs/server-only.ts: the real package throws on import
      // outside a server build, which would make every database-backed module
      // untestable.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
