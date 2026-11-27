import { defineConfig } from "rolldown";

import { createPackageBuild } from "../../build/rolldown.ts";

export default defineConfig(
  createPackageBuild({
    entries: {
      index: "src/index.ts",
      "server-functions": "src/server-functions/index.ts",
    },
  }),
);
