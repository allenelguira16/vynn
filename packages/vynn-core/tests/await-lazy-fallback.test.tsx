// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { Await } from "../src/components/await";
import { Catch } from "../src/components/catch";
import { lazy } from "../src/components/lazy";
import { getOwner } from "../src/life-cycle/owner";
import { $state } from "../src/reactivity/state";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
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

function createRefreshScenario(suspense: boolean) {
  const source = $state(1);
  const requests = new Map<number, ReturnType<typeof deferred<string>>>();

  function Page(): JSX.Element {
    const data = $state(async () => {
      const id = source.value;
      const request = deferred<string>();

      requests.set(id, request);

      return request.promise;
    });

    return <p>{data.value}</p>;
  }

  const host = document.createElement("div");
  document.body.append(host);

  const unmount = renderToDOM(
    () => (
      <Await suspense={suspense} fallback={<p>Loading page</p>}>
        <Page />
      </Await>
    ),
    host,
  );

  return { host, requests, source, unmount };
}

describe("client-only boundary identity", () => {
  it("keeps Await child owner IDs aligned with the server", () => {
    let childOwnerID: string | undefined;

    function Child(): JSX.Element {
      childOwnerID = getOwner()?.id;
      return <p>Ready</p>;
    }

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <Await fallback={<p>Loading</p>}>
          <Child />
        </Await>
      ),
      host,
    );

    expect(childOwnerID).toBe("000");
    expect(host.textContent).toBe("Ready");

    unmount();
  });

  it("keeps Catch child owner IDs aligned with the server", () => {
    let childOwnerID: string | undefined;

    function Child(): JSX.Element {
      childOwnerID = getOwner()?.id;
      return <p>Ready</p>;
    }

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <Catch fallback={(error) => <p>{error.message}</p>}>
          <Child />
        </Catch>
      ),
      host,
    );

    expect(childOwnerID).toBe("000");
    expect(host.textContent).toBe("Ready");

    unmount();
  });
});

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

  it("hydrates resolved Await branches inside a lazy route after streaming replaced their fallbacks", async () => {
    const routeModule = deferred<{ Page: () => JSX.Element }>();
    const firstModule = deferred<{ Page: () => JSX.Element }>();
    const secondModule = deferred<{ Page: () => JSX.Element }>();
    const Route = lazy(() => routeModule.promise, "Page");
    const FirstLazy = lazy(() => firstModule.promise, "Page");
    const SecondLazy = lazy(() => secondModule.promise, "Page");

    const host = document.createElement("div");
    host.innerHTML =
      '<!--l:0--><!--a:r--><div><h4>Test</h4><!--l:0.3--><p>First server result</p><!--/l:0.3--><!--a:r--><!--l:0.2--><p>Second server result</p><!--/l:0.2--><h5>Test</h5></div><!--/l:0-->';
    document.body.append(host);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const firstServerNode = host.querySelector("h4");
    const secondServerNode = host.querySelector("h5");
    const firstLazyNode = host.querySelector("p");
    const secondLazyNode = host.querySelectorAll("p")[1];

    const unmount = hydrateToDOM(() => <Route />, host);

    try {
      expect(host.textContent).toContain("First server result");
      expect(host.textContent).toContain("Second server result");
      expect(host.textContent).not.toContain("Tester");
      expect(host.textContent).not.toContain("Tester2");
      expect(warn).not.toHaveBeenCalled();

      routeModule.resolve({
        Page: () => (
          <div>
            <Await fallback="Tester">
              <h4>Test</h4>
              <FirstLazy />
            </Await>
            <Await fallback="Tester2">
              <SecondLazy />
            </Await>
            <h5>Test</h5>
          </div>
        ),
      });
      await flushUpdates();

      expect(host.querySelector("h4")).toBe(firstServerNode);
      expect(host.querySelector("h5")).toBe(secondServerNode);
      expect(host.querySelectorAll("p")[0]).toBe(firstLazyNode);
      expect(host.querySelectorAll("p")[1]).toBe(secondLazyNode);
      expect(host.textContent).not.toContain("Tester");
      expect(host.textContent).not.toContain("Tester2");
      expect(warn).not.toHaveBeenCalled();

      firstModule.resolve({
        Page: () => <p>First server result</p>,
      });
      secondModule.resolve({
        Page: () => <p>Second server result</p>,
      });
      await flushUpdates();

      expect(host.querySelector("h4")).toBe(firstServerNode);
      expect(host.querySelector("h5")).toBe(secondServerNode);
      expect(host.querySelectorAll("p")[0]).toBe(firstLazyNode);
      expect(host.querySelectorAll("p")[1]).toBe(secondLazyNode);
      expect(host.textContent).toContain("First server result");
      expect(host.textContent).toContain("Second server result");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      unmount();
    }
  });

  it("keeps an SSR fallback when the server marked the Await as pending", async () => {
    const module = deferred<{ Page: () => JSX.Element }>();
    const LazyPage = lazy(() => module.promise, "Page");

    const host = document.createElement("div");
    host.innerHTML = "<!--a:f-->Loading page";
    document.body.append(host);

    const unmount = hydrateToDOM(
      () => (
        <Await fallback="Loading page">
          <LazyPage />
        </Await>
      ),
      host,
    );

    try {
      expect(host.textContent).toBe("Loading page");

      module.resolve({
        Page: () => <p>Loaded page</p>,
      });
      await flushUpdates();

      expect(host.textContent).toBe("Loaded page");
    } finally {
      unmount();
    }
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

describe("Await suspense mode", () => {
  it("shows the fallback again while an async child refreshes", async () => {
    const { host, requests, source, unmount } = createRefreshScenario(true);

    try {
      expect(host.textContent).toBe("Loading page");

      requests.get(1)!.resolve("First result");
      await flushUpdates();

      expect(host.textContent).toBe("First result");

      source.value = 2;
      await flushUpdates();

      expect(host.textContent).toBe("Loading page");

      requests.get(2)!.resolve("Second result");
      await flushUpdates();

      expect(host.textContent).toBe("Second result");
    } finally {
      unmount();
    }
  });

  it("keeps resolved children visible during refreshes by default", async () => {
    const { host, requests, source, unmount } = createRefreshScenario(false);

    try {
      expect(host.textContent).toBe("Loading page");

      requests.get(1)!.resolve("First result");
      await flushUpdates();

      expect(host.textContent).toBe("First result");

      source.value = 2;
      await flushUpdates();

      expect(host.textContent).toBe("First result");

      requests.get(2)!.resolve("Second result");
      await flushUpdates();

      expect(host.textContent).toBe("Second result");
    } finally {
      unmount();
    }
  });

  it("keeps the fallback visible until every pending child operation settles", async () => {
    const firstRequest = deferred<string>();
    const secondRequest = deferred<string>();

    function Page(): JSX.Element {
      const first = $state(async () => firstRequest.promise);
      const second = $state(async () => secondRequest.promise);

      return (
        <div>
          <p>{first.value}</p>
          <p>{second.value}</p>
        </div>
      );
    }

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(
      () => (
        <Await suspense fallback={<p>Loading page</p>}>
          <Page />
        </Await>
      ),
      host,
    );

    try {
      expect(host.textContent).toBe("Loading page");

      firstRequest.resolve("First result");
      await flushUpdates();

      expect(host.textContent).toBe("Loading page");

      secondRequest.resolve("Second result");
      await flushUpdates();

      expect(host.textContent).toContain("First result");
      expect(host.textContent).toContain("Second result");
    } finally {
      unmount();
    }
  });
});
