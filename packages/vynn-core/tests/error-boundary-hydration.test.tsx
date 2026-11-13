// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { ASYNC_DATA_SSR_KEY, ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { Await } from "../src/components/await";
import { $computed } from "../src/reactivity_new/computed";
import { isPending } from "../src/reactivity_new/pending";
import { $state } from "../src/reactivity_new/state";
import { renderToServer } from "../src/server/render-to-server";
import { ErrorBoundary } from "../src/components/error-boundary";
import { lazy } from "../src/components/lazy";

afterEach(() => {
  document.body.innerHTML = "";
  const windowValues = window as unknown as Record<string, unknown>;
  delete windowValues[ASYNC_DATA_SSR_KEY];
  delete windowValues[ERROR_BOUNDARY_DATA_SSR_KEY];
  vi.restoreAllMocks();
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

  it("keeps sibling async resources aligned when an earlier ErrorBoundary hydrates its fallback", async () => {
    const fallback = (error: Error, reset: () => void) => (
      <div>
        <p>{String(error)}</p>
        <button class="btn" onClick={reset}>
          Try Again
        </button>
      </div>
    );

    function ComponentWillThrow(): JSX.Element {
      throw new Error("sync SSR failure");
    }

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await Promise.resolve();
        throw new Error("async SSR failure");
      });

      return <div>{count.value}</div>;
    }

    function ComponentWillThrowAfterCount(): JSX.Element {
      const baseCount = $state(() => 0);
      const count = $computed(async () => {
        const nextCount = baseCount.value;
        await Promise.resolve();
        return nextCount;
      });

      return (
        <div>
          <Await fallback="Loading siya..">
            <div>Count: {count.value}</div>
            <button
              class="btn"
              onClick={() => {
                baseCount.value++;
              }}
              disabled={isPending(count)}
            >
              Add
            </button>
          </Await>
        </div>
      );
    }

    function App(): JSX.Element {
      return (
        <main>
          {ErrorBoundary({
            children: (() => ComponentWillThrow()) as unknown as JSX.Element,
            fallback,
          })}
          {ErrorBoundary({
            children: (() => ComponentWillThrowAfterAsync()) as unknown as JSX.Element,
            fallback,
          })}
          {ErrorBoundary({
            children: (() => ComponentWillThrowAfterCount()) as unknown as JSX.Element,
            fallback,
          })}
        </main>
      );
    }

    // Render the same three-boundary shape used by the regression report.
    const rendered = await renderToServer(App, "async");
    const hydrationScript =
      /<script>\$AD=([\s\S]*?);\$EBD=([\s\S]*?);document\.currentScript\.remove\(\);<\/script>/.exec(
        rendered.body,
      );

    expect(hydrationScript).not.toBeNull();

    const asyncValues = JSON.parse(hydrationScript![1]) as Record<string, unknown>;
    const errorValues = JSON.parse(hydrationScript![2]) as Array<{ status: string }>;

    // The rejected second boundary must not shift the third boundary's value.
    expect(asyncValues).toEqual({ "boundary:2:children:0": 0 });
    expect(errorValues.map(({ status }) => status)).toEqual([
      "fallback",
      "fallback",
      "children",
    ]);

    const host = document.createElement("div");
    host.innerHTML = rendered.body.replace(hydrationScript![0], "");
    document.body.append(host);

    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = asyncValues;
    windowValues[ERROR_BOUNDARY_DATA_SSR_KEY] = errorValues;

    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unmount = hydrateToDOM(App, host);

    expect(host.textContent).toContain("Count: 0");
    expect(host.textContent).toContain("Add");
    expect(host.textContent).not.toContain("Loading siya..");
    expect(host.querySelectorAll("button")[2]?.disabled).toBe(false);
    expect(
      warnings.mock.calls.filter(([message]) =>
        String(message).includes("Hydration mismatch"),
      ),
    ).toEqual([]);

    unmount();
  });


  it("clears Await's pending state when a nested async resource rejects", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await Promise.resolve();
        throw new Error("async child resource failed");
      });

      return <div>{count.value}</div>;
    }

    function App(): JSX.Element {
      return (
        <Await fallback={<p>Await loading...</p>}>
          <ErrorBoundary
            fallback={(error) => <p>Boundary: {error.message}</p>}
          >
            <ComponentWillThrowAfterAsync />
          </ErrorBoundary>
        </Await>
      );
    }

    const unmount = renderToDOM(App, host);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("Boundary: async child resource failed");
      expect(host.textContent).not.toContain("Await loading...");
    } finally {
      unmount();
    }
  });


  it("handles a rejected async resource again after ErrorBoundary retry", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await Promise.resolve();
        throw new Error("async resource failed");
      });

      return <div>{count.value}</div>;
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div>
              <p>{String(error)}</p>
              <button onClick={reset}>Try Again</button>
            </div>
          )}
        >
          <ComponentWillThrowAfterAsync />
        </ErrorBoundary>
      ),
      host,
    );

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("async resource failed");
      expect(host.querySelector("button")?.textContent).toBe("Try Again");

      host.querySelector("button")?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("async resource failed");
      expect(host.querySelector("button")?.textContent).toBe("Try Again");
    } finally {
      unmount();
    }
  });


  it("can retry a rejected async resource restored from an SSR ErrorBoundary fallback", async () => {
    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await Promise.resolve();
        throw new Error("async SSR resource failed");
      });

      return <div>{count.value}</div>;
    }

    function App(): JSX.Element {
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div>
              <p>{String(error)}</p>
              <button onClick={reset}>Try Again</button>
            </div>
          )}
        >
          <ComponentWillThrowAfterAsync />
        </ErrorBoundary>
      );
    }

    const rendered = await renderToServer(App, "async");
    const hydrationScript =
      /<script>\$AD=([\s\S]*?);\$EBD=([\s\S]*?);document\.currentScript\.remove\(\);<\/script>/.exec(
        rendered.body,
      );

    expect(hydrationScript).not.toBeNull();

    const windowValues = window as unknown as Record<string, unknown>;
    windowValues[ASYNC_DATA_SSR_KEY] = JSON.parse(hydrationScript![1]);
    windowValues[ERROR_BOUNDARY_DATA_SSR_KEY] = JSON.parse(hydrationScript![2]);

    const host = document.createElement("div");
    host.innerHTML = rendered.body.replace(hydrationScript![0], "");
    document.body.append(host);

    const unmount = hydrateToDOM(App, host);

    try {
      expect(host.textContent).toContain("async SSR resource failed");
      expect(host.querySelector("button")?.textContent).toBe("Try Again");

      host.querySelector("button")?.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("async SSR resource failed");
      expect(host.querySelector("button")?.textContent).toBe("Try Again");
    } finally {
      unmount();
    }
  });

  it("recovers async failures inside a lazy page alongside a resolved Await boundary", async () => {
    function ComponentWillThrow(): JSX.Element {
      throw new Error("sync component failed");
    }

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await Promise.resolve();
        throw new Error("async component failed");
      });

      return <div>{count.value}</div>;
    }

    function ComponentWillThrowAfterCount(): JSX.Element {
      const baseCount = $state(() => 0);
      const count = $computed(async () => {
        const value = baseCount.value;
        await Promise.resolve();
        return value;
      });

      return (
        <Await fallback="Loading">
          <div>Count: {count.value}</div>
          <button disabled={isPending(count)}>Add</button>
        </Await>
      );
    }

    const LazyPage = lazy(
      () =>
        Promise.resolve({
          Page: () => (
            <main>
              <ErrorBoundary fallback={(error) => <p>First: {error.message}</p>}>
                <ComponentWillThrow />
              </ErrorBoundary>
              <ErrorBoundary fallback={(error) => <p>Second: {error.message}</p>}>
                <ComponentWillThrowAfterAsync />
              </ErrorBoundary>
              <ErrorBoundary fallback={(error) => <p>Third: {error.message}</p>}>
                <ComponentWillThrowAfterCount />
              </ErrorBoundary>
            </main>
          ),
        }),
      "Page",
    );

    const rendered = renderToServer(() => LazyPage(undefined as never), "stream");
    const reader = rendered.body.getReader();
    const chunks: string[] = [];

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(new TextDecoder().decode(result.value));
    }

    const html = chunks.join("");
    expect(html).toContain("First: sync component failed");
    expect(html).toContain("Second: async component failed");
    expect(html).toContain("Count: ");
    expect(html).toContain("Add");
    expect(html).toContain("$AD=");
    expect(html).toContain("$EBD=");
  });


});
