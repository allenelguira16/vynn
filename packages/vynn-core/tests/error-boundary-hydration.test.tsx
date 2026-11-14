// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { getAsyncIDIfAvailable, initializeAsyncContext } from "../src/context/async-context";
import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { createComponentOwner, createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { renderToDOM } from "../src/client/render-to-dom";
import { createBoundary } from "../src/life-cycle/boundary";
import { Await } from "../src/components/await";
import { ErrorBoundary } from "../src/components/error-boundary";
import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../src/const";
import { $computed } from "../src/reactivity_new/computed";

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

  it("keeps fallback resource IDs stable when the failed child branch is skipped", () => {
    function getFallbackResourceID(renderFailedChild: boolean): string | undefined {
      const root = createOwner(null);

      try {
        return runWithOwner(root, () => {
          initializeAsyncContext();

          const boundaryComponentOwner = createComponentOwner();

          return runWithOwner(boundaryComponentOwner, () => {
            const boundaryOwner = createBoundary();
            const childrenOwner = createComponentOwner(boundaryOwner);
            const fallbackOwner = createComponentOwner(boundaryComponentOwner);

            if (renderFailedChild) {
              const failedChild = createComponentOwner(childrenOwner);
              runWithOwner(failedChild, getAsyncIDIfAvailable);
            }

            return runWithOwner(fallbackOwner, getAsyncIDIfAvailable);
          });
        });
      } finally {
        disposeOwner(root);
      }
    }

    const serverFallbackID = getFallbackResourceID(true);
    const clientFallbackID = getFallbackResourceID(false);

    expect(serverFallbackID).toBe("root:root.0.1:0");
    expect(clientFallbackID).toBe(serverFallbackID);
  });

  it("keeps sibling resource IDs stable when a boundary subtree is skipped", () => {
    function getSiblingResourceID(renderFailedChild: boolean): string | undefined {
      const root = createOwner(null);

      try {
        return runWithOwner(root, () => {
          initializeAsyncContext();

          const boundary = createComponentOwner();

          runWithOwner(boundary, () => {
            if (!renderFailedChild) return;

            const failedChild = createComponentOwner();
            runWithOwner(failedChild, () => {
              expect(getAsyncIDIfAvailable()).toBe("root:root.0.0:0");
            });
          });

          const sibling = createComponentOwner();
          return runWithOwner(sibling, getAsyncIDIfAvailable);
        });
      } finally {
        disposeOwner(root);
      }
    }

    const serverSiblingID = getSiblingResourceID(true);
    const clientSiblingID = getSiblingResourceID(false);

    expect(serverSiblingID).toBe("root:root.1:0");
    expect(clientSiblingID).toBe(serverSiblingID);
  });

  it("catches synchronous child render errors without catching its own fallback", () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrow(): JSX.Element {
      throw new Error("synchronous child failed");
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary fallback={(error) => <p>Handled: {error.message}</p>}>
          <ComponentWillThrow />
        </ErrorBoundary>
      ),
      host,
    );

    try {
      expect(host.textContent).toContain("Handled: synchronous child failed");
    } finally {
      unmount();
    }
  });

  it("routes an async computed rejection to its nearest ErrorBoundary", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const value = $computed(async () => {
        await Promise.resolve();
        throw new Error("async component failed");
      });

      return <p>{value.value}</p>;
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary fallback={(error) => <p>Handled: {error.message}</p>}>
          <ComponentWillThrowAfterAsync />
        </ErrorBoundary>
      ),
      host,
    );

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("Handled: async component failed");
    } finally {
      unmount();
    }
  });

  it("routes a delayed rejection from nested JSX to its nearest ErrorBoundary", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const count = $computed(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        throw new Error("delayed nested component failed");
      });

      return (
        <div>
          <div>test</div>
          <div>{count.value}</div>
        </div>
      );
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary fallback={(error) => <p>Handled: {error.message}</p>}>
          <ComponentWillThrowAfterAsync />
        </ErrorBoundary>
      ),
      host,
    );

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 40));

      expect(host.textContent).toContain("Handled: delayed nested component failed");
      expect(host.textContent).not.toContain("test");
    } finally {
      unmount();
    }
  });

  it("routes an Await child rejection to an enclosing ErrorBoundary", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrowAfterAsync(): JSX.Element {
      const value = $computed(async () => {
        await Promise.resolve();
        throw new Error("Await child failed");
      });

      return <p>{value.value}</p>;
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary fallback={(error) => <p>Handled: {error.message}</p>}>
          <Await fallback={<p>Loading...</p>}>
            <ComponentWillThrowAfterAsync />
          </Await>
        </ErrorBoundary>
      ),
      host,
    );

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(host.textContent).toContain("Handled: Await child failed");
      expect(host.textContent).not.toContain("Loading...");
    } finally {
      unmount();
    }
  });

  it("routes errors thrown by a fallback to the parent ErrorBoundary", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    function ComponentWillThrow(): JSX.Element {
      throw new Error("child failed");
    }

    const unmount = renderToDOM(
      () => (
        <ErrorBoundary fallback={(error) => <p>Outer: {error.message}</p>}>
          <ErrorBoundary
            fallback={() => {
              throw new Error("inner fallback failed");
            }}
          >
            <ComponentWillThrow />
          </ErrorBoundary>
        </ErrorBoundary>
      ),
      host,
    );

    try {
      expect(host.textContent).toContain("Outer: inner fallback failed");
    } finally {
      unmount();
    }
  });
});
