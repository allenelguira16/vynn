import { describe, expect, it } from "vitest";

import { reconcileHeadMarkup } from "../src/plugins/app/documents.ts";

describe("SSR document head reconciliation", () => {
  it("replaces route metadata in the authored head position", () => {
    const existing = [
      '<meta charset="UTF-8">',
      "<title>Vynn documentation</title>",
      '<link rel="icon" href="/vynn-logo.webp">',
      '<meta name="description" content="Documentation">',
      '<meta property="og:title" content="Vynn documentation">',
    ].join("");

    const incoming = '<title key="title">Quick start | Vynn</title>';
    const result = reconcileHeadMarkup(existing, incoming);

    expect(result.indexOf('<title key="title">Quick start | Vynn</title>')).toBeLessThan(
      result.indexOf('<link rel="icon"'),
    );
    expect(result.indexOf('<link rel="icon"')).toBeLessThan(
      result.indexOf('<meta name="description"'),
    );
    expect(result.indexOf('<meta name="description"')).toBeLessThan(
      result.indexOf('<meta property="og:title"'),
    );
    expect(result).toContain(
      '<template data-vynn-head-fallback><title>Vynn documentation</title></template>',
    );
  });

  it("keeps unmatched authored metadata in place and appends new entries", () => {
    const existing = [
      '<meta charset="UTF-8">',
      '<link rel="icon" href="/vynn-logo.webp">',
      '<meta name="description" content="Documentation">',
    ].join("");

    const incoming = '<title key="title">Quick start | Vynn</title>';
    const result = reconcileHeadMarkup(existing, incoming);

    expect(result.indexOf('<link rel="icon"')).toBeLessThan(
      result.indexOf('<meta name="description"'),
    );
    expect(result.indexOf('<meta name="description"')).toBeLessThan(
      result.indexOf('<title key="title">Quick start | Vynn</title>'),
    );
  });

  it("replaces a head identity in place and preserves its original value", () => {
    const existing = [
      '<meta charset="UTF-8">',
      '<meta name="description" content="Default description">',
      '<link rel="icon" href="/vynn-logo.webp">',
    ].join("");

    const incoming = '<meta name="description" content="Route description" key="meta:name:description">';
    const result = reconcileHeadMarkup(existing, incoming);

    expect(result.indexOf('content="Route description"')).toBeLessThan(
      result.indexOf('<link rel="icon"'),
    );
    expect(result).toContain(
      '<template data-vynn-head-fallback><meta name="description" content="Default description"></template>',
    );
  });
});
