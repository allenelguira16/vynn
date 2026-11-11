import { describe, expect, it } from "vitest";

import {
  toFileRouter,
  type BeforeLoadContext,
  type Route,
} from "../src";
import type { FileRouteModuleMap, FileRouteModuleMetadata } from "../src/file-router";
import { PATHLESS_ROUTE, type InternalRoute } from "../src/route-meta";
import { findMatch } from "../src/outlet";

type Context = {
  tenant: string;
};

const files: FileRouteModuleMetadata[] = [
  { path: "/src/app/layout.tsx", kind: "layout", beforeLoad: false },
  { path: "/src/app/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/about/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/users/[id]/page.tsx", kind: "page", beforeLoad: true },
  { path: "/src/app/files/[...rest]/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/optional/[[...rest]]/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/(marketing)/layout.tsx", kind: "layout", beforeLoad: false },
  { path: "/src/app/(marketing)/blog/[slug]/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/(dashboard)/layout.tsx", kind: "layout", beforeLoad: false },
  { path: "/src/app/(dashboard)/dashboard/page.tsx", kind: "page", beforeLoad: false },
  { path: "/src/app/(dashboard)/dashboard/settings/page.tsx", kind: "page", beforeLoad: false },
];

function createModules(): FileRouteModuleMap {
  return Object.fromEntries(
    files.map((file) => [
      file.path,
      async () => ({
        default: () => null,
        ...(file.beforeLoad
          ? {
              beforeLoad: ({ context, params }: BeforeLoadContext<Context>) => {
                return { tenant: context.tenant, userId: params.id };
              },
            }
          : {}),
      }),
    ]),
  );
}

