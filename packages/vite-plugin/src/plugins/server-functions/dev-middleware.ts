import type { ViteDevServer } from "vite";
import { SERVER_RUNTIME_ID, type ServerFunctionReference } from "./shared.ts";
import {
  createServerFunctionRequest,
  readLimitedBody,
  sendJson,
} from "./http.ts";

type ServerFunctionDevMiddlewareOptions = {
  endpoint: string;
  allowedOrigins: string[];
  maxRequestBytes: number;
  exposeErrors?: boolean;
  isDevelopment: boolean;
  refsById: Map<string, ServerFunctionReference>;
};

/** Register the development RPC endpoint and dispatch server-function calls. */
export function registerServerFunctionDevMiddleware(
  server: ViteDevServer,
  {
    endpoint,
    allowedOrigins,
    maxRequestBytes,
    exposeErrors,
    isDevelopment,
    refsById,
  }: ServerFunctionDevMiddlewareOptions,
): void {
  server.middlewares.use((request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://vynn.local").pathname;
    if (pathname !== endpoint) {
      next();
      return;
    }

    void (async () => {
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, { ok: false, error: "Method Not Allowed" });
        return;
      }

      const contentType = (request.headers["content-type"] ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json") {
        sendJson(response, 415, {
          ok: false,
          error: "Expected application/json.",
        });
        return;
      }

      const origin = request.headers.origin;
      const encrypted = Boolean(
        (request.socket as { encrypted?: boolean }).encrypted,
      );
      const expectedOrigin = `${encrypted ? "https" : "http"}://${request.headers.host ?? "localhost"}`;
      if (
        !origin ||
        (origin !== expectedOrigin && !allowedOrigins.includes(origin))
      ) {
        sendJson(response, 403, {
          ok: false,
          error: "Cross-origin request rejected.",
        });
        return;
      }

      let payload: unknown;
      let requestBody = "";
      try {
        requestBody = await readLimitedBody(request, maxRequestBytes);
        payload = JSON.parse(requestBody);
      } catch (error) {
        const statusCode =
          (error as Error & { statusCode?: number }).statusCode ?? 400;
        sendJson(response, statusCode, {
          ok: false,
          error:
            statusCode === 413
              ? "Request body too large."
              : "Invalid JSON request body.",
        });
        return;
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { id?: unknown }).id !== "string" ||
        !/^vynn_[a-f0-9]{20}$/.test((payload as { id: string }).id) ||
        !Array.isArray((payload as { args?: unknown }).args) ||
        (payload as { args: unknown[] }).args.length > 100
      ) {
        sendJson(response, 400, {
          ok: false,
          error: "Expected { id: string, args: unknown[] }.",
        });
        return;
      }

      const functionId = (payload as { id: string }).id;
      const args = (payload as { args: unknown[] }).args;
      const reference = refsById.get(functionId);
      if (!reference) {
        sendJson(response, 404, {
          ok: false,
          error: "Unknown Vynn server function.",
        });
        return;
      }

      try {
        const environments = (
          server as unknown as {
            environments?: Record<
              string,
              {
                runner?: {
                  import: (id: string) => Promise<Record<string, unknown>>;
                };
              }
            >;
            ssrLoadModule?: (id: string) => Promise<Record<string, unknown>>;
          }
        ).environments;
        const ssrEnvironment = environments?.ssr;
        const moduleExports = ssrEnvironment?.runner
          ? await ssrEnvironment.runner.import(reference.moduleId)
          : await (
              server as unknown as {
                ssrLoadModule: (id: string) => Promise<Record<string, unknown>>;
              }
            ).ssrLoadModule(reference.moduleId);
        const implementation = moduleExports[reference.exportName];
        if (typeof implementation !== "function")
          throw new Error("Vynn server implementation is not exported.");
        const runtimeModule = ssrEnvironment?.runner
          ? await ssrEnvironment.runner.import(SERVER_RUNTIME_ID)
          : await (
              server as unknown as {
                ssrLoadModule: (id: string) => Promise<Record<string, unknown>>;
              }
            ).ssrLoadModule(SERVER_RUNTIME_ID);
        const invoke = runtimeModule.invokeServerFunction;
        if (typeof invoke !== "function")
          throw new Error("Vynn server-function runtime is not available.");
        const contextRequest = createServerFunctionRequest(
          request,
          requestBody,
        );
        const value = await (
          invoke as (
            id: string,
            args: unknown[],
            request: Request,
            implementation: (...args: unknown[]) => unknown,
          ) => Promise<unknown>
        )(
          functionId,
          args,
          contextRequest,
          implementation as (...args: unknown[]) => unknown,
        );
        let serialized: string;
        try {
          serialized = JSON.stringify({ ok: true, value });
        } catch {
          sendJson(response, 500, {
            ok: false,
            error: "Server function returned a non-serializable value.",
          });
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.setHeader("cache-control", "no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.end(serialized ?? JSON.stringify({ ok: true }));
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          error:
            (exposeErrors ?? isDevelopment) && error instanceof Error
              ? error.message
              : "Server function failed.",
        });
      }
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      sendJson(response, 500, {
        ok: false,
        error:
          (exposeErrors ?? isDevelopment) && error instanceof Error
            ? error.message
            : "Server function request failed.",
      });
    });
  });
}
