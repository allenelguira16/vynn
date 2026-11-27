// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { Portal } from "../src/components/portal";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $insert } from "../src/render/$insert";

let requestAnimationFrameDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (requestAnimationFrameDescriptor) {
    Object.defineProperty(window, "requestAnimationFrame", requestAnimationFrameDescriptor);
    requestAnimationFrameDescriptor = undefined;
  } else {
    Reflect.deleteProperty(window, "requestAnimationFrame");
  }

  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Portal hydration", () => {
  it("removes only its own nodes when the $insert disposer runs", () => {
    const mount = document.createElement("div");
    const existing = document.createElement("span");
    const inserted = document.createElement("p");
    existing.textContent = "Existing";
    inserted.textContent = "Inserted";
    mount.append(existing);

    const owner = createOwner();
    const cleanup = runWithOwner(owner, () => $insert(mount, inserted));

    expect(typeof cleanup).toBe("function");
    expect(mount.childNodes).toHaveLength(2);

    if (typeof cleanup !== "function") {
      throw new Error("Expected $insert to return a cleanup function.");
    }

    cleanup();

    expect(mount.childNodes).toHaveLength(1);
    expect(mount.firstChild).toBe(existing);
    expect(mount.textContent).toBe("Existing");

    disposeOwner(owner);
  });


  it("mounts client-only portal children after the root hydration pass", () => {
    const root = document.createElement("div");
    root.innerHTML = '<main><div id="portal-target"></div></main>';

    // This is a client-only external mount, so its pre-existing content is
    // not part of the root hydration claim queue.
    const mount = document.createElement("div");
    mount.innerHTML = '<span id="keep">Keep me</span>';
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

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let unmount: (() => void) | undefined;

    try {
      const App = (): JSX.Element => (
        <main>
          <div id="portal-target"></div>
          <Portal mount={mount}>
            <div>
              <h1>Portal</h1>
              <p>First name</p>
            </div>
          </Portal>
        </main>
      );

      unmount = hydrateToDOM(App, root);

      // Portal content is intentionally absent from the server-rendered tree.
      expect(mount.childNodes).toHaveLength(1);
      expect(mount.querySelector("#keep")?.textContent).toBe("Keep me");
      expect(scheduledFrames.length).toBeGreaterThan(0);

      // Complete the after-hydration work scheduled by the component mount.
      while (scheduledFrames.length > 0) {
        scheduledFrames.shift()?.(0);
      }

      expect(mount.querySelector("h1")?.textContent).toBe("Portal");
      expect(mount.querySelector("p")?.textContent).toBe("First name");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      unmount?.();
      expect(mount.childNodes).toHaveLength(1);
      expect(mount.querySelector("#keep")?.textContent).toBe("Keep me");
    }
  });

  it("remounts SSR portal content after the root hydration pass", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div id="portal-target"><!--p:0.--><div class="server-portal">' +
      "<h1>Server portal content</h1>" +
      "</div><!--/p:0.--></div><main></main>";

    let mount: HTMLDivElement | undefined;
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

    let unmount: (() => void) | undefined;

    try {
      const App = (): JSX.Element => {
        const portalTarget = <div id="portal-target" /> as HTMLDivElement;
        mount = portalTarget;

        return (
          <>
            {portalTarget}
            <main>
              <Portal mount={portalTarget}>
                <div>
                  <h1>Client portal content</h1>
                </div>
              </Portal>
            </main>
          </>
        );
      };

      unmount = hydrateToDOM(App, root);

      expect(mount?.querySelector(".server-portal")?.textContent).toBe(
        "Server portal content",
      );
      expect(scheduledFrames.length).toBeGreaterThan(0);

      while (scheduledFrames.length > 0) {
        scheduledFrames.shift()?.(0);
      }

      expect(mount?.querySelector(".server-portal")).toBeNull();
      expect(mount?.querySelector("h1")?.textContent).toBe("Client portal content");
    } finally {
      unmount?.();
      expect(mount?.childNodes).toHaveLength(0);
    }
  });
});
