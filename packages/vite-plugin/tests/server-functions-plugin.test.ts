import { describe, expect, it } from "vitest";

import { DEFAULT_SERVER_FUNCTION_ENDPOINT } from "../../vynn-core/src/server-functions/constants.ts";
import { serverFunctions } from "../src/index.ts";
import { makeClientRuntime, makeServerRuntime } from "../src/plugins/server-functions/runtime.ts";
import { DEFAULT_ENDPOINT } from "../src/plugins/server-functions/shared.ts";

describe("standalone server-function Vite integration", () => {
  it("keeps the Vite endpoint default aligned with the core runtime", () => {
    expect(DEFAULT_ENDPOINT).toBe(DEFAULT_SERVER_FUNCTION_ENDPOINT);
  });

  it("exposes a standalone plugin without requiring Vynn app mode", () => {
    const plugin = serverFunctions({ endpoint: "/rpc" });

    expect(plugin.name).toBe("vynn-server-functions");
  });

  it("configures the framework client runtime with the selected endpoint", () => {
    const code = makeClientRuntime("/rpc");

    expect(code).toContain('from "vynn/server-functions/client"');
    expect(code).toContain('endpoint: "/rpc"');
    expect(code).not.toContain("async function invokeServerFunction");
  });

  it("delegates server dispatch to the framework runtime and resolves emitted chunks", () => {
    const code = makeServerRuntime("/rpc", {
      maxRequestBytes: 1024,
      allowedOrigins: ["https://trusted.test"],
      exposeErrors: false,
      development: false,
      manifestSentinel: "__manifest__",
    });

    expect(code).toContain('from "vynn/server-functions/server"');
    expect(code).toContain("createServerFunctionHandler");
    expect(code).toContain("resolve: development ? undefined : resolveImplementation");
    expect(code).toContain("new URL(path, import.meta.url)");
    expect(code).not.toContain("function isAllowedOrigin");
  });
});
