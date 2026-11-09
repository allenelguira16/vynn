import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { renderToServer } from "../src/server/render-to-server";
import { isActiveRoute } from "../../vynn-router/src/link";
import { $params } from "../../vynn-router/src/params";
import { Router } from "../../vynn-router/src/router";
import type { Route } from "../../vynn-router/src/types";

async function renderRouter(url: string, routes: Route[]): Promise<string> {
  const rendered = await renderToServer(
    () => Router({ url, routes }) as unknown as JSX.Element,
    "async",
  );

  return rendered.body;
}

describe("router catch-all routes", () => {
  it(
    "matches unmatched paths after trying explicit routes, regardless of declaration order",
    async () => {
      const routes: Route[] = [
        {
          path: "*",
          component: () => "Not found",
        },
        {
          path: "/docs/*",
          component: () => "Documentation not found",
        },
        {
          path: "/users/:id",
          component: () => "User page",
        },
      ];

      const userPage = await renderRouter("/users/42", routes);
      const documentationFallback = await renderRouter("/docs/missing/page", routes);
      const notFoundPage = await renderRouter("/missing/nested/path", routes);

      expect(userPage).toContain("User page");
      expect(userPage).not.toContain("Not found");
      expect(documentationFallback).toContain("Documentation not found");
      expect(documentationFallback).not.toContain("Not found");
      expect(notFoundPage).toContain("Not found");
    },
  );

  it("captures the remaining path in the catch-all parameter", async () => {
    const capturedPaths: string[] = [];
    const routes: Route[] = [
      {
        path: "/docs/*",
        beforeLoad: async ({ params }) => {
          capturedPaths.push(params["*"] ?? "undefined");
        },
        component: () => `Documentation fallback: ${$params["*"]}`,
      },
    ];

    const nestedPage = await renderRouter("/docs/guides/routing/catch-all", routes);
    const emptyRemainder = await renderRouter("/docs", routes);

    expect(nestedPage).toContain("Documentation fallback: guides/routing/catch-all");
    expect(emptyRemainder).toContain("Documentation fallback: ");
    expect(capturedPaths).toEqual(["guides/routing/catch-all", ""]);
  });

  it("supports catch-all child routes inside a parent route", async () => {
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => props.children,
        children: [
          {
            path: "*",
            component: () => "Nested not found",
          },
          {
            path: "/users/:id",
            component: () => "Nested user page",
          },
        ],
      },
    ];

    const nestedUserPage = await renderRouter("/users/42", routes);
    const nestedNotFoundPage = await renderRouter("/unknown/nested/path", routes);

    expect(nestedUserPage).toContain("Nested user page");
    expect(nestedUserPage).not.toContain("Nested not found");
    expect(nestedNotFoundPage).toContain("Nested not found");
  });

  it("supports catch-all patterns when checking active routes", () => {
    expect(
      isActiveRoute("/docs/*", {
        pathname: "/docs/guides/routing",
        search: "",
      }),
    ).toBe(true);

    expect(
      isActiveRoute("/docs/*", {
        pathname: "/blog/guides/routing",
        search: "",
      }),
    ).toBe(false);
  });
});
