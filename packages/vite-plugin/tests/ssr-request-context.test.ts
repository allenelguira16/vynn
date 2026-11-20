import { describe, expect, it } from "vitest";

import {
  createAuthoredServerEntry,
  createServerEntry,
  createSsrHandlerCode,
} from "../src/plugins/app/documents.ts";

describe("SSR request context integration", () => {
  it("forwards the request into generated renderToServer entries", () => {
    const entry = createServerEntry("/src/App.tsx", "stream");

    expect(entry).toContain("export function render(url, request)");
    expect(entry).toContain('renderToServerString(() => App({ url }), "stream", request)');
  });

  it("passes the request to authored server entries", () => {
    const entry = createAuthoredServerEntry("/src/entry-server.ts", "async");

    expect(entry).toContain("render(url, request)");
    expect(entry).toContain('serverModule.render(url, "async", request)');
  });

  it("forwards SSR response metadata and keeps the request available to render", () => {
    const handler = createSsrHandlerCode({
      clientEntryUrl: "/src/client.ts",
      css: [],
      base: "/",
      dev: true,
      serverFunctions: true,
      ssrManifest: null,
    });

    expect(handler).toContain("render(url.pathname + url.search, request)");
    expect(handler).toContain("handleServerFunctionRequest(request)");
    expect(handler).toContain("rendered.response?.headers");
    expect(handler).toContain("rendered.response?.status ?? 200");
    expect(handler).toContain("headers: responseHeaders");
  });

  it("uses Vite manifest assets and collected development styles", () => {
    const handler = createSsrHandlerCode({
      clientEntryUrl: "/src/client.ts",
      css: ["assets/app.css"],
      base: "/",
      dev: true,
      serverFunctions: false,
      ssrManifest: null,
      devCssLinks: [{ url: "/src/main.css", id: "/src/main.css" }],
    });

    expect(handler).toContain('const CSS_ASSETS = ["assets/app.css"];');
    expect(handler).toContain(
      'const DEV_CSS_LINKS = [{"url":"/src/main.css","id":"/src/main.css"}];',
    );
    expect(handler).toContain("renderDevCssLinks(DEV_CSS_LINKS)");
    expect(handler).not.toContain("?assets=client");
    expect(handler).not.toContain("?assets=ssr");
  });

});
