export function makeClientRuntime(endpoint: string): string {
  return [
    'import { createServerReference as createVynnServerReference } from "vynn/server-functions/client";',
    "export function createServerReference(id) {",
    `  return createVynnServerReference(id, { endpoint: ${JSON.stringify(endpoint)} });`,
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
    manifestSentinel: string;
  },
): string {
  return [
    'import { createServerFunctionHandler, createServerReference as createVynnServerReference } from "vynn/server-functions/server";',
    "export function createServerReference(implementation, id) {",
    "  return createVynnServerReference(implementation, id);",
    "}",
    `const endpoint = ${JSON.stringify(endpoint)};`,
    `const maxRequestBytes = ${String(options.maxRequestBytes)};`,
    `const allowedOrigins = ${JSON.stringify(options.allowedOrigins)};`,
    `const exposeErrors = ${JSON.stringify(options.exposeErrors)};`,
    `const development = ${JSON.stringify(options.development)};`,
    `const deploymentManifestJson = "${options.manifestSentinel}";`,
    "let deploymentManifest = {};",
    "try { deploymentManifest = JSON.parse(deploymentManifestJson); } catch {}",
    "async function resolveImplementation(id) {",
    "  const path = deploymentManifest[id];",
    "  if (typeof path !== \"string\") return undefined;",
    "  const mod = await import(/* @vite-ignore */ new URL(path, import.meta.url).href);",
    "  if (typeof mod.default !== \"function\") throw new Error(\"Invalid Vynn server-function entry chunk.\");",
    "  return mod.default;",
    "}",
    "export const handleServerFunctionRequest = createServerFunctionHandler({",
    "  endpoint,",
    "  maxRequestBytes,",
    "  allowedOrigins,",
    "  exposeErrors,",
    "  development,",
    "  resolve: development ? undefined : resolveImplementation,",
    "});",
    "",
  ].join("\n");
}
