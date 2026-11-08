// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { Await } from "../src/components/await";
import { lazy } from "../src/components/lazy";
import type { JSX } from "../src/types/jsx";

afterEach(() => {
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function flushUpdates() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("Await with lazy components", () => {
  it("shows the fallback while a lazy component loads during client-side rendering", async () => {
    const module = deferred<{ Page: () => JSX.Element }>();
    const LazyPage = lazy(() => module.promise, "Page");

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <Await fallback={<p>Loading page</p>}>
          <LazyPage />
        </Await>
      ),
      host,
    );

    expect(host.textContent).toBe("Loading page");

    module.resolve({
      Page: () => <p>Loaded page</p>,
    });
    await flushUpdates();

    expect(host.textContent).toBe("Loaded page");

    unmount();
  });

  it("keeps the server-rendered lazy content visible while its module hydrates", async () => {
    const module = deferred<{ Page: () => JSX.Element }>();
    const LazyPage = lazy(() => module.promise, "Page");

    const host = document.createElement("div");
    host.innerHTML = "<!--l:0--><p>Loaded page</p><!--/l:0-->";

    const serverPage = host.querySelector("p");

    const unmount = hydrateToDOM(
      () => (
        <Await fallback={<p>Loading page</p>}>
          <LazyPage />
        </Await>
      ),
      host,
    );

    expect(host.textContent).toBe("Loaded page");
    expect(host.querySelector("p")).toBe(serverPage);

    module.resolve({
      Page: () => <p>Loaded page</p>,
    });
    await flushUpdates();

    expect(host.textContent).toBe("Loaded page");
    expect(host.querySelector("p")).toBe(serverPage);

    unmount();
  });
});
