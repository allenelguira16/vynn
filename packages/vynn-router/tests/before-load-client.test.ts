// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { $state, type JSX } from "vynn";
import { renderToDOM } from "vynn/client";
import { $insert, $template } from "vynn/render";

import { navigate, redirect, Router, type Route } from "../src";

let requestAnimationFrameDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (requestAnimationFrameDescriptor) {
    Object.defineProperty(window, "requestAnimationFrame", requestAnimationFrameDescriptor);
    requestAnimationFrameDescriptor = undefined;
  } else {
    Reflect.deleteProperty(window, "requestAnimationFrame");
  }

  document.body.innerHTML = "";
  history.replaceState(null, "", "/");
});

function textNode(tag: string, value: string): JSX.Element {
  const element = $template(`<${tag}></${tag}>`)();
  $insert(element, value);
  return element as unknown as JSX.Element;
}

describe("client router beforeLoad", () => {
  it("does not mount the route component until its async guard resolves", async () => {
    let finishGuard!: () => void;
    let componentRendered = false;

    const routes: Route[] = [
      {
        path: "/protected",
        beforeLoad: async () => {
          await new Promise<void>((resolve) => {
            finishGuard = resolve;
          });
        },
        component: (() => {
          componentRendered = true;
          return textNode("p", "protected route content");
        }) as unknown as Route["component"],
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/protected",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    expect(componentRendered).toBe(false);
    expect(host.textContent).not.toContain("protected route content");

    await Promise.resolve();
    finishGuard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(componentRendered).toBe(true);
    expect(host.textContent).toContain("protected route content");

    unmount();
  });

  it("keeps the current route visible while a destination beforeLoad is pending", async () => {
    let finishGuard!: () => void;
    const signals: AbortSignal[] = [];

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => textNode("p", "home content"),
          },
          {
            path: "poke-dex",
            beforeLoad: ({ signal }) => {
              signals.push(signal);

              return new Promise<void>((resolve) => {
                finishGuard = resolve;
              });
            },
            component: () => textNode("p", "poke dex content"),
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

    navigate("/poke-dex");
    await Promise.resolve();

    expect(signals).toHaveLength(1);
    expect(host.querySelector("main")).toBe(layout);
    expect(host.textContent).toContain("home content");
    expect(host.textContent).not.toContain("poke dex content");

    finishGuard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector("main")).toBe(layout);
    expect(host.textContent).toContain("poke dex content");
    expect(host.textContent).not.toContain("home content");
    expect(signals).toHaveLength(1);

    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it("aborts a pending destination guard when a newer navigation supersedes it", async () => {
    let finishGuard!: () => void;
    const signals: AbortSignal[] = [];

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => textNode("p", "home content"),
          },
          {
            path: "poke-dex",
            beforeLoad: ({ signal }) => {
              signals.push(signal);

              return new Promise<void>((resolve) => {
                finishGuard = resolve;
              });
            },
            component: () => textNode("p", "stale poke dex content"),
          },
          {
            path: "settings",
            component: () => textNode("p", "settings content"),
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

    navigate("/poke-dex");
    await Promise.resolve();

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    expect(host.textContent).toContain("home content");

    navigate("/settings");

    expect(signals[0].aborted).toBe(true);
    expect(host.textContent).toContain("settings content");
    expect(host.textContent).not.toContain("stale poke dex content");

    finishGuard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/settings");
    expect(host.textContent).toContain("settings content");
    expect(host.textContent).not.toContain("stale poke dex content");

    unmount();
  });

  it("keeps a pending guard when params and search change on the same destination route", async () => {
    let finishGuard!: () => void;
    const signals: AbortSignal[] = [];
    const guardSnapshots: string[] = [];

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => textNode("p", "home content"),
          },
          {
            path: "users/:id",
            beforeLoad: ({ location, params, signal }) => {
              signals.push(signal);
              guardSnapshots.push(
                `${location.pathname}${location.search}:${params.id}`,
              );

              return new Promise<void>((resolve) => {
                finishGuard = resolve;
              });
            },
            component: () => textNode("p", "user page content"),
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

    navigate("/users/1?tab=old");
    await Promise.resolve();

    expect(signals).toHaveLength(1);
    expect(guardSnapshots).toEqual(["/users/1?tab=old:1"]);

    navigate("/users/2?tab=new");

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    expect(host.textContent).toContain("home content");

    finishGuard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/users/2");
    expect(window.location.search).toBe("?tab=new");
    expect(guardSnapshots).toEqual(["/users/1?tab=old:1"]);
    expect(host.textContent).toContain("user page content");
    expect(host.textContent).not.toContain("home content");

    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it("keeps the current route visible until a pending destination guard redirects", async () => {
    let finishGuard!: () => void;
    const scheduledFrames: FrameRequestCallback[] = [];
    requestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      },
    });

    const routes: Route[] = [
      {
        path: "/",
        component: (props) => <main>{props.children}</main>,
        children: [
          {
            path: "/",
            component: () => textNode("p", "home content"),
          },
          {
            path: "redirect",
            beforeLoad: async () => {
              await new Promise<void>((resolve) => {
                finishGuard = resolve;
              });
              redirect("/target?id=1");
            },
            component: () => textNode("p", "redirect page must not render"),
          },
          {
            path: "target",
            component: () => textNode("p", "target page content"),
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

    navigate("/redirect");
    await Promise.resolve();

    expect(host.textContent).toContain("home content");
    expect(host.textContent).not.toContain("redirect page must not render");

    finishGuard();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain("home content");
    expect(host.textContent).not.toContain("redirect page must not render");
    expect(scheduledFrames).toHaveLength(1);

    scheduledFrames.shift()?.(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/target");
    expect(window.location.search).toBe("?id=1");
    expect(host.textContent).toContain("target page content");
    expect(host.textContent).not.toContain("home content");

    unmount();
  });

  it("commits the destination route after an asynchronous beforeLoad redirect", async () => {
    history.replaceState(null, "", "/redirect");

    const scheduledFrames: FrameRequestCallback[] = [];
    requestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      },
    });

    const routes: Route[] = [
      {
        path: "/redirect",
        beforeLoad: async () => {
          await Promise.resolve();
          redirect("/target?id=1");
        },
        component: () => textNode("p", "redirect route must not render"),
      },
      {
        path: "/target",
        component: () => textNode("p", "target route nodes"),
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/redirect",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).not.toContain("redirect route must not render");
    expect(window.location.pathname).toBe("/redirect");
    expect(scheduledFrames).toHaveLength(1);

    // The URL update waits until the current route conditional has committed.
    scheduledFrames.shift()?.(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/target");
    expect(window.location.search).toBe("?id=1");
    expect(host.textContent).toContain("target route nodes");

    unmount();
  });

  it("ignores a redirect from a guard after its route view is disposed", async () => {
    history.replaceState(null, "", "/users/1");

    const guardResolvers = new Map<string, () => void>();
    const signals: AbortSignal[] = [];
    const scheduledFrames: FrameRequestCallback[] = [];
    requestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      },
    });

    const routes: Route[] = [
      {
        path: "/users/:id",
        beforeLoad: async ({ params, signal }) => {
          signals.push(signal);
          await new Promise<void>((resolve) => {
            guardResolvers.set(params.id!, resolve);
          });

          if (params.id === "1") {
            redirect("/stale");
          }
        },
        component: () => textNode("p", "user route"),
      },
      {
        path: "/settings",
        component: () => textNode("p", "current settings"),
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/users/1",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    await Promise.resolve();
    expect(guardResolvers.has("1")).toBe(true);

    // A different matched route disposes the old RouteView and aborts its guard.
    navigate("/settings");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(signals[0].aborted).toBe(true);
    expect(host.textContent).toContain("current settings");

    // Resolving the disposed guard must not commit its stale redirect.
    guardResolvers.get("1")!();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/settings");
    expect(scheduledFrames).toHaveLength(0);

    unmount();
  });

  it("does not rerun beforeLoad when params or search change within the same matched route", async () => {
    history.replaceState(null, "", "/users/1?tab=old");

    const signals: AbortSignal[] = [];
    const guardLocations: string[] = [];
    const guardDependency = $state(0);
    let guardRuns = 0;

    const routes: Route[] = [
      {
        path: "/users/:id",
        beforeLoad: async ({ signal, location }) => {
          // Reading reactive state inside a guard must not subscribe the
          // navigation resource or cause the guard to restart.
          expect(Number.isFinite(guardDependency.value)).toBe(true);
          guardRuns++;
          signals.push(signal);
          guardLocations.push(`${location.pathname}${location.search}`);

          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
        },
        component: () => textNode("p", "user route"),
      },
    ];

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () =>
        Router({
          url: "/users/1?tab=old",
          routes,
        }) as unknown as JSX.Element,
      host,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(1);
    expect(signals[0].aborted).toBe(false);

    guardDependency.value++;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(1);
    expect(signals[0].aborted).toBe(false);

    // Params and search updates keep the same matched RouteView alive.
    // beforeLoad receives the initial location and is not revalidated in place.
    navigate("/users/2?tab=new");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(1);
    expect(signals[0].aborted).toBe(false);

    // A query-only navigation also leaves the current guard untouched.
    navigate("/users/2?tab=next");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(1);
    expect(signals[0].aborted).toBe(false);
    expect(guardLocations).toEqual(["/users/1?tab=old"]);

    unmount();

    expect(signals[0].aborted).toBe(true);
  });
});
