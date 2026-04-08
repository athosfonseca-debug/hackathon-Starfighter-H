import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    envDir: ".",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/server.ts"],
    },
  },
});
