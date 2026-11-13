import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import { vynnAppPlugin } from "../../vite-plugin/src/plugins/app.ts";
import {
  createAuthoredServerEntry,
  createClientShell,
  createServerEntry,
  createSsrHandlerCode,
} from "../../vite-plugin/src/plugins/app/documents.ts";
import { ErrorBoundary } from "../src/components/error-boundary";
import { lazy } from "../src/components/lazy";
import { registerSsrModule } from "../src/context/ssr-module-context";
import {
  getErrorBoundary,
  getErrorBoundaryContext,
} from "../src/context/error-boundary-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../src/life-cycle/owner";
import { $head, $headTmpl } from "../src/render/$head";
import { $cmpnt } from "../src/render/$cmpnt";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import {
  createSSRAsync,
  createSSRComment,
  createSSRDeferred,
  createSSRNode,
  createSSRText,
  SSR_ASYNC,
  SSR_COMMENT,
  SSR_DEFERRED,
  SSR_ELEMENT,
  SSR_NODE,
  SSR_PENDING,
  SSR_TEXT,
} from "../src/render/resolve-node";
import { renderToServer } from "../src/server/render-to-server";

describe("renderToServer modes", () => {
  it("uses SSR node classes with consistent parent tracking", () => {
    const element = createSSRNode("div");
    const text = createSSRText("content");
    const comment = createSSRComment("marker");
    const asyncNode = createSSRAsync(() => [], () => [], []);
    const deferredNode = createSSRDeferred(() => [], []);

    expect(element).toBeInstanceOf(SSR_NODE);
    expect(element).toBeInstanceOf(SSR_ELEMENT);
    expect(text).toBeInstanceOf(SSR_NODE);
    expect(text).toBeInstanceOf(SSR_TEXT);
    expect(comment).toBeInstanceOf(SSR_NODE);
    expect(comment).toBeInstanceOf(SSR_COMMENT);
    expect(asyncNode).toBeInstanceOf(SSR_NODE);
    expect(asyncNode).toBeInstanceOf(SSR_PENDING);
    expect(asyncNode).toBeInstanceOf(SSR_ASYNC);
    expect(deferredNode).toBeInstanceOf(SSR_NODE);
    expect(deferredNode).toBeInstanceOf(SSR_PENDING);
    expect(deferredNode).toBeInstanceOf(SSR_DEFERRED);

    element.appendChild(text);
    element.appendChild(comment);
    element.insertBefore(comment, text);

    expect(element.children).toEqual([comment, text]);
    expect(comment.parent).toBe(element);
    expect(text.parent).toBe(element);

    element.removeChild(comment);

    expect(comment.parent).toBeNull();
    expect(element.children).toEqual([text]);
  });

  it("does not override output configuration for a standalone server-functions build", async () => {
    const plugin = vynnAppPlugin({
      ssr: false,
      ssrMode: "stream",
    });
    const configHook = plugin.config;

    if (typeof configHook !== "function") {
      throw new Error("Expected the Vynn app plugin to expose a config hook.");
    }

    const result = await configHook.call(
      {} as never,
      { root: process.cwd() } as never,
      {
        mode: "production",
        command: "build",
        isSsrBuild: true,
      } as never,
    );

    expect(result).toBeNull();
  });

  it("returns an explicit render result in sync mode", () => {
    const rendered = renderToServer(
      () => createSSRText("Synchronous content") as unknown as JSX.Element,
      "sync",
    );

    expect(rendered.body).toContain("Synchronous content");
    expect(rendered.head.render()).toBe("");
    expect(rendered.modules.size).toBe(0);
  });

  it("catches synchronous lazy-child errors in sync SSR mode", () => {
    const rendered = renderToServer(
      () =>
        ErrorBoundary({
          children: (() => {
            throw new Error("synchronous child failed");
          }) as unknown as JSX.Element,
          fallback: (error) => `Caught: ${error.message}`,
        }),
      "sync",
    );

    expect(rendered.body).toContain("Caught: synchronous child failed");
    expect(rendered.body).toContain("<!--eb:0-->");
    expect(rendered.body).toContain("<!--/eb:0-->");
  });

  it("renders an async boundary fallback without waiting in sync mode", () => {
    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [createSSRText("Loading")],
          () => [createSSRText("Resolved")],
          [Promise.resolve()],
        ) as unknown as JSX.Element,
      "sync",
    );

    expect(rendered.body).toContain("Loading");
    expect(rendered.body).not.toContain("Resolved");
  });

  it("returns head and lazy-module metadata alongside the body", () => {
    const rendered = renderToServer(() => {
      registerSsrModule("src/pages/synchronous.tsx");

      const title = $headTmpl("title");
      $insert(title, $txt("Synchronous page"));
      $head(title);

      return "Body";
    }, "sync");

    expect(rendered.body).toContain("Body");
    expect(rendered.head.render()).toContain('<title key="title">Synchronous page</title>');
    expect([...rendered.modules]).toEqual(["src/pages/synchronous.tsx"]);
  });

  it("registers the handler and SSR descriptor through one error boundary context", () => {
    const errors: Error[] = [];
    const handler = (error: Error) => errors.push(error);
    let registeredHandler: typeof handler | undefined;
    let registeredSsrBoundary: unknown;

    const rendered = renderToServer(() => {
      const boundary = createSSRErrorBoundary(
        0,
        () => [],
        () => [],
        handler,
      );

      registeredHandler = getErrorBoundary();
      registeredSsrBoundary = getErrorBoundaryContext()?.ssrBoundary;
      registeredHandler?.(new Error("unified handler"));

      return boundary as unknown as JSX.Element;
    }, "sync");

    expect(registeredHandler).toBeTypeOf("function");
    expect(registeredSsrBoundary).toBeDefined();
    expect((registeredSsrBoundary as { hasError?: boolean }).hasError).toBe(true);
    expect(errors.map((error) => error.message)).toEqual(["unified handler"]);
    expect(rendered.body).toContain("<!--eb:0-->");
    expect(rendered.body).toContain("<!--/eb:0-->");
  });

  it("creates an independent root Owner instead of reusing the caller Owner", () => {
    const parent = createOwner();
    let renderOwner!: ReturnType<typeof getOwner>;

    const rendered = runWithOwner(parent, () =>
      renderToServer(() => {
        renderOwner = getOwner()!;
        return "Independent render";
      }, "sync"),
    );

    expect(rendered.body).toContain("Independent render");
    expect(renderOwner).not.toBe(parent);
    expect(renderOwner?.parent).toBeNull();
    expect(renderOwner?.disposed).toBe(true);
    expect(parent.children).toHaveLength(0);

    disposeOwner(parent);
  });

  it("does not attach the render Owner to a nested caller Owner", () => {
    const root = createOwner();
    let child!: NonNullable<ReturnType<typeof getOwner>>;
    let renderOwner!: NonNullable<ReturnType<typeof getOwner>>;

    runWithOwner(root, () => {
      child = createOwner();
    });

    const rendered = runWithOwner(child, () =>
      renderToServer(() => {
        renderOwner = getOwner()!;
        return "Nested caller";
      }, "sync"),
    );

    expect(rendered.body).toContain("Nested caller");
    expect(renderOwner).not.toBe(child);
    expect(renderOwner.parent).toBeNull();
    expect(renderOwner.disposed).toBe(true);
    expect(child.parent).toBe(root);
    expect(child.disposed).not.toBe(true);

    disposeOwner(root);
  });

  it("returns a promise containing the render result in async mode", () => {
    const rendered = renderToServer(() => "Async content", "async");
    expect(rendered).toBeInstanceOf(Promise);
    return expect(rendered).resolves.toMatchObject({
      body: "Async content",
      modules: expect.any(Set),
    });
  });

  it("resolves new async lazy resources in async SSR mode", async () => {
    const LazyPage = lazy(
      () => Promise.resolve({ Page: () => "Loaded lazy page" }),
      "Page",
    );

    const rendered = await renderToServer(
      () => LazyPage(undefined as never),
      "async",
    );

    expect(rendered.body).toContain("Loaded lazy page");
  });

  it("resolves new async lazy resources in streaming SSR mode", async () => {
    const LazyPage = lazy(
      () => Promise.resolve({ Page: () => "Loaded lazy page" }),
      "Page",
    );

    const rendered = renderToServer(
      () => LazyPage(undefined as never),
      "stream",
    );

    const reader = rendered.body.getReader();
    const chunks: string[] = [];

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(new TextDecoder().decode(result.value));
    }

    expect(chunks.join("")).toContain("Loaded lazy page");
  });

  it("does not fail a retry for a rejected resource the child no longer reads", async () => {
    const rendered = await renderToServer(
      () =>
        createSSRAsync(
          () => [createSSRText("Loading")],
          () => [createSSRText("The resource is no longer needed")],
          [Promise.reject(new Error("stale resource failure"))],
        ) as unknown as JSX.Element,
      "async",
    );

    expect(rendered.body).toContain("The resource is no longer needed");
    expect(rendered.body).not.toContain("stale resource failure");
  });


  it("restores each streamed async boundary's component owner after its promise settles", async () => {
    const owners: NonNullable<ReturnType<typeof getOwner>>[] = [];
    const ownerParents: (NonNullable<ReturnType<typeof getOwner>> | null)[] = [];
    let renderOwner: NonNullable<ReturnType<typeof getOwner>> | undefined;

    function createAsyncComponent(label: string) {
      return $cmpnt(() => {
        const componentOwner = getOwner();

        return createSSRAsync(
          () => [createSSRText(`Loading ${label}`)],
          () => {
            expect(getOwner()).toBe(componentOwner);
            owners.push(getOwner()!);
            ownerParents.push(getOwner()!.parent);
            return [createSSRText(`Resolved ${label}`)];
          },
          [Promise.resolve()],
        ) as unknown as JSX.Element;
      });
    }

    const First = createAsyncComponent("first");
    const Second = createAsyncComponent("second");

    const rendered = renderToServer(() => {
      renderOwner = getOwner()!;
      return [First(), Second()];
    }, "stream");

    const reader = rendered.body.getReader();
    const chunks: string[] = [];

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(new TextDecoder().decode(result.value));
    }

    expect(chunks.join("")).toContain("Resolved first");
    expect(chunks.join("")).toContain("Resolved second");
    expect(owners).toHaveLength(2);
    expect(owners[0]).not.toBe(owners[1]);
    expect(ownerParents[0]).toBe(renderOwner);
    expect(ownerParents[1]).toBe(renderOwner);
  });

  it("handles async render failures within an ErrorBoundary", async () => {
    const rendered = await renderToServer(
      () =>
        ErrorBoundary({
          children: (() =>
            createSSRAsync(
              () => [createSSRText("Loading")],
              () => {
                throw new Error("async render failed");
              },
              [Promise.reject(new Error("async render failed"))],
            )) as unknown as JSX.Element,
          fallback: (error) => `Caught: ${error.message}`,
        }),
      "async",
    );

    expect(rendered.body).toContain("Caught: async render failed");
    expect(rendered.body).toContain("$EBD");
  });

  it("routes guarded child render errors to ErrorBoundary after the guard resolves", async () => {
    const rendered = await renderToServer(
      () =>
        ErrorBoundary({
          children: (() =>
            createSSRDeferred(
              () => {
                throw new Error("guarded child render failed");
              },
              [Promise.resolve()],
              true,
            )) as unknown as JSX.Element,
          fallback: (error) => `Caught: ${error.message}`,
        }),
      "async",
    );

    expect(rendered.body).toContain("Caught: guarded child render failed");
    expect(rendered.body).toContain("$EBD");
  });

  it("patches an enclosing ErrorBoundary when streamed async work rejects", async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });

    const rendered = renderToServer(
      () =>
        ErrorBoundary({
          children: (() =>
            createSSRAsync(
              () => [createSSRText("Loading")],
              () => {
                throw new Error("resource failed");
              },
              [pending],
            )) as unknown as JSX.Element,
          fallback: (error) => `Caught: ${error.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const initial = await reader.read();
    expect(initial.done).toBe(false);

    const initialHTML = new TextDecoder().decode(initial.value);
    expect(initialHTML).toContain("Loading");
    expect(initialHTML).toContain("<!--eb:0-->");

    reject(new Error("resource failed"));

    const patches: string[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      patches.push(new TextDecoder().decode(result.value));
    }

    const patchHTML = patches.join("");
    expect(patchHTML).toContain('template id="vynn-eb-0"');
    expect(patchHTML).toContain("$AEBP(0)");
    expect(patchHTML).toContain("Caught: resource failed");
  });


  it("does not emit sibling async patches after an ErrorBoundary has failed", async () => {
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: () => void;

    const first = new Promise<void>((_resolve, rejectPromise) => {
      rejectFirst = rejectPromise;
    });
    const second = new Promise<void>((resolvePromise) => {
      resolveSecond = resolvePromise;
    });

    const rendered = renderToServer(
      () =>
        ErrorBoundary({
          children: (() => [
            createSSRAsync(
              () => [createSSRText("First loading")],
              () => [createSSRText("First resolved")],
              [first],
            ),
            createSSRAsync(
              () => [createSSRText("Second loading")],
              () => [createSSRText("Second resolved")],
              [second],
            ),
          ]) as unknown as JSX.Element,
          fallback: (error) => `Caught: ${error.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const initial = await reader.read();
    expect(new TextDecoder().decode(initial.value)).toContain("First loading");

    rejectFirst(new Error("first resource failed"));

    const boundaryPatch = await reader.read();
    const chunks = [new TextDecoder().decode(boundaryPatch.value)];

    resolveSecond();

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(new TextDecoder().decode(result.value));
    }

    const patchHTML = chunks.join("");
    expect(patchHTML).toContain('template id="vynn-eb-0"');
    expect(patchHTML).toContain("Caught: first resource failed");
    expect(patchHTML).not.toContain('template id="1"');
    expect(patchHTML).not.toContain("Second resolved");
  });

  it("patches the nearest nested ErrorBoundary instead of its parent", async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });

    const rendered = renderToServer(
      () =>
        ErrorBoundary({
          children: (() =>
            ErrorBoundary({
              children: (() =>
                createSSRAsync(
                  () => [createSSRText("Nested loading")],
                  () => {
                    throw new Error("nested resource failed");
                  },
                  [pending],
                )) as unknown as JSX.Element,
              fallback: (error) => `Inner: ${error.message}`,
            })) as unknown as JSX.Element,
          fallback: (error) => `Outer: ${error.message}`,
        }),
      "stream",
    );

    const reader = rendered.body.getReader();
    const initial = await reader.read();
    const initialHTML = new TextDecoder().decode(initial.value);

    expect(initialHTML).toContain("<!--eb:0-->");
    expect(initialHTML).toContain("<!--eb:1-->");
    expect(initialHTML).toContain("Nested loading");

    reject(new Error("nested resource failed"));

    const patches: string[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      patches.push(new TextDecoder().decode(result.value));
    }

    const patchHTML = patches.join("");
    expect(patchHTML).toContain('template id="vynn-eb-1"');
    expect(patchHTML).toContain("Inner: nested resource failed");
    expect(patchHTML).not.toContain("Outer: nested resource failed");
  });

  it("errors the stream when async work rejects without an ErrorBoundary", async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });

    const rendered = renderToServer(
      () =>
        createSSRAsync(
          () => [createSSRText("Loading")],
          () => {
            throw new Error("unhandled resource failure");
          },
          [pending],
        ) as unknown as JSX.Element,
      "stream",
    );

    const reader = rendered.body.getReader();
    const initial = await reader.read();
    expect(initial.done).toBe(false);

    reject(new Error("unhandled resource failure"));

    await expect(reader.read()).rejects.toThrow("unhandled resource failure");
  });

  it("keeps blocking deferred failures outside ErrorBoundary recovery", async () => {
    let reject!: (reason: Response) => void;
    const pending = new Promise<never>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "/login" },
    });

    const rendered = renderToServer(
      () =>
        createSSRDeferred(
          () => [createSSRText("Guarded content")],
          [pending],
          true,
        ) as unknown as JSX.Element,
      "stream",
    );

    const reader = rendered.body.getReader();
    const read = reader.read();
    reject(redirect);

    await expect(read).rejects.toBe(redirect);
  });

  it("returns the readable stream inside the render result in stream mode", () => {
    const rendered = renderToServer(() => "Stream content", "stream");
    expect(rendered.body).toBeInstanceOf(ReadableStream);
  });

  it("uses the configured SSR mode in generated server entries", () => {
    const syncEntry = createServerEntry("/src/App.tsx", "sync");
    const asyncEntry = createServerEntry("/src/App.tsx", "async");
    const defaultEntry = createServerEntry("/src/App.tsx");

    expect(syncEntry).toContain('renderToServer(() => App({ url }), "sync")');
    expect(asyncEntry).toContain('renderToServer(() => App({ url }), "async")');
    expect(defaultEntry).toContain('renderToServer(() => App({ url }), "stream")');
  });

  it("passes the configured SSR mode to an authored server entry", () => {
    const entry = createAuthoredServerEntry("/src/entry-server.ts", "async");

    expect(entry).toContain('serverModule.render(url, "async")');
    expect(entry).toContain("render(url)");
  });

  it("generates an app handler that consumes explicit SSR render metadata", () => {
    const entry = createAuthoredServerEntry("/src/entry-server.ts");
    const handler = createSsrHandlerCode({
      clientEntryUrl: "/assets/client.js",
      css: [],
      base: "/",
      dev: false,
      serverFunctions: false,
      ssrManifest: null,
    });

    expect(entry).toContain(
      'export function render(url) { return serverModule.render(url, "stream"); }',
    );
    expect(entry).not.toContain("scope");
    expect(handler).not.toContain("runWithSsrContext");
    expect(handler).toContain("await render(url.pathname + url.search)");
    expect(handler).toContain("rendered.head.render()");
    expect(handler).toContain("rendered.modules");
    expect(handler).toContain("vynn:internal:start");
    expect(handler).toContain("vynn:internal:end");
    expect(handler).not.toContain("_$int");
  });

  it("generates CSR shell resources without SSR range markers", () => {
    const productionShell = createClientShell({
      base: "/",
      clientEntryUrl: "/assets/client.js",
      css: ["assets/app.css"],
      dev: false,
    });
    const developmentShell = createClientShell({
      base: "/",
      clientEntryUrl: "/src/client.ts",
      dev: true,
    });

    expect(productionShell).toContain('<link rel="stylesheet" href="/assets/app.css">');
    expect(productionShell).toContain('<script type="module" src="/assets/client.js"></script>');
    expect(developmentShell).toContain('<script type="module" src="/@vite/client"></script>');
    expect(productionShell).not.toContain("vynn:internal:");
    expect(developmentShell).not.toContain("vynn:internal:");
    expect(productionShell).not.toContain("_$int");
    expect(developmentShell).not.toContain("_$int");
  });
});
