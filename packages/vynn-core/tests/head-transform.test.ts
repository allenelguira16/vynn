import { describe, expect, it } from "vitest";
import { transformVynnOxc } from "../../vite-plugin/src/plugins/jsx-transpiler";

describe("JSX document metadata lowering", () => {
  it("lowers title, meta, and link into the head runtime", () => {
    const code = transformVynnOxc(
      `function Page() {
        return <>
          <title>Profile</title>
          <meta name="description" content="Profile page" />
          <meta property="og:title" content="Profile" />
          <link rel="canonical" href="https://example.com/profile" />
        </>;
      }`,
      "page.tsx",
    );

    expect(code).toContain('_headTmpl("title", "title")');
    expect(code).toContain('_headTmpl("meta", "meta:name:description")');
    expect(code).toContain('_headTmpl("meta", "meta:property:og:title")');
    expect(code).toContain('_headTmpl("link", "link:canonical")');
    expect(code).toContain("_head(");
  });

  it("returns no DOM nodes from hoisted head JSX", () => {
    const code = transformVynnOxc(
      `function Page() {
        return <title>Profile</title>;
      }`,
      "page.tsx",
    );

    expect(code).toMatch(/_head\(el\d+\);\s*return \[\];/);
  });

  it("does not hoist microdata elements or SVG titles", () => {
    const code = transformVynnOxc(
      `function Chart() {
        return <>
          <meta itemProp="name" content="Local microdata" />
          <svg><title>Chart title</title></svg>
        </>;
      }`,
      "chart.tsx",
    );

    expect(code).not.toContain('_headTmpl("meta"');
    expect(code).not.toContain('_headTmpl("title"');
    expect(code).toContain('_tmpl("meta")');
    expect(code).toContain('_tmpl("title")');
  });
});
