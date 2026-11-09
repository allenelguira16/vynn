// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { Portal } from "../src/components/portal";

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
  it("mounts client-only portal children after the root hydration pass", () => {
    const root = document.createElement("div");
    root.innerHTML = '<main><div id="portal-target"></div></main>';

    const mount = root.querySelector<HTMLDivElement>("#portal-target")!;
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
      expect(mount.childNodes).toHaveLength(0);
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
    }
  });
});