describe("toFileRouter", () => {
  it("builds nested page and layout routes from App Router folders", () => {
    const routes = toFileRouter<Context>("/src/app", createModules(), files);
    const root = routes[0];
    const about = root.children?.find((route) => route.path === "about");
    const marketing = root.children?.find(
      (route) => (route as InternalRoute<Context>)[PATHLESS_ROUTE] === true,
    );
    const dashboardGroup = root.children?.filter(
      (route) => (route as InternalRoute<Context>)[PATHLESS_ROUTE] === true,
    )?.[1];
    const dashboard = dashboardGroup?.children?.find((route) => route.path === "dashboard");

    expect(root.path).toBe("/");
    expect(typeof root.component).toBe("function");
    expect(root.children?.some((route) => route.path === "/")).toBe(true);

    expect(about?.children?.map((route) => route.path)).toEqual(["/"]);
    expect(typeof about?.component).toBe("function");

    expect(marketing?.path).toBe("/");
    expect((marketing as InternalRoute<Context> | undefined)?.[PATHLESS_ROUTE]).toBe(true);
    expect(marketing?.children?.some((route) => route.path === "blog")).toBe(true);

    expect((dashboardGroup as InternalRoute<Context> | undefined)?.[PATHLESS_ROUTE]).toBe(true);
    expect(dashboard?.children?.map((route) => route.path).sort()).toEqual(["/", "settings"]);

    const filesRoute = root.children?.find((route) => route.path === "files");
    const requiredCatchAll = filesRoute?.children?.find((route) => route.path === "*");
    const optionalRoute = root.children?.find((route) => route.path === "optional");
    const optionalCatchAll = optionalRoute?.children?.find((route) => route.path === "*?");

    expect(requiredCatchAll).toBeDefined();
    expect(optionalCatchAll).toBeDefined();
  });

  it("selects a route group using the URL paths of its descendants", () => {
    const routes = toFileRouter<Context>("/src/app", createModules(), files);
    const root = routes[0];
    const groups =
      root.children?.filter(
        (route) => (route as InternalRoute<Context>)[PATHLESS_ROUTE] === true,
      ) ?? [];

    const marketingMatch = findMatch(
      groups,
      { pathname: "/blog/my-post", search: "" },
      "/",
    );
    const dashboardMatch = findMatch(
      groups,
      { pathname: "/dashboard/settings", search: "" },
      "/",
    );

    expect(marketingMatch?.route).toBe(groups[0]);
    expect(dashboardMatch?.route).toBe(groups[1]);
  });

  it("loads a page's named beforeLoad export", async () => {
    let loadCount = 0;
    const modules = createModules();
    modules["/src/app/users/[id]/page.tsx"] = async () => {
      loadCount++;
      return {
        default: () => null,
        beforeLoad: ({ context, params }: BeforeLoadContext<Context>) => ({
          tenant: context.tenant,
          userId: params.id,
        }),
      };
    };

    const routes = toFileRouter<Context>("/src/app", modules, files);
    const users = routes[0].children?.find((route) => route.path === "users");
    const userId = users?.children?.find((route) => route.path === ":id");
    const userPage = userId?.children?.find((route) => route.path === "/");

    expect(userPage?.beforeLoad).toBeTypeOf("function");

    const result = await userPage?.beforeLoad?.({
      context: { tenant: "north" },
      location: { pathname: "/users/42", search: "?tab=profile" },
      params: { id: "42" },
      search: new URLSearchParams("tab=profile"),
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ tenant: "north", userId: "42" });
    expect(loadCount).toBe(1);
  });

  it("attaches beforeLoad from a layout to its folder route", async () => {
    let receivedTenant: string | undefined;
    const layoutPath = "/src/app/dashboard/layout.tsx";
    const pagePath = "/src/app/dashboard/page.tsx";
    const layoutFiles: FileRouteModuleMetadata[] = [
      { path: layoutPath, kind: "layout", beforeLoad: true },
      { path: pagePath, kind: "page", beforeLoad: false },
    ];
    const modules: FileRouteModuleMap = {
      [layoutPath]: async () => ({
        default: () => null,
        beforeLoad: ({ context }: BeforeLoadContext<Context>) => {
          receivedTenant = context.tenant;
        },
      }),
      [pagePath]: async () => ({ default: () => null }),
    };

    const routes = toFileRouter<Context>("/src/app", modules, layoutFiles);
    const dashboard = routes[0].children?.find((route) => route.path === "dashboard");

    expect(dashboard?.beforeLoad).toBeTypeOf("function");

    await dashboard?.beforeLoad?.({
      context: { tenant: "north" },
      location: { pathname: "/dashboard", search: "" },
      params: {},
      search: new URLSearchParams(),
      signal: new AbortController().signal,
    });

    expect(receivedTenant).toBe("north");
  });

  it("does not expose a layout-only folder without a page", () => {
    const nestedFiles: FileRouteModuleMetadata[] = [
      { path: "/src/app/layout.tsx", kind: "layout", beforeLoad: false },
      { path: "/src/app/dashboard/layout.tsx", kind: "layout", beforeLoad: false },
      { path: "/src/app/dashboard/settings/page.tsx", kind: "page", beforeLoad: false },
    ];
    const modules: FileRouteModuleMap = Object.fromEntries(
      nestedFiles.map((file) => [file.path, async () => ({ default: () => null })]),
    );
    const routes = toFileRouter("/src/app", modules, nestedFiles);

    expect(findMatch(routes, { pathname: "/dashboard", search: "" })).toBeUndefined();
    expect(findMatch(routes, { pathname: "/dashboard/settings", search: "" })?.route).toBe(
      routes[0],
    );
  });

  it("rejects a catch-all folder followed by another URL segment", () => {
    const nestedFiles: FileRouteModuleMetadata[] = [
      {
        path: "/src/app/files/[...rest]/details/page.tsx",
        kind: "page",
        beforeLoad: false,
      },
    ];
    const modules: FileRouteModuleMap = {
      "/src/app/files/[...rest]/details/page.tsx": async () => ({ default: () => null }),
    };

    expect(() => toFileRouter("/src/app", modules, nestedFiles)).toThrow(
      "A catch-all folder must be the final URL segment",
    );
  });

  it("keeps the root page ahead of an optional catch-all inside a route group", () => {
    const component = () => null;
    const group: InternalRoute = {
      path: "/",
      [PATHLESS_ROUTE]: true,
      component,
      children: [{ path: "*?", component }],
    };
    const home: Route = {
      path: "/",
      component,
    };

    const match = findMatch([group, home], { pathname: "/", search: "" }, "/");

    expect(match?.route).toBe(home);
  });

  it("rejects duplicate page URLs hidden behind different route groups", () => {
    const modules: FileRouteModuleMap = {
      "/src/app/(marketing)/about/page.tsx": async () => ({ default: () => null }),
      "/src/app/(dashboard)/about/page.tsx": async () => ({ default: () => null }),
    };
    const duplicateFiles: FileRouteModuleMetadata[] = [
      { path: "/src/app/(marketing)/about/page.tsx", kind: "page", beforeLoad: false },
      { path: "/src/app/(dashboard)/about/page.tsx", kind: "page", beforeLoad: false },
    ];

    expect(() => toFileRouter("/src/app", modules, duplicateFiles)).toThrow(
      "Multiple page files resolve to the same URL path",
    );
  });

  it("requires the Vite transform to supply its module map", () => {
    expect(() => toFileRouter("/src/app")).toThrow(
      "must be transformed by the Vynn Vite plugin",
    );
  });
});
