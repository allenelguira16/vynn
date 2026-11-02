import { describe, expect, it } from "vitest";

import type { JSX } from "../src/types/jsx";

import {
  createAuthoredServerEntry,
  createClientShell,
  createServerEntry,
  createSsrHandlerCode,
} from "../../vite-plugin/src/plugins/app/documents.ts";

import { registerSsrModule } from "../src/context/ssr-module-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../src/life-cycle/owner";
import { $head, $headTmpl } from "../src/render/$head";
import { $insert } from "../src/render/$insert";
import { $txt } from "../src/render/$txt";
import { createSSRAsync, createSSRText } from "../src/render/resolve-node";
import { renderToServer } from "../src/server/render-to-server";

describe("renderToServer modes", () => {
  it("returns an explicit render result in sync mode", () => {
    const rendered = renderToServer(
      () => createSSRText("Synchronous content") as unknown as JSX.Element,
      "sync",
    );

    expect(rendered.body).toContain("Synchronous content");
    expect(rendered.head.render()).toBe("");
    expect(rendered.modules.size).toBe(0);
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

  it("creates an independent root Owner instead of reusing the caller Owner", () => {
    const parent = createOwner();
    let renderOwner: ReturnType<typeof getOwner> = null;

    const rendered = runWithOwner(parent, () =>
      renderToServer(() => {
        renderOwner = getOwner();
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
    let child: ReturnType<typeof getOwner> = null;
    let renderOwner: ReturnType<typeof getOwner> = null;

    runWithOwner(root, () => {
      child = createOwner();
    });

    const rendered = runWithOwner(child, () =>
      renderToServer(() => {
        renderOwner = getOwner();
        return "Nested caller";
      }, "sync"),
    );

    expect(rendered.body).toContain("Nested caller");
    expect(renderOwner).not.toBe(child);
    expect(renderOwner?.parent).toBeNull();
    expect(renderOwner?.disposed).toBe(true);
    expect(child?.disposed).toBe(false);

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

  it("returns the readable stream inside the render result in stream mode", () => {
    const rendered = renderToServer(() => "Stream content", "stream");
    expect(rendered.body).toBeInstanceOf(ReadableStream);
  });

  it("uses the configured SSR mode in generated server entries", () => {
    const syncEntry = createServerEntry("/src/App.tsx", [], "sync");
    const asyncEntry = createServerEntry("/src/App.tsx", [], "async");
    const defaultEntry = createServerEntry("/src/App.tsx", []);

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

    expect(entry).toContain('export function render(url) { return serverModule.render(url, "stream"); }');
    expect(entry).not.toContain("scope");
    expect(handler).not.toContain("runWithSsrContext");
    expect(handler).toContain("await render(url.pathname + url.search)");
    expect(handler).toContain("rendered.head.render()");
    expect(handler).toContain("rendered.modules");
    expect(handler).toContain("vynn:internal:start");
    expect(handler).not.toContain("_$int");
  });

  it("wraps client shell resources without adding marker attributes", () => {
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

    expect(productionShell).toContain(
      '<!--vynn:internal:start--><link rel="stylesheet" href="/assets/app.css"><!--vynn:internal:end-->',
    );
    expect(productionShell).toContain(
      '<!--vynn:internal:start--><script type="module" src="/assets/client.js"></script><!--vynn:internal:end-->',
    );
    expect(developmentShell).toContain(
      '<!--vynn:internal:start--><script type="module" src="/@vite/client"></script><!--vynn:internal:end-->',
    );
    expect(productionShell).not.toContain("_$int");
    expect(developmentShell).not.toContain("_$int");
  });
});
