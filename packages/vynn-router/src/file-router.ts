import { lazy } from "vynn";

import type { Route } from "./types";

import {
  ABSOLUTE_ROUTE_PATH,
  PATHLESS_ROUTE,
  REQUIRE_CHILD_MATCH,
  type InternalRoute,
} from "./route-meta";

export type FileRouteModuleMetadata = {
  /** Vite's normalized module key, such as /src/app/blog/page.tsx. */
  path: string;
  /** The App Router special file represented by this module. */
  kind: "page" | "layout" | "not-found";
  /** Whether this route module has a named beforeLoad export. */
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
  notFound?: FileRouteModuleMetadata;
  children: Map<string, RouteDirectory<TContext>>;
  slots: Map<string, RouteDirectory<TContext>>;
  absolutePath?: string;
  slotRoot?: boolean;
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

  if (specialFile !== "page" && specialFile !== "layout" && specialFile !== "not-found") {
    throw new Error(
      "[vynn-router] Expected a page, layout, or not-found module, received " +
        JSON.stringify(filePath) +
        ".",
    );
  }

  return segments;
}

function toRouteSegment(segment: string): string {
  if (/^\([^/]+\)$/.test(segment)) return "";

  const intercepted = /^\(\.{1,3}\)(.+)$/.exec(segment);
  if (intercepted) segment = intercepted[1];

  const optionalCatchAll = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(segment);
  if (optionalCatchAll) return "*?";

  const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(segment);
  if (catchAll) return "*";

  const dynamic = /^\[([^\]]+)\]$/.exec(segment);
  if (dynamic) return ":" + dynamic[1];

  return segment;
}

function createDirectory<TContext>(slotRoot = false): RouteDirectory<TContext> {
  return {
    name: "",
    children: new Map(),
    slots: new Map(),
    slotRoot,
  };
}

function addFileToTree<TContext>(
  root: RouteDirectory<TContext>,
  file: FileRouteModuleMetadata,
  directory: string,
): void {
  const segments = getDirectorySegments(directory, file.path);
  let current = root;
  let branchRoot = root;
  let insideSlot = false;
  const effectivePath: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("_")) {
      throw new Error(
        "[vynn-router] Private folders are excluded from routing: " + JSON.stringify(segment),
      );
    }

    if (segment.startsWith("@")) {
      const slotName = segment.slice(1);
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(slotName)) {
        throw new Error(
          "[vynn-router] Invalid parallel route slot folder: " + JSON.stringify(segment) + ".",
        );
      }

      let slot = current.slots.get(slotName);
      if (!slot) {
        slot = createDirectory<TContext>(true);
        current.slots.set(slotName, slot);
      }
      current = slot;
      branchRoot = slot;
      insideSlot = true;
      continue;
    }

    const intercepted = /^\((\.\.\.|\.\.|\.)\)(.+)$/.exec(segment);
    let directoryName = segment;
    let absolutePath: string | undefined;

    if (intercepted) {
      if (!insideSlot) {
        throw new Error(
          "[vynn-router] Intercepting route folders must be declared inside a parallel route slot: " +
            JSON.stringify(segment) +
            ".",
        );
      }

      const marker = intercepted[1];
      directoryName = intercepted[2];

      if (marker === "..") {
        if (effectivePath.length === 0) {
          throw new Error(
            "[vynn-router] Intercepting route " +
              JSON.stringify(segment) +
              " cannot move above the application root.",
          );
        }
        effectivePath.pop();
      } else if (marker === "...") {
        effectivePath.length = 0;
      }

      const routeSegment = toRouteSegment(directoryName);
      if (routeSegment) effectivePath.push(routeSegment);
      absolutePath = "/" + effectivePath.join("/");
      current = branchRoot;
    } else {
      const routeSegment = toRouteSegment(directoryName);
      if (routeSegment) effectivePath.push(routeSegment);
    }

    let child = current.children.get(directoryName);
    if (!child) {
      child = {
        name: directoryName,
        children: new Map(),
        slots: new Map(),
      };
      current.children.set(directoryName, child);
    }

    if (absolutePath) {
      if (child.absolutePath && child.absolutePath !== absolutePath) {
        throw new Error(
          "[vynn-router] Intercepting route folder " +
            JSON.stringify(segment) +
            " resolves to multiple URL paths.",
        );
      }
      child.absolutePath = absolutePath;
    }

    current = child;
  }

  const key = file.kind === "not-found" ? "notFound" : file.kind;
  if (current[key]) {
    throw new Error(
      "[vynn-router] Multiple " +
        file.kind +
        ".tsx modules resolve to the same route folder: " +
        JSON.stringify(file.path) +
        ".",
    );
  }

  current[key] = file;
}

