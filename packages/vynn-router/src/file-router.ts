import { lazy } from "vynn";

import type { Route } from "./types";

import { PATHLESS_ROUTE, REQUIRE_CHILD_MATCH, type InternalRoute } from "./route-meta";

export type FileRouteModuleMetadata = {
  /** Vite's normalized module key, such as /src/app/blog/page.tsx. */
  path: string;
  /** The App Router special file represented by this module. */
  kind: "page" | "layout";
  /** Whether this page or layout module has a named beforeLoad export. */
  beforeLoad: boolean;
};

export type FileRouteModuleMap = Record<string, () => Promise<unknown>>;

type LoadedFileRouteModule<TContext> = Record<string, unknown> & {
  default: Route<TContext>["component"];
  beforeLoad?: Route<TContext>["beforeLoad"];
};

type RouteDirectory<TContext> = {
  name: string;
  page?: FileRouteModuleMetadata;
  layout?: FileRouteModuleMetadata;
  children: Map<string, RouteDirectory<TContext>>;
};

const FileRouteOutlet: Route["component"] = (props) => props.children ?? null;

function normalizeDirectory(directory: string): string {
  const normalized = directory.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return "/";
  return normalized.startsWith("/") ? normalized : "/" + normalized;
}

function getDirectorySegments(directory: string, filePath: string): string[] {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const prefix = directory === "/" ? "/" : directory + "/";

  if (!normalizedPath.startsWith(prefix)) {
    throw new Error(
      "[vynn-router] File route module " +
        JSON.stringify(filePath) +
        " is outside the configured app directory " +
        JSON.stringify(directory) +
        ".",
    );
  }

  const relativePath = normalizedPath.slice(prefix.length);
  const segments = relativePath.split("/");
  const fileName = segments.pop() ?? "";
  const specialFile = fileName.replace(/\.(?:[cm]?[jt]sx?)$/i, "");

  if (specialFile !== "page" && specialFile !== "layout") {
    throw new Error(
      "[vynn-router] Expected a page or layout module, received " + JSON.stringify(filePath) + ".",
    );
  }

  return segments;
}

function toRouteSegment(segment: string): string {
  if (/^\([^/]+\)$/.test(segment)) return "";

  const optionalCatchAll = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(segment);
  if (optionalCatchAll) return "*?";

  const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(segment);
  if (catchAll) return "*";

  const dynamic = /^\[([^\]]+)\]$/.exec(segment);
  if (dynamic) return ":" + dynamic[1];

  return segment;
}

function createDirectory<TContext>(): RouteDirectory<TContext> {
  return {
    name: "",
    children: new Map(),
  };
}

function addFileToTree<TContext>(
  root: RouteDirectory<TContext>,
  file: FileRouteModuleMetadata,
  directory: string,
): void {
  const segments = getDirectorySegments(directory, file.path);
  let current = root;

  for (const segment of segments) {
    if (segment.startsWith("_")) {
      throw new Error(
        "[vynn-router] Private folders are excluded from routing: " + JSON.stringify(segment),
      );
    }

    let child = current.children.get(segment);
    if (!child) {
      child = {
        name: segment,
        children: new Map(),
      };
      current.children.set(segment, child);
    }

    current = child;
  }

  const key = file.kind;
  if (current[key]) {
    throw new Error(
      "[vynn-router] Multiple " +
        key +
        ".tsx modules resolve to the same route folder: " +
        JSON.stringify(file.path) +
        ".",
    );
  }

  current[key] = file;
}

