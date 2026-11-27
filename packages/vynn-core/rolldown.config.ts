import { defineConfig } from "rolldown";

import { createPackageBuild } from "../../build/rolldown.ts";

export default defineConfig(
  createPackageBuild({
    entries: {
      index: "src/index.ts",
      "jsx-runtime": "src/jsx-runtime.ts",
      render: "src/render/index.ts",
      client: "src/client/index.ts",
      server: "src/server/index.ts",
      "server/node": "src/server/node.ts",
      "server-functions/client": "src/server-functions/client.ts",
      "server-functions/server": "src/server-functions/server.ts",
    },
    preserveModules: true,
    preserveModulesRoot: "src",
  }),
);
