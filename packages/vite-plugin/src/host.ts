import type { ResolvedConfig, ViteDevServer } from "vite";

import { getVynnSsrCssLinks, type VynnSsrCssLink } from "./plugins/ssr-css.ts";

/**
 * Vite's RunnableDevEnvironment is defined by the presence of a module runner.
 * Check structurally rather than using instanceof: linked workspaces can load
 * a different Vite module instance from the one that created the environment.
 */
export function isRunnableViteEnvironment(environment: unknown): boolean {
  return !!environment && typeof environment === "object" && "runner" in environment;
}

/**
 * Detects whether another Vite integration owns server build/runtime
 * orchestration. This is capability-based: no provider names are inspected.
 */
export function hasExternalViteDeployment(config: ResolvedConfig): boolean {
  const hasBuildOrchestrator = config.plugins.some(
    (plugin) => !plugin.name.startsWith("vynn-") && plugin.buildApp !== undefined,
  );
  if (hasBuildOrchestrator) return true;

  const environments = (
    config as ResolvedConfig & {
      environments?: Record<
        string,
        {
          consumer?: string;
          dev?: { createEnvironment?: unknown };
        }
      >;
    }
  ).environments;

  return Object.entries(environments ?? {}).some(
    ([name, environment]) =>
      name !== "client" &&
      (typeof environment.dev?.createEnvironment === "function" ||
        (name !== "ssr" && environment.consumer === "server")),
  );
}

/** The Vite environment that contains Vynn's server entry. */
export const VYNN_SSR_ENVIRONMENT = "ssr" as const;

/** The virtual entry exported by Vynn's SSR environment. */
export const VYNN_SSR_HANDLER_ID = "virtual:vynn/ssr-handler";

export type VynnSsrHandler = {
  handleRequest(request: Request, cssLinks?: VynnSsrCssLink[]): Promise<Response>;
};

/** Default export shape of the production SSR service bundle. */
export type VynnSsrService = {
  fetch(request: Request): Promise<Response>;
};

/**
 * Loads Vynn's SSR handler from a runnable Vite SSR environment.
 *
 * Most deployment plugins consume the built "ssr" environment directly.
 * This helper is for custom integrations that need the live dev handler.
 */
export async function loadVynnSsrHandler(server: ViteDevServer): Promise<VynnSsrHandler> {
  const environment = server.environments[VYNN_SSR_ENVIRONMENT] as unknown as
    | {
        runner?: {
          import(id: string): Promise<unknown>;
        };
      }
    | undefined;

  if (!isRunnableViteEnvironment(environment)) {
    throw new Error(
      "[Vynn] The SSR environment does not expose a Module Runner. External Vite hosts require a runnable SSR environment.",
    );
  }

  const runner = (environment as { runner: { import(id: string): Promise<unknown> } }).runner;
  const handler = (await runner.import(VYNN_SSR_HANDLER_ID)) as
    | Partial<VynnSsrHandler>
    | undefined;

  if (typeof handler?.handleRequest !== "function") {
    throw new TypeError("[Vynn] The SSR handler module does not export handleRequest().");
  }

  return handler as VynnSsrHandler;
}

/**
 * Handles a development request through Vynn's SSR environment, including
 * styles collected from the Vite client module graph.
 */
export async function handleVynnDevRequest(
  server: ViteDevServer,
  request: Request,
): Promise<Response> {
  const handler = await loadVynnSsrHandler(server);
  const cssLinks = await getVynnSsrCssLinks(server);
  return handler.handleRequest(request, cssLinks);
}
