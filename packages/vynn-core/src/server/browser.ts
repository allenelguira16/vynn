import type { JSX } from "../types/jsx";

function serverOnly(name: string): never {
  throw new Error(`[vynn]: ${name} is only available in a server environment.`);
}

/**
 * Browser condition for the server entry point.
 *
 * This keeps Node-only APIs out of client bundles while preserving actionable
 * errors if server APIs are accidentally called from browser code.
 */
export function renderToServer(
  _App: () => JSX.Element,
  _mode: "sync",
): string;
export function renderToServer(
  _App: () => JSX.Element,
  _mode: "async",
): Promise<string>;
export function renderToServer(
  _App: () => JSX.Element,
  _mode: "stream",
): ReadableStream<Uint8Array>;
export function renderToServer(
  _App: () => JSX.Element,
  _mode: "sync" | "async" | "stream",
): string | Promise<string> | ReadableStream<Uint8Array> {
  return serverOnly("renderToServer");
}

export function runWithSsrContext<T>(
  _callback: () => T,
): Promise<Awaited<T>> {
  return serverOnly("runWithSsrContext");
}

export function getServerFunctionContext(): ServerFunctionContext {
  return serverOnly("getServerFunctionContext");
}

export function getServerFunctionRequest(): Request {
  return serverOnly("getServerFunctionRequest");
}

export function runWithServerFunctionContext<T>(
  _context: ServerFunctionContext,
  _callback: () => T,
): T {
  return serverOnly("runWithServerFunctionContext");
}

export type ServerFunctionContext = {
  readonly request: Request;
  readonly functionId: string;
};

export function getSsrModuleIds(): ReadonlySet<string> {
  return serverOnly("getSsrModuleIds");
}

export function getSsrHead(): string {
  return serverOnly("getSsrHead");
}

export function subscribeSsrHead(
  _listener: (html: string) => void,
): () => void {
  return serverOnly("subscribeSsrHead");
}

export { injectSsrPreloadLinks } from "./preload.inject-links";
export {
  renderSsrPreloadLinks,
  type SsrClientManifest,
  type SsrPreloadLinkOptions,
} from "./preload.render-preload-links";
