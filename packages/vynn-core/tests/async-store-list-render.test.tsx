// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { Await } from "../src/components/await";
import { renderToDOM } from "../src/client/render-to-dom";
import { $computed } from "../src/reactivity_new/computed";
import { isPending } from "../src/reactivity_new/pending";
import { $state } from "../src/reactivity_new/state";
import { $store } from "../src/reactivity_new/store";
import { renderToServer } from "../src/server/render-to-server";

function Row(props: { name: string; url: string }) {
  return <li>{props.name}|{props.url}</li>;
}

afterEach(() => {
  document.body.innerHTML = "";
});

async function flushUpdates(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("async store list rendering", () => {
  it.fails("adds DOM rows when a store array is mutated with push()", () => {
    let append!: () => void;

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => {
      const counterArray = $store(() => [0]);
      append = () => {
        counterArray.push(counterArray.at(-1)! + 1);
      };

      return (
        <ul>
          {counterArray.map((value) => (
            <li>{value}</li>
          ))}
        </ul>
      );
    }, host);

    try {
      expect(host.textContent).toBe("0");

      append();

      expect(host.textContent).toBe("01");
    } finally {
      unmount();
    }
  });

  it("updates destructured component rows when an async store refreshes in place", async () => {
    const resolvers = new Map<string, () => void>();
    let updateUrl!: (url: string) => void;

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => {
      const url = $state(() => "/first");
      updateUrl = (nextUrl) => {
        url.value = nextUrl;
      };

      const pokedex = $store(async () => {
        const requestedUrl = url.value;

        await new Promise<void>((resolve) => {
          resolvers.set(requestedUrl, resolve);
        });

        return {
          results: [
            { name: requestedUrl, url: requestedUrl },
          ],
        };
      });

      return (
        <Await fallback={<p>Loading</p>}>
          <ul>
            {pokedex.results.map(({ name, url }) => (
              <Row name={name} url={url} />
            ))}
          </ul>
        </Await>
      );
    }, host);

    try {
      expect(host.textContent).toContain("Loading");

      resolvers.get("/first")?.();
      await flushUpdates();

      expect(host.textContent).toContain("/first|/first");

      updateUrl("/second");
      expect(resolvers.has("/second")).toBe(true);

      resolvers.get("/second")?.();
      await flushUpdates();

      expect(host.textContent).toContain("/second|/second");
      expect(host.textContent).not.toContain("/first|/first");
    } finally {
      unmount();
    }
  });

  it("waits for async store settlement when isPending is rendered during SSR", async () => {
    let resolveStore!: (value: { ready: boolean }) => void;

    const renderedPromise = renderToServer(
      () => {
        const store = $store(
          async () =>
            new Promise<{ ready: boolean }>((resolve) => {
              resolveStore = resolve;
            }),
        );

        return (
          <Await fallback={<p>Loading</p>}>
            <button disabled={isPending(store)}>Continue</button>
          </Await>
        );
      },
      "async",
    );

    // SSR should have registered the resource with Await rather than
    // serializing disabled=true before the initial request has settled.
    resolveStore({ ready: true });

    const rendered = await renderedPromise;

    expect(rendered.body).toContain("<button>Continue</button>");
    expect(rendered.body).not.toContain('<button disabled="">');
    expect(rendered.body).not.toContain("Loading");
  });

  it("patches streaming SSR with the settled isPending attribute state", async () => {
    let resolveStore!: (value: { ready: boolean }) => void;

    const rendered = renderToServer(
      () => {
        const store = $store(
          async () =>
            new Promise<{ ready: boolean }>((resolve) => {
              resolveStore = resolve;
            }),
        );

        return (
          <Await fallback={<p>Loading</p>}>
            <button disabled={isPending(store)}>Continue</button>
          </Await>
        );
      },
      "stream",
    );

    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();

    expect(firstChunk.done).toBe(false);

    resolveStore({ ready: true });

    let html = decoder.decode(firstChunk.value);
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value);
    }

    expect(html).toContain("Loading");
    expect(html).toContain("<button>Continue</button>");
    expect(html).not.toContain('<button disabled="">');
  });

  it("waits for async dependencies when a computed pending state is rendered during SSR", async () => {
    let resolveValue!: (value: { ready: boolean }) => void;

    const renderedPromise = renderToServer(
      () => {
        const state = $state(
          async () =>
            new Promise<{ ready: boolean }>((resolve) => {
              resolveValue = resolve;
            }),
        );
        const computed = $computed(() => state.value.ready);

        return (
          <Await fallback={<p>Loading</p>}>
            <button disabled={isPending(computed)}>Continue</button>
          </Await>
        );
      },
      "async",
    );

    resolveValue({ ready: true });

    const rendered = await renderedPromise;

    expect(rendered.body).toContain("<button>Continue</button>");
    expect(rendered.body).not.toContain('<button disabled="">');
    expect(rendered.body).not.toContain("Loading");
  });
});