function validatePagePaths<TContext>(root: RouteDirectory<TContext>): void {
  const seen = new Set<string>();

  const visit = (node: RouteDirectory<TContext>, parentPath: string[]) => {
    const segment = node.name ? toRouteSegment(node.name) : "";
    const currentPath = segment ? [...parentPath, segment] : parentPath;
    const catchAllIndex = currentPath.findIndex((part) => part === "*" || part === "*?");

    if (catchAllIndex !== -1 && catchAllIndex !== currentPath.length - 1) {
      throw new Error(
        "[vynn-router] A catch-all folder must be the final URL segment: " +
          JSON.stringify(currentPath.join("/")) +
          ".",
      );
    }

    if (node.page) {
      const routePath = currentPath.length ? "/" + currentPath.join("/") : "/";
      const normalizedRoutePath = routePath
        .split("/")
        .map((segment) =>
          segment === "*" || segment === "*?" ? "*" : segment.startsWith(":") ? ":" : segment,
        )
        .join("/");

      if (seen.has(normalizedRoutePath)) {
        throw new Error(
          "[vynn-router] Multiple page files resolve to the same URL path " +
            JSON.stringify(routePath) +
            ". Route groups do not add URL segments.",
        );
      }
      seen.add(normalizedRoutePath);
    }

    for (const child of node.children.values()) {
      visit(child, currentPath);
    }
  };

  visit(root, []);
}

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

  const normalizedDirectory = normalizeDirectory(directory);
  const root = createDirectory<TContext>();

  for (const file of files) {
    addFileToTree(root, file, normalizedDirectory);
  }

  validatePagePaths(root);

  const modulePromises = new Map<string, Promise<LoadedFileRouteModule<TContext>>>();

  const loadModule = (file: FileRouteModuleMetadata) => {
    const existing = modulePromises.get(file.path);
    if (existing) return existing;

    const moduleLoader = modules[file.path];
    if (!moduleLoader) {
      throw new Error(
        "[vynn-router] The Vite module glob is missing " +
          JSON.stringify(file.path) +
          ". Check the app directory passed to toFileRouter().",
      );
    }

    const promise = moduleLoader()
      .then((loaded) => {
        if (!loaded || typeof loaded !== "object") {
          throw new Error(
            "[vynn-router] Route module " + JSON.stringify(file.path) + " did not load an object.",
          );
        }

        return loaded as LoadedFileRouteModule<TContext>;
      })
      .catch((error: unknown) => {
        modulePromises.delete(file.path);
        throw error;
      });

    modulePromises.set(file.path, promise);
    return promise;
  };

  const createLazyComponent = (file: FileRouteModuleMetadata): Route<TContext>["component"] =>
    // The third argument is the root-relative key used by Vite's SSR manifest.
    // The preload transform cannot infer an import hidden behind the glob map.
    lazy(() => loadModule(file), undefined, file.path.replace(/^\/+/, ""));

  const createRouteGuard = (file: FileRouteModuleMetadata): Route<TContext>["beforeLoad"] => {
    if (!file.beforeLoad) return undefined;

    return async (context) => {
      const routeModule = await loadModule(file);

      if (typeof routeModule.beforeLoad !== "function") {
        throw new Error(
          "[vynn-router] Route module " +
            JSON.stringify(file.path) +
            " was detected with a beforeLoad export, but it is not a function.",
        );
      }

      return routeModule.beforeLoad(context);
    };
  };

  const createPageRoute = (file: FileRouteModuleMetadata, path: string): Route<TContext> => ({
    path,
    component: createLazyComponent(file),
    beforeLoad: createRouteGuard(file),
  });

  const buildDirectoryRoutes = (node: RouteDirectory<TContext>): Route<TContext>[] => {
    const children: Route<TContext>[] = [];

    if (node.page) {
      children.push(createPageRoute(node.page, "/"));
    }

    for (const child of node.children.values()) {
      children.push(...buildDirectoryRoutes(child));
    }

    if (/^\([^/]+\)$/.test(node.name)) {
      if (node.layout) {
        const route: InternalRoute<TContext> = {
          path: "/",
          [PATHLESS_ROUTE]: true,
          component: createLazyComponent(node.layout),
          beforeLoad: createRouteGuard(node.layout),
          children,
        };

        return [route];
      }

      return children;
    }

    const path = toRouteSegment(node.name);

    if (!children.length) return [];

    const route: InternalRoute<TContext> = {
      path,
      [REQUIRE_CHILD_MATCH]: !node.page ? true : undefined,
      component: node.layout ? createLazyComponent(node.layout) : FileRouteOutlet,
      beforeLoad: node.layout ? createRouteGuard(node.layout) : undefined,
      children,
    };

    return [route];
  };

  const rootChildren: Route<TContext>[] = [];

  if (root.page) {
    rootChildren.push(createPageRoute(root.page, "/"));
  }

  for (const child of root.children.values()) {
    rootChildren.push(...buildDirectoryRoutes(child));
  }

  const rootRoute: InternalRoute<TContext> = {
    path: "/",
    [REQUIRE_CHILD_MATCH]: !root.page ? true : undefined,
    component: root.layout ? createLazyComponent(root.layout) : FileRouteOutlet,
    beforeLoad: root.layout ? createRouteGuard(root.layout) : undefined,
    children: rootChildren,
  };

  return [rootRoute];
}
