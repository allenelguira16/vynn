import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { Await } from "../src/components/await";
import { Catch } from "../src/components/catch";
import { getLazyID, initializeLazyScope } from "../src/context/lazy-context";
import { $state } from "../src/reactivity/state";
import { $insert } from "../src/render/$insert";
import { $template } from "../src/render/$template";
import { renderToServer } from "../src/server/render-to-server";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createAsyncCount(promise: Promise<void>, error: Error): JSX.Element {
  const count = $state<number>(async () => {
    await promise;
    throw error;
  });

  const paragraph = $template("<p></p>")();
  $insert(paragraph, () => count.value);

  return paragraph as unknown as JSX.Element;
}

describe("SSR async Catch", () => {
  it("catches an async $state rejection in streaming SSR without Await", async () => {
    const gate = deferred<void>();
    const error = new Error("ComponentWillThrowAfterAsync catched, please retry again");

    const rendered = renderToServer(
      () =>
        Catch({
          children: (() => createAsyncCount(gate.promise, error)) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const firstRead = reader.read();

    gate.reject(error);

    const first = await firstRead;
    expect(first.done).toBe(false);

    const decoder = new TextDecoder();
    const html = decoder.decode(first.value) + (await readStreamFromReader(reader, decoder));

    expect(html).toContain(`Caught: ${error.message}`);
    expect(html).toContain("<!--eb:0-->");
    expect(html).toContain("<!--/eb:0-->");
    expect(html).not.toContain('template id="0"');
  });

  it("streams the Await fallback and patches the enclosing Catch on rejection", async () => {
    const gate = deferred<void>();
    const error = new Error("async resource rejected inside Await");

    const rendered = renderToServer(
      () =>
        Catch({
          children: (() =>
            Await({
              fallback: "Loading",
              children: (() => createAsyncCount(gate.promise, error)) as unknown as JSX.Element,
            })) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const initial = await reader.read();

    expect(initial.done).toBe(false);

    const initialHTML = decoder.decode(initial.value);
    expect(initialHTML).toContain("Loading");
    expect(initialHTML).toContain("<!--eb:0-->");
    expect(initialHTML).toContain("<!--/eb:0-->");

    gate.reject(error);

    const patchHTML = await readStreamFromReader(reader, decoder);
    expect(patchHTML).toContain('template id="vynn-eb-0"');
    expect(patchHTML).toContain("$AEBP(0)");
    expect(patchHTML).toContain(`Caught: ${error.message}`);
  });

  it("catches an async $state created inside Await children in streaming SSR", async () => {
    const gate = deferred<void>();
    const error = new Error("async state failed inside Await children");

    const rendered = renderToServer(
      () =>
        Catch({
          children: (() =>
            Await({
              fallback: "Loading",
              children: (() => {
                const count = $state<number>(async () => {
                  await gate.promise;
                  throw error;
                });
                const paragraph = $template("<p></p>")();
                $insert(paragraph, () => count.value);
                return paragraph as unknown as JSX.Element;
              }) as unknown as JSX.Element,
            })) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();
    const initial = await reader.read();

    expect(initial.done).toBe(false);
    expect(decoder.decode(initial.value)).toContain("Loading");

    gate.reject(error);

    const patchHTML = await readStreamFromReader(reader, decoder);
    expect(patchHTML).toContain('template id="vynn-eb-0"');
    expect(patchHTML).toContain("$AEBP(0)");
    expect(patchHTML).toContain(`Caught: ${error.message}`);
  });

  it("catches an async $state rejection in async SSR", async () => {
    const error = new Error("async render mode resource failure");

    const rendered = await renderToServer(
      () =>
        Catch({
          children: (() =>
            createAsyncCount(
              Promise.resolve().then(() => {
                throw error;
              }),
              error,
            )) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
      "async",
    );

    expect(rendered.body).toContain(`Caught: ${error.message}`);
    expect(rendered.body).toContain("<!--eb:0-->");
    expect(rendered.body).toContain("<!--/eb:0-->");
  });
  it("serializes async ID reservations for an Catch fallback", async () => {
    const error = new Error("rejected resource before a sibling resource");

    const createValue = (value: string): JSX.Element => {
      const resource = $state(async () => value);
      const paragraph = $template("<p></p>")();
      $insert(paragraph, () => resource.value);
      return paragraph as unknown as JSX.Element;
    };

    const rendered = await renderToServer(
      () => [
        Catch({
          children: (() =>
            createAsyncCount(
              Promise.resolve().then(() => {
                throw error;
              }),
              error,
            )) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
        createValue("after boundary"),
      ],
      "async",
    );

    const hydrationData = rendered.body.match(
      /<script>\$AD=(.*?);\$EBD=(.*?);document\.currentScript\.remove\(\);<\/script>/,
    );

    expect(hydrationData).toBeDefined();

    const asyncValues = JSON.parse(hydrationData![1]) as Record<string, unknown>;
    const errorBoundaries = JSON.parse(hydrationData![2]) as Array<{
      status: string;
      ownerIDs?: Record<string, number>;
    }>;

    // The rejected resource correctly has no fulfilled value in $AD, but its
    // allocated numeric path is reserved so the following sibling keeps its index.
    expect(asyncValues).not.toHaveProperty("0.0.0");
    expect(asyncValues["0.1"]).toEqual(["string", "after boundary"]);
    expect(errorBoundaries[0]).toMatchObject({
      status: "fallback",
      ownerIDs: { "0.0": 1 },
    });
  });

  it("serializes lazy ID reservations when a boundary skips a lazy descendant", async () => {
    const error = new Error("failed before the lazy descendant finished rendering");

    const rendered = await renderToServer(
      () => [
        Catch({
          children: (() => {
            const lazyID = getLazyID();
            initializeLazyScope(lazyID);
            throw error;
          }) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
        getLazyID(),
      ],
      "async",
    );

    const hydrationData = rendered.body.match(
      /<script>\$AD=(.*?);\$EBD=(.*?);document\.currentScript\.remove\(\);<\/script>/,
    );

    expect(hydrationData).toBeDefined();

    const errorBoundaries = JSON.parse(hydrationData![2]) as Array<{
      status: string;
      lazyIDs?: Record<string, number>;
    }>;

    // The skipped child consumed lazy ID 0 on the server. The next sibling
    // therefore renders as ID 1, and hydration must preserve that cursor.
    expect(rendered.body).toContain("Caught: " + error.message);
    expect(rendered.body).toContain(">1<");
    expect(errorBoundaries[0]).toMatchObject({
      status: "fallback",
      lazyIDs: { "": 1 },
    });
  });

  it("keeps async hydration IDs in component traversal order around Catch", async () => {
    const createValue = (value: string): JSX.Element => {
      const resource = $state(async () => value);
      const paragraph = $template("<p></p>")();
      $insert(paragraph, () => resource.value);
      return paragraph as unknown as JSX.Element;
    };

    const rendered = await renderToServer(
      () => [
        Catch({
          children: (() => createValue("inside boundary")) as unknown as JSX.Element,
          fallback: (reason) => `Caught: ${reason.message}`,
        }),
        createValue("after boundary"),
      ],
      "async",
    );

    const asyncData = rendered.body.match(/<script>\$AD=(.*?);\$EBD=/)?.[1];

    expect(asyncData).toBeDefined();

    const values = JSON.parse(asyncData!) as Record<string, unknown>;

    // Async resources created inside the boundary must keep the IDs they
    // receive during normal component traversal, before following siblings.
    expect(values["000"]).toEqual(["string", "inside boundary"]);
    expect(values["01"]).toEqual(["string", "after boundary"]);
  });
});

async function readStreamFromReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): Promise<string> {
  const chunks: string[] = [];

  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(decoder.decode(result.value));
  }

  return chunks.join("");
}
