import { lazy } from "vynn";

import type { Route } from "./types";

import {
  ABSOLUTE_ROUTE_PATH,
  INTERCEPTED_ROUTE,
  PATHLESS_ROUTE,
  REQUIRE_CHILD_MATCH,
  type InternalRoute,
} from "./route-meta";

export type FileRouteModuleMetadata = {
  /** Vite's normalized module key, such as /src/app/blog/page.tsx. */
  path: string;
  /** The App Router special file represented by this module. */
  kind: "page" | "layout" | "not-found" | "default";
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
  defaultPage?: FileRouteModuleMetadata;
  children: Map<string, RouteDirectory<TContext>>;
  slots: Map<string, RouteDirectory<TContext>>;
  absolutePath?: string;
  slotRoot?: boolean;
  intercepted?: boolean;
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

  if (
    specialFile !== "page" &&
    specialFile !== "layout" &&
    specialFile !== "not-found" &&
    specialFile !== "default"
  ) {
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
  slotRoots: Map<string, RouteDirectory<TContext>>,
  slotOwners: Map<string, RouteDirectory<TContext>>,
): void {
  const segments = getDirectorySegments(directory, file.path);
  let current = root;
  let branchRoot = root;
  let activeSlotKey: string | undefined;
  let activeSlotName: string | undefined;
  let slotTrailStart = 0;
  const effectivePath: string[] = [];
  const routeTrail: Array<{ node: RouteDirectory<TContext>; path: string[] }> = [
    { node: root, path: [] },
  ];

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;

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

      const slotKey = segments.slice(0, index + 1).join("/");
      let slot = slotRoots.get(slotKey);
      if (!slot) {
        slot = createDirectory<TContext>(true);
        slotRoots.set(slotKey, slot);
        slotOwners.set(slotKey, current);
        current.slots.set(slotName, slot);
      }

      current = slot;
      branchRoot = slot;
      activeSlotKey = slotKey;
      activeSlotName = slotName;
      slotTrailStart = routeTrail.length;
      routeTrail.push({ node: slot, path: [...effectivePath] });
      continue;
    }

    const intercepted = /^\((\.\.\.|\.\.|\.)\)(.+)$/.exec(segment);
    let directoryName = segment;
    let absolutePath: string | undefined;

    if (intercepted) {
      if (!activeSlotKey || !activeSlotName) {
        throw new Error(
          "[vynn-router] Intercepting route folders must be declared inside a parallel route slot: " +
            JSON.stringify(segment) +
            ".",
        );
      }

      const marker = intercepted[1]!;
      directoryName = intercepted[2]!;
      const targetBase = [...effectivePath];

      if (marker === "..") {
        if (targetBase.length === 0) {
          throw new Error(
            "[vynn-router] Intercepting route " +
              JSON.stringify(segment) +
              " cannot move above the application root.",
          );
        }
        targetBase.pop();
      } else if (marker === "...") {
        targetBase.length = 0;
      }

      // Move the slot to the nearest route ancestor that owns the target
      // parent path. This makes intercepted branches visible even when the
      // original directory is not part of the destination's main route branch.
      const targetOwner = routeTrail
        .slice(0, slotTrailStart)
        .slice()
        .reverse()
        .find(
          (entry) =>
            entry.path.length === targetBase.length &&
            entry.path.every((part, pathIndex) => part === targetBase[pathIndex]),
        )?.node;

      if (!targetOwner) {
        throw new Error(
          "[vynn-router] Intercepting route " +
            JSON.stringify(segment) +
            " could not resolve its target layout.",
        );
      }

      const currentOwner = slotOwners.get(activeSlotKey);
      const existingSlot = targetOwner.slots.get(activeSlotName);
      if (existingSlot && existingSlot !== branchRoot) {
        throw new Error(
          "[vynn-router] Multiple parallel route folders named " +
            JSON.stringify("@" + activeSlotName) +
            " resolve to the same target layout.",
        );
      }

      if (currentOwner !== targetOwner) {
        currentOwner?.slots.delete(activeSlotName);
        targetOwner.slots.set(activeSlotName, branchRoot);
        slotOwners.set(activeSlotKey, targetOwner);
      }

      effectivePath.splice(0, effectivePath.length, ...targetBase);
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
      child.intercepted = true;
    }

    current = child;
    routeTrail.push({ node: child, path: [...effectivePath] });
  }

  const key =
    file.kind === "not-found"
      ? "notFound"
      : file.kind === "default"
        ? "defaultPage"
        : file.kind;

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

  const slotRoots = new Map<string, RouteDirectory<TContext>>();
  const slotOwners = new Map<string, RouteDirectory<TContext>>();

  for (const file of files) {
    addFileToTree(root, file, normalizedDirectory, slotRoots, slotOwners);
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

    if (node.notFound && node.defaultPage) {
      throw new Error(
        "[vynn-router] A directory cannot declare both not-found.tsx and default.tsx: " +
          JSON.stringify(node.name) +
          ".",
      );
    }

    if (node.notFound) {
      children.push(createPageRoute(node.notFound, "*?"));
    } else if (node.defaultPage) {
      children.push(createPageRoute(node.defaultPage, "*?"));
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
      ...(node.intercepted ? { [INTERCEPTED_ROUTE]: true } : {}),
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

  if (root.notFound && root.defaultPage) {
    throw new Error("[vynn-router] The root cannot declare both not-found.tsx and default.tsx.");
  }

  if (root.notFound) {
    rootChildren.push(createPageRoute(root.notFound, "*?"));
  } else if (root.defaultPage) {
    rootChildren.push(createPageRoute(root.defaultPage, "*?"));
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
