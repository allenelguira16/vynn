// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { $computed, lazy, type JSX } from "vynn";
import { renderToDOM } from "vynn/client";

import { navigate, Router, type Route } from "../src";

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

  it("keeps the current page visible while a navigate() destination has pending async content", async () => {
    let resolveDestination!: () => void;

    function DestinationPage() {
      const content = $computed(async () => {
        await new Promise<void>((resolve) => {
          resolveDestination = resolve;
        });

        return "other-page content";
      });

      return <p>{content.value}</p>;
    }

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

    const unmount = renderToDOM(
      () => Router({ url: "/", routes }) as unknown as JSX.Element,
      host,
    );

    const layout = host.querySelector("main");
    expect(layout).not.toBeNull();
    expect(host.textContent).toContain("home content");

    // This is a normal client navigation. No beforeLoad or redirect is involved.
    navigate("/other-page");

    expect(typeof resolveDestination).toBe("function");
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
});