function validatePagePaths<TContext>(root: RouteDirectory<TContext>): void {
  const visit = (
    node: RouteDirectory<TContext>,
    parentPath: string[],
    seen: Set<string>,
  ) => {
    const segment = node.name ? toRouteSegment(node.name) : "";
    const currentPath = node.absolutePath
      ? node.absolutePath.split("/").filter(Boolean)
      : segment
        ? [...parentPath, segment]
        : parentPath;
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
        .map((part) =>
          part === "*" || part === "*?" ? "*" : part.startsWith(":") ? ":" : part,
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
      visit(child, currentPath, seen);
    }

    // Each parallel slot has an independent route namespace. Two slots may
    // intentionally contain routes for the same pathname.
    for (const slot of node.slots.values()) {
      visit(slot, currentPath, new Set());
    }
  };

  visit(root, [], new Set());
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

    if (node.notFound) {
      children.push(createPageRoute(node.notFound, "*?"));
    }

    const slots = Object.fromEntries(
      [...node.slots.entries()].map(([name, slot]) => {
        const routes = buildDirectoryRoutes(slot);
        if (routes.length === 0) {
          throw new Error(
            "[vynn-router] Parallel route slot " + JSON.stringify(name) +
              " does not contain a page or layout route.",
          );
        }
        return [name, routes];
      }),
    );

    if (/^\([^/]+\)$/.test(node.name) || node.slotRoot) {
      if (node.layout || node.slotRoot || Object.keys(slots).length > 0) {
        const route: InternalRoute<TContext> = {
          path: "/",
          [PATHLESS_ROUTE]: true,
          component: node.layout ? createLazyComponent(node.layout) : FileRouteOutlet,
          beforeLoad: node.layout ? createRouteGuard(node.layout) : undefined,
          children,
          slots,
        };

        return [route];
      }

      return children;
    }

    const path = toRouteSegment(node.name);

    if (!children.length && Object.keys(slots).length === 0) return [];

    const route: InternalRoute<TContext> = {
      path,
      [REQUIRE_CHILD_MATCH]: !node.page && children.length > 0 ? true : undefined,
      ...(node.absolutePath ? { [ABSOLUTE_ROUTE_PATH]: node.absolutePath } : {}),
      component: node.layout ? createLazyComponent(node.layout) : FileRouteOutlet,
      beforeLoad: node.layout ? createRouteGuard(node.layout) : undefined,
      children,
      slots,
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

  if (root.notFound) {
    rootChildren.push(createPageRoute(root.notFound, "*?"));
  }

  const rootRoute: InternalRoute<TContext> = {
    path: "/",
    [REQUIRE_CHILD_MATCH]: !root.page ? true : undefined,
    component: root.layout ? createLazyComponent(root.layout) : FileRouteOutlet,
    beforeLoad: root.layout ? createRouteGuard(root.layout) : undefined,
    children: rootChildren,
    slots: Object.fromEntries(
      [...root.slots.entries()].map(([name, slot]) => {
        const routes = buildDirectoryRoutes(slot);
        if (routes.length === 0) {
          throw new Error(
            "[vynn-router] Parallel route slot " + JSON.stringify(name) +
              " does not contain a page or layout route.",
          );
        }
        return [name, routes];
      }),
    ),
  };

  return [rootRoute];
}
