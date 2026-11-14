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

      // Await keeps the successfully rendered DOM mounted while the resource
      // itself suspends reads until the refreshed snapshot is ready.
      expect(host.textContent).toContain("/first|/first");
      expect(host.textContent).not.toContain("Loading");

      resolvers.get("/second")?.();
      await flushUpdates();

      expect(host.textContent).toContain("/second|/second");
      expect(host.textContent).not.toContain("/first|/first");
    } finally {
      unmount();
    }
  });

  it("removes trailing rows safely when an async store array shrinks", async () => {
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

        const count = requestedUrl === "/first" ? 20 : 10;

        return {
          results: Array.from({ length: count }, (_, index) => ({
            name: `${requestedUrl}-${index}`,
            url: requestedUrl,
          })),
        };
      });

      return (
        <Await fallback={<p>Loading</p>}>
          <ul>
            {pokedex.results.map(({ name, url }, index) => (
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

      expect(host.querySelectorAll("li")).toHaveLength(20);

      updateUrl("/second");
      expect(resolvers.has("/second")).toBe(true);

      resolvers.get("/second")?.();
      await flushUpdates();

      expect(host.querySelectorAll("li")).toHaveLength(10);
      expect(host.textContent).toContain("/second-9|/second");
      expect(host.textContent).not.toContain("/first");
      expect(host.textContent).not.toContain("undefined");
    } finally {
      unmount();
    }
  });

  it("preserves component instances and local state when primitive items reorder", () => {
    let componentCalls = 0;
    let updatePrimitiveList: (() => void) | undefined;

    const host = document.createElement("div");
    document.body.append(host);

    const unmount = renderToDOM(() => {
      const store = $store(() => ({
        numbers: [1, 2, 3, 4],
      }));
      updatePrimitiveList = () => {
        store.numbers = [...store.numbers].reverse();
      };

      function DropdownRow(props: { number: number; index: number }) {
        componentCalls++;
        const isOpen = $state(() => false);

        return (
          <li>
            <button
              aria-expanded={isOpen.value}
              onClick={() => {
                isOpen.value = !isOpen.value;
              }}
            >
              Toggle {props.number}
            </button>
            <span>{props.index}</span>
          </li>
        );
      }

      return (
        <ul>
          {store.numbers.map((number, index) => (
            <DropdownRow number={number} index={index} />
          ))}
        </ul>
      );
    }, host);

    try {
      expect(componentCalls).toBe(4);

      const fourthButton = [...host.querySelectorAll("button")].find(
        (button) => button.textContent === "Toggle 4",
      );
      expect(fourthButton).toBeDefined();

      fourthButton!.click();
      expect(fourthButton!.getAttribute("aria-expanded")).toBe("true");

      // Moving the same primitive items must move their existing rows rather
      // than invoking the component again and resetting its local state.
      const numberList = host.querySelector("ul");
      expect(numberList).not.toBeNull();

      const rowsBefore = [...host.querySelectorAll("li")];
      expect(rowsBefore.map((row) => row.textContent)).toEqual([
        "Toggle 10",
        "Toggle 21",
        "Toggle 32",
        "Toggle 43",
      ]);

      expect(updatePrimitiveList).toBeTypeOf("function");
      updatePrimitiveList!();
      expect(componentCalls).toBe(4);
      expect(fourthButton!.isConnected).toBe(true);
      expect(fourthButton!.getAttribute("aria-expanded")).toBe("true");
      expect(host.querySelector("ul")?.textContent).toBe("Toggle 40Toggle 31Toggle 22Toggle 13");
    } finally {
      unmount();
    }
  });

  it("renders the current async store array length during SSR", async () => {
    const rendered = await renderToServer(
      () => {
        const pokedex = $store(async () => ({
          results: Array.from({ length: 10 }, (_, index) => ({
            name: `pokemon-${index}`,
            url: `/pokemon/${index}`,
          })),
        }));

        return (
          <Await fallback={<p>Loading</p>}>
            <ul>
              {pokedex.results.map(({ name, url }, index) => (
                <Row name={name} url={url} />
              ))}
            </ul>
          </Await>
        );
      },
      "async",
    );

    expect(rendered.body.match(/<li/g)).toHaveLength(10);
    expect(rendered.body).toContain("pokemon-9");
    expect(rendered.body).not.toContain("undefined");
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
