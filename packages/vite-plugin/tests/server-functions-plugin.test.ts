import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";

import { describe, expect, it } from "vitest";

import { DEFAULT_SERVER_FUNCTION_ENDPOINT } from "../../vynn-core/src/server-functions/constants.ts";
import { serverFunctions } from "../src/index.ts";
import { registerServerFunctionDevMiddleware } from "../src/plugins/server-functions/dev-middleware.ts";
import { createServerFunctionManifestCode } from "../src/plugins/server-functions/index.ts";
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
    expect(code).toContain("createServerReference(id, getCaptures)");
    expect(code).not.toContain("async function invokeServerFunction");
  });

  it("falls back to the default endpoint when no client endpoint is supplied", () => {
    const code = makeClientRuntime(undefined as unknown as string);

    expect(code).toContain('endpoint: "/__vynn/server-function"');
  });

  it("passes captures to extracted implementations in the development handler", async () => {
    let middleware:
      | ((request: IncomingMessage, response: ServerResponse, next: () => void) => void)
      | undefined;
    let handlerOptions: Record<string, unknown> | undefined;
    let resolveHandlerReady!: () => void;
    const handlerReady = new Promise<void>((resolve) => {
      resolveHandlerReady = resolve;
    });

    const server = {
      environments: {
        ssr: {
          runner: {
            import: async () => ({
              createServerFunctionHandler: (options: Record<string, unknown>) => {
                handlerOptions = options;
                resolveHandlerReady();
                return async () => null;
              },
            }),
          },
        },
      },
      middlewares: {
        use: (callback: typeof middleware) => {
          middleware = callback;
        },
      },
    } as unknown as ViteDevServer;

    registerServerFunctionDevMiddleware(server, {
      endpoint: DEFAULT_ENDPOINT,
      allowedOrigins: [],
      isDevelopment: true,
      refsById: new Map(),
    });

    middleware?.(
      {
        url: DEFAULT_ENDPOINT,
        method: "GET",
        headers: { host: "app.test" },
        socket: { encrypted: false },
      } as unknown as IncomingMessage,
      {} as ServerResponse,
      () => undefined,
    );

    await handlerReady;
    expect(handlerOptions).toMatchObject({ resolveWithCaptures: true });
  });

  it("generates a deduplicated static-import manifest for server-function modules", () => {
    const code = createServerFunctionManifestCode([
      "/app/src/actions/users.ts",
      "/app/src/actions/posts.ts",
      "/app/src/actions/users.ts",
    ]);

    expect(code).toContain('import "/app/src/actions/users.ts";');
    expect(code).toContain('import "/app/src/actions/posts.ts";');
    expect(code.match(/import /g)).toHaveLength(2);
    expect(code).toContain("export {};");
  });

  it("uses runtime-registered implementations instead of emitted function chunks", () => {
    const code = makeServerRuntime("/rpc", {
      maxRequestBytes: 1024,
      allowedOrigins: ["https://trusted.test"],
      exposeErrors: false,
      development: false,
    });

    expect(code).toContain('from "vynn/server-functions/server"');
    expect(code).toContain("createServerFunctionHandler");
    expect(code).toContain("createServerReference(implementation, id, getCaptures)");
    expect(code).toContain("resolveWithCaptures: true");
    expect(code).not.toContain("resolveImplementation");
    expect(code).not.toContain("new URL(path, import.meta.url)");
    expect(code).not.toContain("Invalid Vynn server-function entry chunk");
  });
});
