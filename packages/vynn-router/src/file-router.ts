import { lazy } from "vynn";

import {
  createFileRouter,
  type FileRouteModuleMap,
  type FileRouteModuleMetadata,
} from "./file-router-core";
import type { Route } from "./types";

export {
  createFileRouter,
  type FileRouteComponentFactory,
  type FileRouteModuleMap,
  type FileRouteModuleMetadata,
  type LoadedFileRouteModule,
} from "./file-router-core";

/**
 * Builds the normal legacy-router file tree using Vynn's legacy lazy runtime.
 * The render_new entry point supplies a separate native lazy component
 * factory through the shared file-router core.
 */
export function toFileRouter<TContext = undefined>(
  directory: string,
  ...generated: [] | [FileRouteModuleMap, FileRouteModuleMetadata[]]
): Route<TContext>[] {
  const [modules, files] = generated;

  if (!modules || !files) {
    throw new Error(
      "[vynn-router] toFileRouter() must be transformed by the Vynn Vite plugin. " +
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
