import type { JSX } from "vynn";

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToServer } from "vynn/server";

import { $params, isActiveRoute, Router, type Route } from "../src";

async function renderRouter(
  url: string,
  routes: Route[],
  notFound?: Route["component"],
): Promise<string> {
  const rendered = await renderToServer(
    () => Router({ url, routes, notFound }) as unknown as JSX.Element,
    "async",
  );

  return rendered.body;
}

describe("router catch-all routes", () => {
  it("matches unmatched paths after trying explicit routes, regardless of declaration order", async () => {
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
  });

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


describe("router not-found fallback", () => {
  it("renders the configured notFound component only when no route matches", async () => {
    const notFound = () => "Not found";
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => props.children,
        children: [
          {
            path: "about",
            component: () => "About page",
          },
        ],
      },
    ];

    const missingPage = await renderRouter("/missing/nested", routes, notFound);
    const existingPage = await renderRouter("/about", routes, notFound);

    expect(missingPage).toContain("Not found");
    expect(existingPage).toContain("About page");
    expect(existingPage).not.toContain("Not found");
  });

  it("supports notFound when the route list is empty", async () => {
    const rendered = await renderRouter("/anything", [], () => "Not found");

    expect(rendered).toContain("Not found");
  });
});
