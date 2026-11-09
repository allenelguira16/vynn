import { defineConfig } from "vitest/config";

import { vynnOxcPlugin } from "../vite-plugin/src/plugins/jsx-transpiler.ts";

export default defineConfig({
  plugins: [vynnOxcPlugin()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",

    clearMocks: true,
    restoreMocks: true,

    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",

      // Include untested modules as well.
      include: ["src/**/*.ts", "tests/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
