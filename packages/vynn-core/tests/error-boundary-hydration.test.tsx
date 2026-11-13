// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { ErrorBoundary } from "../src/components/error-boundary";

afterEach(() => {
  document.body.innerHTML = "";
  delete (window as unknown as Record<string, unknown>)[ERROR_BOUNDARY_DATA_SSR_KEY];
});

describe("ErrorBoundary hydration", () => {
  it("allows retrying an SSR fallback when its children succeed in the browser", () => {
    const host = document.createElement("div");
    host.innerHTML = [
      "<main>",
      "<!--eb:0-->",
      "<div><p>SSRFailure: This only fails on the server</p><button>Try Again</button></div>",
      "<!--/eb:0-->",
      "</main>",
    ].join("");
    document.body.append(host);

    (window as unknown as Record<string, unknown>)[ERROR_BOUNDARY_DATA_SSR_KEY] = [
      {
        status: "fallback",
        name: "SSRFailure",
        message: "This only fails on the server",
      },
    ];

    let childRenders = 0;

    function ComponentWillThrow(): JSX.Element {
      childRenders++;

      if (typeof window === "undefined") {
        throw new Error("This component only fails during SSR");
      }

      return <p>Client rendered successfully</p>;
    }

    const unmount = hydrateToDOM(
      () => (
        <main>
          {ErrorBoundary({
            children: (() => ComponentWillThrow()) as unknown as JSX.Element,
            fallback: (error, reset) => (
              <div>
                <p>
                  {error.name}: {error.message}
                </p>
                <button onClick={reset}>Try Again</button>
              </div>
            ),
          })}
        </main>
      ),
      host,
    );

    expect(childRenders).toBe(0);
    expect(host.textContent).toContain("SSRFailure: This only fails on the server");

    host.querySelector("button")?.click();

    expect(childRenders).toBe(1);
    expect(host.textContent).toContain("Client rendered successfully");
    expect(host.textContent).not.toContain("Try Again");

    unmount();
  });
});
