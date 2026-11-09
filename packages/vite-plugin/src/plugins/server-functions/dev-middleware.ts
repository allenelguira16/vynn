import type { ViteDevServer } from "vite";

import { createWebRequest, writeResponse } from "../app/http.ts";
import type { ServerFunctionReference } from "./shared.ts";

type ServerFunctionDevMiddlewareOptions = {
  endpoint: string;
  maxRequestBytes?: number;
  allowedOrigins: string[];
  exposeErrors?: boolean;
  isDevelopment: boolean;
  refsById: Map<string, ServerFunctionReference>;
};

type ServerFunctionImplementation = (...args: unknown[]) => unknown;
type ServerFunctionHandler = (request: Request) => Promise<Response | null>;
type ServerFunctionHandlerFactory = (options: {
  endpoint: string;
  maxRequestBytes?: number;
  allowedOrigins: string[];
  exposeErrors: boolean;
  development: boolean;
  resolve: (
    id: string,
  ) => ServerFunctionImplementation | undefined | Promise<ServerFunctionImplementation | undefined>;
}) => ServerFunctionHandler;

type SsrModuleRunner = {
  import(id: string): Promise<Record<string, unknown>>;
};

/**
 * The dev middleware adapts Node requests and supplies a Vite-backed resolver.
 * The framework runtime owns request validation, serialization, context, and
 * invocation, just as it does in production.
 */
export function registerServerFunctionDevMiddleware(
  server: ViteDevServer,
  {
    endpoint,
    maxRequestBytes,
    allowedOrigins,
    exposeErrors,
    isDevelopment,
    refsById,
  }: ServerFunctionDevMiddlewareOptions,
): void {
  const getSsrImport = (): ((id: string) => Promise<Record<string, unknown>>) => {
    const environments = (
      server as unknown as {
        environments?: Record<string, { runner?: SsrModuleRunner }>;
        ssrLoadModule?: (id: string) => Promise<Record<string, unknown>>;
      }
    ).environments;
    const runner = environments?.ssr?.runner;
    if (runner) return (id) => runner.import(id);

    const legacyImport = (
      server as unknown as {
        ssrLoadModule?: (id: string) => Promise<Record<string, unknown>>;
      }
    ).ssrLoadModule;
    if (legacyImport) return (id) => legacyImport(id);

    throw new Error("[Vynn use server] The Vite SSR module runner is unavailable.");
  };

  const importSsr = (id: string) => getSsrImport()(id);
  let handlerPromise: Promise<ServerFunctionHandler> | undefined;

  const getHandler = (): Promise<ServerFunctionHandler> => {
    handlerPromise ??= importSsr("vynn/server-functions/server").then((module) => {
      const createHandler = module.createServerFunctionHandler;
      if (typeof createHandler !== "function") {
        throw new Error("[Vynn use server] The Vynn server-function runtime is unavailable.");
      }

      const handlerFactory = createHandler as ServerFunctionHandlerFactory;
      return handlerFactory({
        endpoint,
        maxRequestBytes,
        allowedOrigins,
        exposeErrors: exposeErrors ?? isDevelopment,
        development: isDevelopment,
        resolve: async (id) => {
          const reference = refsById.get(id);
          if (!reference) return undefined;

          const moduleExports = await importSsr(reference.moduleId);
          const implementation = moduleExports[reference.exportName];
          if (typeof implementation !== "function") {
            throw new Error(
              `[Vynn use server] The transformed module did not export implementation ${reference.exportName}.`,
            );
          }

          return implementation as ServerFunctionImplementation;
        },
      });
    });

    return handlerPromise;
  };

  server.middlewares.use((incoming, outgoing, next) => {
    const requestUrl = incoming.url ?? "/";
    const pathname = new URL(requestUrl, "http://vynn.local").pathname;
    if (pathname !== endpoint) {
      next();
      return;
    }

    void (async () => {
      const request = createWebRequest(incoming, requestUrl);
      const handler = await getHandler();
      const response = await handler(request);
      if (!response) {
        next();
        return;
      }

      await writeResponse(outgoing, response);
    })().catch((error: unknown) => {
      if (outgoing.headersSent) {
        outgoing.destroy(error instanceof Error ? error : undefined);
        return;
      }
      next(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
