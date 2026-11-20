import { DEFAULT_ENDPOINT } from "./shared.ts";

export function makeClientRuntime(endpoint: string = DEFAULT_ENDPOINT): string {
  const resolvedEndpoint = endpoint || DEFAULT_ENDPOINT;

  return [
    'import { createServerReference as createVynnServerReference } from "vynn/server-functions/client";',
    "export function createServerReference(id, getCaptures) {",
    `  return createVynnServerReference(id, { endpoint: ${JSON.stringify(resolvedEndpoint)}, getCaptures });`,
    "}",
    "",
  ].join("\n");
}

export function makeServerRuntime(
  endpoint: string,
  options: {
    maxRequestBytes?: number;
    allowedOrigins: string[];
    exposeErrors: boolean;
    development: boolean;
  },
): string {
  return [
    'import { createServerFunctionHandler, createServerReference as createVynnServerReference } from "vynn/server-functions/server";',
    "export function createServerReference(implementation, id, getCaptures) {",
    "  return createVynnServerReference(implementation, id, getCaptures);",
    "}",
    `const endpoint = ${JSON.stringify(endpoint)};`,
    `const maxRequestBytes = ${String(options.maxRequestBytes)};`,
    `const allowedOrigins = ${JSON.stringify(options.allowedOrigins)};`,
    `const exposeErrors = ${JSON.stringify(options.exposeErrors)};`,
    `const development = ${JSON.stringify(options.development)};`,
    "export const handleServerFunctionRequest = createServerFunctionHandler({",
    "  endpoint,",
    "  maxRequestBytes,",
    "  allowedOrigins,",
    "  exposeErrors,",
    "  development,",
    "  resolveWithCaptures: true,",
    "});",
    "",
  ].join("\n");
}
