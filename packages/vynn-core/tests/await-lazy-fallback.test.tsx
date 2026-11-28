// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { hydrateToDOM } from "../src/client/hydrate-to-dom";
import { renderToDOM } from "../src/client/render-to-dom";
import { Await } from "../src/components/await";
import { Catch } from "../src/components/catch";
import { lazy } from "../src/components/lazy";
import { getOwner } from "../src/life-cycle/owner";
import { onDestroy } from "../src/life-cycle/on-destroy";
import { $state } from "../src/reactivity/state";
import { renderToServer } from "../src/server/render-to-server";

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

function createRefreshScenario(suspense: boolean) {
  const source = $state(1);
  const requests = new Map<number, ReturnType<typeof deferred<string>>>();
  let pageInstances = 0;
  let pageDestroyed = 0;

  function Page(): JSX.Element {
    pageInstances++;
    onDestroy(() => pageDestroyed++);

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

  return {
    host,
    requests,
    source,
    unmount,
    get pageInstances() {
      return pageInstances;
    },
    get pageDestroyed() {
      return pageDestroyed;
    },
  };
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
  it("does not schedule another preload after the lazy module is resolved", async () => {
    let loads = 0;
    const LazyPage = lazy(async () => {
      loads++;
      return { Page: () => <p>Loaded page</p> };
    });
    const preloadable = LazyPage as typeof LazyPage & {
      preload?: () => Promise<unknown> | undefined;
    };

    const pending = preloadable.preload?.();
    expect(pending).toBeInstanceOf(Promise);

    await pending;

    expect(loads).toBe(1);
    expect(preloadable.preload?.()).toBeUndefined();
    expect(loads).toBe(1);
  });

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
    host.innerHTML = "<!--l:000--><p>Loaded page</p><!--/l:000-->";

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

describe("Await eager JSX hydration", () => {
  it("does not duplicate a child component's eager JSX local", () => {
    function Page(): JSX.Element {
      const content = <section><p>Await content</p></section>;
      return content;
    }

    function App(): JSX.Element {
      return (
        <Await fallback={<p>Loading</p>}>
          <Page />
        </Await>
      );
    }

    const rendered = renderToServer(() => <App />, "sync");
    const host = document.createElement("div");
    host.innerHTML = rendered.body;
    document.body.append(host);

    const serverContent = host.querySelector("section");
    const unmount = hydrateToDOM(() => <App />, host);

    expect(host.querySelectorAll("section")).toHaveLength(1);
    expect(host.querySelector("section")).toBe(serverContent);
    expect(host.textContent).toBe("Await content");

    unmount();
  });
});

describe("Await suspense mode", () => {
  it("shows the fallback again while an async child refreshes", async () => {
    const scenario = createRefreshScenario(true);
    const { host, requests, source, unmount } = scenario;

    try {
      expect(host.textContent).toBe("Loading page");

      requests.get(1)!.resolve("First result");
      await flushUpdates();

      expect(host.textContent).toBe("First result");

      source.value = 2;
      await flushUpdates();

      expect(host.textContent).toBe("Loading page");
      expect(scenario.pageInstances).toBe(1);
      expect(scenario.pageDestroyed).toBe(0);

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
