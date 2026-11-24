// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { lazy, type JSX } from "vynn";
import { renderToDOM } from "vynn/client";

import { navigate, Router, toFileRouter, type Route } from "../src";

afterEach(() => {
  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

describe("client router layout navigation", () => {
  it("keeps layout children mounted until a lazy descendant route is ready", async () => {
    let resolveDestination!: () => void;
    let destinationLoads = 0;

    const DestinationPage = lazy(async () => {
      destinationLoads++;

      await new Promise<void>((resolve) => {
        resolveDestination = resolve;
      });

      return {
        default: () => <p>other-page content</p>,
      };
    });

    const Outlet: Route["component"] = (props) => props.children ?? null;
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => <p>home content</p>,
          },
          {
            path: "other-page",
            component: Outlet,
            children: [
              {
                path: "/",
                component: DestinationPage,
              },
            ],
          },
        ],
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => Router({ url: "/", routes }) as unknown as JSX.Element, host);

    const layout = host.querySelector("main");
    expect(layout).not.toBeNull();
    expect(host.textContent).toContain("home content");

    navigate("/other-page");

    expect(destinationLoads).toBe(1);
    expect(host.querySelector("main")).toBe(layout);
    expect(host.textContent).toContain("home content");
    expect(host.textContent).not.toContain("other-page content");

    resolveDestination();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector("main")).toBe(layout);
    expect(host.textContent).toContain("other-page content");
    expect(host.textContent).not.toContain("home content");

    unmount();
  });

  it("does not commit a lazy destination after a newer navigation supersedes it", async () => {
    let resolveDestination!: () => void;

    const DestinationPage = lazy(async () => {
      await new Promise<void>((resolve) => {
        resolveDestination = resolve;
      });

      return {
        default: () => <p>stale destination content</p>,
      };
    });

    const Outlet: Route["component"] = (props) => props.children ?? null;
    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => <p>home content</p>,
          },
          {
            path: "other-page",
            component: Outlet,
            children: [
              {
                path: "/",
                component: DestinationPage,
              },
            ],
          },
        ],
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => Router({ url: "/", routes }) as unknown as JSX.Element, host);

    navigate("/other-page");
    navigate("/");

    expect(host.textContent).toContain("home content");

    resolveDestination();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/");
    expect(host.textContent).toContain("home content");
    expect(host.textContent).not.toContain("stale destination content");

    unmount();
  });

  it("keeps the current page visible while a flat lazy route is loading", async () => {
    let resolveDestination!: () => void;
    let destinationLoads = 0;

    const DestinationPage = lazy(async () => {
      destinationLoads++;
      await new Promise<void>((resolve) => {
        resolveDestination = resolve;
      });
      return { default: () => <p>flat destination content</p> };
    });

    const routes: Route[] = [
      { path: "/", component: () => <p>flat home content</p> },
      { path: "/other-page", component: DestinationPage },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => Router({ url: "/", routes }) as unknown as JSX.Element,
      host,
    );

    expect(host.textContent).toContain("flat home content");

    navigate("/other-page");

    expect(destinationLoads).toBe(1);
    expect(host.textContent).toContain("flat home content");
    expect(host.textContent).not.toContain("flat destination content");

    resolveDestination();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain("flat destination content");
    expect(host.textContent).not.toContain("flat home content");

    // Once the destination module is warm, navigating back to it is synchronous.
    navigate("/");
    expect(host.textContent).toContain("flat home content");

    navigate("/other-page");
    expect(destinationLoads).toBe(1);
    expect(host.textContent).toContain("flat destination content");
    expect(host.textContent).not.toContain("flat home content");

    unmount();
  });

  it("uses the same pending-navigation behavior for file-based lazy pages", async () => {
    let resolveDestination!: () => void;
    let destinationLoads = 0;

    const routes = toFileRouter("/src/app", {
      "/src/app/page.tsx": async () => ({
        default: () => <p>file home content</p>,
      }),
      "/src/app/other/page.tsx": async () => {
        destinationLoads++;
        await new Promise<void>((resolve) => {
          resolveDestination = resolve;
        });
        return { default: () => <p>file destination content</p> };
      },
    }, [
      { path: "/src/app/page.tsx", kind: "page", beforeLoad: false },
      { path: "/src/app/other/page.tsx", kind: "page", beforeLoad: false },
    ]);

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => Router({ url: "/", routes }) as unknown as JSX.Element,
      host,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(host.textContent).toContain("file home content");

    navigate("/other");

    expect(destinationLoads).toBe(1);
    expect(host.textContent).toContain("file home content");
    expect(host.textContent).not.toContain("file destination content");

    resolveDestination();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain("file destination content");
    expect(host.textContent).not.toContain("file home content");

    unmount();
  });
});
