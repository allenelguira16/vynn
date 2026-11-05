import { describe, expect, it } from "vitest";

import { lazy } from "../src/components/lazy";
import { enterAsyncBoundary } from "../src/context/async-context";
import type { JSX } from "../src/types/jsx";
import { renderToServer } from "../src/server/render-to-server";
import { Router } from "../../vynn-router/src/router";
import { redirect } from "../../vynn-router/src/redirect";
import type { Route } from "../../vynn-router/src/types";

function renderRouter(url: string, routes: Route[], mode: "async"): Promise<{
  body: string;
  head: { render(): string };
  modules: ReadonlySet<string>;
}>;
function renderRouter(url: string, routes: Route[], mode: "stream"): {
  body: ReadableStream<Uint8Array>;
  head: { render(): string };
  modules: ReadonlySet<string>;
};
function renderRouter(url: string, routes: Route[], mode: "async" | "stream") {
  const App = () => Router({ url, routes }) as unknown as JSX.Element;

  return mode === "async"
    ? renderToServer(App, "async")
    : renderToServer(App, "stream");
}

describe("router beforeLoad and redirect", () => {
  it("waits for an async beforeLoad and provides route params and search", async () => {
    let finishGuard!: () => void;
    let componentRendered = false;

    const routes: Route[] = [
      {
        path: "/users/:id",
        beforeLoad: ({ location, params, search }) => {
          expect(location).toEqual({
            pathname: "/users/42",
            search: "?tab=activity",
          });
          expect(params.id).toBe("42");
          expect(search.get("tab")).toBe("activity");

          return new Promise<void>((resolve) => {
            finishGuard = resolve;
          });
        },
        component: (() => {
          componentRendered = true;
          return "Protected content";
        }) as unknown as Route["component"],
      },
    ];

    const pending = renderRouter("/users/42?tab=activity", routes, "async");

    expect(componentRendered).toBe(false);

    finishGuard();

    const rendered = await pending;

    expect(componentRendered).toBe(true);
    expect(rendered.body).toContain("Protected content");
  });

  it("handles a synchronous redirect before invoking the route component", async () => {
    let componentRendered = false;
    const routes: Route[] = [
      {
        path: "/redirect",
        component: (() => {
          componentRendered = true;
          return "This page must never render";
        }) as unknown as Route["component"],
        beforeLoad: () => {
          redirect("/params/1?id=1");
        },
      },
    ];

    let response: unknown;
    try {
      await renderRouter("/redirect", routes, "async");
    } catch (error) {
      response = error;
    }

    expect(componentRendered).toBe(false);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/params/1?id=1");
  });

  it("redirects during an async guard without invoking a lazy route component", async () => {
    let lazyLoadCount = 0;

    const LazyRedirectPage = lazy(
      () => {
        lazyLoadCount++;
        return Promise.resolve({
          RedirectPage: () => "This page must never render",
        });
      },
      "RedirectPage",
    );

    const routes: Route[] = [
      {
        path: "/redirect",
        component: LazyRedirectPage as unknown as Route["component"],
        beforeLoad: async () => {
          await Promise.resolve();
          redirect("/params/1?id=1", { status: 307 });
        },
      },
    ];

    let response: unknown;

    try {
      await renderRouter("/redirect", routes, "async");
    } catch (error) {
      response = error;
    }

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get("Location")).toBe("/params/1?id=1");
    expect(lazyLoadCount).toBe(0);
  });

  it("surfaces async redirects before the first streaming SSR chunk", async () => {
    const routes: Route[] = [
      {
        path: "/redirect",
        component: (() => "This page must never render") as unknown as Route["component"],
        beforeLoad: async () => {
          await Promise.resolve();
          redirect("/params/1?id=1");
        },
      },
    ];

    let registeredWithAwait = false;
    const rendered = renderToServer(() => {
      // Simulate an ambient Await boundary around the Router. Guards must not
      // register their pending promise with it, or its fallback could stream
      // before the redirect is known.
      enterAsyncBoundary(() => {
        registeredWithAwait = true;
      });

      return Router({ url: "/redirect", routes }) as unknown as JSX.Element;
    }, "stream");
    const reader = rendered.body.getReader();

    expect(registeredWithAwait).toBe(false);
    await expect(reader.read()).rejects.toBeInstanceOf(Response);
  });
});
