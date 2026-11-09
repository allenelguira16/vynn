// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { $state, type JSX } from "vynn";

import { renderToDOM } from "vynn/client";
import { $insert, $tmpl, $txt } from "vynn/render";
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
  const element = $tmpl(tag);
  $insert(element, $txt(value));
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
