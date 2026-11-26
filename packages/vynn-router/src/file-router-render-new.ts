import { lazy } from "./render-new-lazy";
import {
  createFileRouter,
  type FileRouteModuleMap,
  type FileRouteModuleMetadata,
} from "./file-router-core";
import type { Route } from "./types";

/**
 * Builds file routes whose page and layout modules use the render_new lazy
 * component runtime instead of the legacy VNode-based lazy() implementation.
 *
 * The one-argument form is populated by the Vite file-router transform.
 */
export function toFileRouter<TContext = undefined>(
  directory: string,
  ...generated: [] | [FileRouteModuleMap, FileRouteModuleMetadata[]]
): Route<TContext>[] {
  const [modules, files] = generated;

  if (!modules || !files) {
    throw new Error(
      "[vynn-router/render_new] toFileRouter() must be transformed by the Vynn Vite plugin. " +
        "Make sure vite-plugin-vynn is registered in vite.config.ts.",
    );
  }

  return createFileRouter(
    directory,
    modules,
    files,
    (loadModule, file) =>
      lazy(() => loadModule(), undefined, file.path.replace(/^\/+/, "")),
  );
}
