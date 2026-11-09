import { defineConfig } from "vitest/config";

import { vynnOxcPlugin } from "../vite-plugin/src/plugins/jsx-transpiler.ts";

export default defineConfig({
  plugins: [vynnOxcPlugin()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
