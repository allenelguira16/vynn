// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { renderToDOM } from "../src/client/render-to-dom";
import { $insert } from "../src/render/$insert";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";
import { Router } from "../../vynn-router/src/router";
import { navigate } from "../../vynn-router/src/location";
import type { Route } from "../../vynn-router/src/types";
import { $state } from "../src/reactivity/$state";
import { redirect } from "../../vynn-router/src/redirect";

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

  it("ignores a redirect from an outdated guard after the route location changes", async () => {
    history.replaceState(null, "", "/users/1");

    const guardResolvers = new Map<string, () => void>();
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
        beforeLoad: async ({ params }) => {
          await new Promise<void>((resolve) => {
            guardResolvers.set(params.id!, resolve);
          });

          if (params.id === "1") {
            redirect("/stale");
          }
        },
        component: () => textNode("p", "current user"),
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

    navigate("/users/2");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(guardResolvers.has("2")).toBe(true);

    // Resolve the older guard first. Its redirect must be discarded.
    guardResolvers.get("1")!();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/users/2");
    expect(scheduledFrames).toHaveLength(0);

    guardResolvers.get("2")!();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(window.location.pathname).toBe("/users/2");
    expect(host.textContent).toContain("current user");

    unmount();
  });
  it("runs beforeLoad once per atomic navigation and aborts the previous guard", async () => {
    history.replaceState(null, "", "/users/1?tab=old");

    const signals: AbortSignal[] = [];
    const guardDependency = $state(0);
    let guardRuns = 0;

    const routes: Route[] = [
      {
        path: "/users/:id",
        beforeLoad: async ({ signal }) => {
          // Reading reactive state inside a guard must not subscribe the
          // navigation resource or cause the guard to restart.
          expect(Number.isFinite(guardDependency.value)).toBe(true);
          guardRuns++;
          signals.push(signal);

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

    // Both pathname and search change in one navigation. The route view keeps
    // its owner while the existing $async guard revalidates against the new URL.
    navigate("/users/2?tab=new");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    // A query-only navigation must also create exactly one new guard owner.
    navigate("/users/2?tab=next");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(guardRuns).toBe(3);
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);

    unmount();

    expect(signals[2].aborted).toBe(true);
  });

});
