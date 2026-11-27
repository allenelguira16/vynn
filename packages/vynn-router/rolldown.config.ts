import { defineConfig } from "rolldown";

import { createPackageBuild } from "../../build/rolldown.ts";

export default defineConfig(
  createPackageBuild({
    entries: {
      index: "src/index.tsx",
    },
    transformVynnJsx: true,
  }),
);
