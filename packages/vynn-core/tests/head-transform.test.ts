import { describe, expect, it } from "vitest";

import { transformVynnOxc } from "../../vite-plugin/src/plugins/jsx-transpiler";

describe("JSX document metadata lowering", () => {
  it("lowers title, meta, and link into metadata registrations", () => {
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

    expect(code).toContain('_$registerHead("title", () =>');
    expect(code).toContain('_$registerHead("meta", () =>');
    expect(code).toContain('_$registerHead("link", () =>');
    expect(code).toContain("get children()");
    expect(code).not.toContain("$headTmpl");
    expect(code).not.toContain("$tmpl");
  });

  it("returns no DOM nodes for hoisted head JSX", () => {
    const code = transformVynnOxc(
      `function Page() {
        return <title>Profile</title>;
      }`,
      "page.tsx",
    );

    expect(code).toMatch(/\$registerHead\("title",\s*\(\)\s*=>/);
    expect(code).toMatch(/return \[\];/);
  });

  it("keeps reactive attributes inside the head descriptor getter", () => {
    const code = transformVynnOxc(
      `function Page(props) {
        return <meta name="description" content={props.description} />;
      }`,
      "page.tsx",
    );

    expect(code).toContain('_$registerHead("meta", () =>');
    expect(code).toContain("get content()");
    expect(code).not.toContain("$attr");
  });

  it("compiles a complete document into one template", () => {
    const code = transformVynnOxc(
      `export default function Document() {
        return (
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Solid App</title>
            </head>
            <body>
              <h1>Hello Vynn!</h1>
            </body>
          </html>
        );
      }`,
      "document.tsx",
    );

    expect(code).toContain(
      '_$template("<html lang=\\"en\\"><head><meta charset=\\"utf-8\\"><title>Solid App</title></head><body><h1>Hello Vynn!</h1></body></html>")',
    );
    expect(code).not.toContain('_$template("<head></head>")');
    expect(code).not.toContain('_$template("<body></body>")');
    expect(code).not.toContain('_$registerHead("title"');
    expect(code).not.toContain('_$registerHead("meta"');
  });

  it("binds the complete reactive title as one text value inside the document template", () => {
    const code = transformVynnOxc(
      `function Document(props) {
        return (
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Vynn {props.title}</title>
            </head>
            <body>
              <main>{props.children}</main>
            </body>
          </html>
        );
      }`,
      "document.tsx",
    );

    expect(code).toContain(
      '_$template("<html lang=\\"en\\"><head><meta charset=\\"utf-8\\"><title></title></head><body><main><!--vynn:slot:0--></main></body></html>")',
    );
    expect(code).toContain('() => ["Vynn ", props.title]');
    expect(code).toContain("_$child(");
    expect(code).toContain("_$sibling(");
    expect(code).toContain("_$insert(");
    expect(code).not.toContain("vynn:slot:start-");
    expect(code).not.toContain('_$registerHead("title"');
    expect(code).not.toContain('_$registerHead("meta"');
  });

  it("lowers a nested head into an atomic metadata group", () => {
    const code = transformVynnOxc(
      `function Page() {
        return (
          <div>
            <head>
              <meta property="og:title" content="Page" />
              <meta property="og:image" content="/first.jpg" />
              <meta property="og:image" content="/second.jpg" />
            </head>
            <h1>Page</h1>
          </div>
        );
      }`,
      "page.tsx",
    );

    expect(code).toContain("_$registerHeadGroup(() => [");
    expect(code).toContain('_$registerHead("meta", () =>');
    expect(code).not.toContain('_$template("<head></head>")');
    expect(code).not.toContain("_$head(");
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

    expect(code).not.toContain('_$registerHead("meta"');
    expect(code).not.toContain('_$registerHead("title"');
    expect(code).toContain('itemprop="name"');
    expect(code).toContain("<svg><title>Chart title</title></svg>");
    expect(code).not.toContain("$tmpl");
  });
});
