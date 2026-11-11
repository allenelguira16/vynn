import { describe, expect, it } from "vitest";

import { transformVynnOxc, transformVynnOxcWithMap } from "../src/index.ts";

describe("Vynn Oxc JSX compiler", () => {
  it("preserves dollar-prefixed runtime helper names in generated aliases", () => {
    const code = transformVynnOxc(
      `function Greeting(props: { name: string }) {
        return <h1>Hello {props.name}</h1>;
      }`,
      "greeting.tsx",
    );

    expect(code).toContain("$cmpnt as _$cmpnt");
    expect(code).toContain("$tmpl as _$tmpl");
    expect(code).toContain("$txt as _$txt");
    expect(code).toContain("$insert as _$insert");
    expect(code).toContain("_$cmpnt(function Greeting");
    expect(code).not.toContain("$cmpnt as _cmpnt");
  });

  it("preserves whitespace between an inline element and following text", () => {
    const code = transformVynnOxc(
      `function Intro() {
        return (
          <p>
            <strong>Vynn</strong> is a TypeScript UI framework for building reactive web applications
            with JSX. It combines familiar component composition with fine-grained reactivity,
            updating the DOM directly when the values it depends on change.
          </p>
        );
      }`,
      "intro.tsx",
    );

    expect(code).toContain('_txt(" is a TypeScript UI framework');
  });

  it("wraps function components whose returns are nested in conditional branches", () => {
    const code = transformVynnOxc(
      `function Status(props: { loading: boolean }) {
        if (props.loading) {
          return <div />;
        } else {
          return <section />;
        }
      }`,
      "status.tsx",
    );

    expect(code).toContain("_$cmpnt(function Status");
    expect(code).toContain('_$tmpl("div")');
    expect(code).toContain('_$tmpl("section")');
  });

  it("wraps function components whose returns are nested in switch cases", () => {
    const code = transformVynnOxc(
      `function Status(props: { kind: string }) {
        switch (props.kind) {
          case "loading":
            return <strong />;
          default:
            return <em />;
        }
      }`,
      "status.tsx",
    );

    expect(code).toContain("_$cmpnt(function Status");
    expect(code).toContain('_$tmpl("strong")');
    expect(code).toContain('_$tmpl("em")');
  });

  it("wraps PascalCase function-expression component variables", () => {
    const code = transformVynnOxc(
      `const Button = function (props: { label: string }) {
        if (!props.label) return <span />;
        return <button>{props.label}</button>;
      };`,
      "button.tsx",
    );

    expect(code).toContain("const Button = _$cmpnt(function Button");
    expect(code).toContain('_$tmpl("span")');
    expect(code).toContain('_$tmpl("button")');
  });

  it("wraps anonymous default function declarations", () => {
    const code = transformVynnOxc(
      `export default function () {
        return <main>Anonymous</main>;
      }`,
      "app.tsx",
    );

    expect(code).toMatch(/export default _$cmpnt\(function\s*\(/);
    expect(code).toContain('_$tmpl("main")');
  });

  it("wraps anonymous default arrow components", () => {
    const code = transformVynnOxc(`export default () => <main>Anonymous</main>;`, "app.tsx");

    expect(code).toMatch(/export default _$cmpnt\(function\s*\(/);
    expect(code).toContain('_$tmpl("main")');
  });

  it("lowers JSX returned from nested named map callbacks", () => {
    const code = transformVynnOxc(
      `function renderItem(item: string, index: number) {
        if (item) return <li>{index}: {item}</li>;
        return <li>empty</li>;
      }

      function List(props: { items: string[] }) {
        return <ul>{props.items.map(renderItem)}</ul>;
      }`,
      "list.tsx",
    );

    expect(code).toContain("_$for(");
    expect(code).toContain("_renderItemFor");
  });

  it("preserves Array.map thisArg when lowering a JSX callback", () => {
    const code = transformVynnOxc(
      `const items = ["a"];
      const context = { prefix: "item:" };
      function List() {
        return <ul>{items.map(function (item, index) {
          return <li>{this.prefix} {index} {item}</li>;
        }, context)}</ul>;
      }`,
      "list.tsx",
    );

    expect(code).toContain("_$for(");
    expect(code).toContain(".bind(context)");
  });

  it("preserves namespaced JSX attributes", () => {
    const code = transformVynnOxc(
      `function Icon() {
        return <svg><use xlink:href="#symbol" /></svg>;
      }`,
      "icon.tsx",
    );

    expect(code).toContain('"xlink:href"');
    expect(code).toContain('"#symbol"');
  });

  it("lowers capture-phase event handlers to native capture listeners", () => {
    const code = transformVynnOxc(
      `function Button() {
        return <button onClickCapture={handleClick} onDoubleClick={handleDoubleClick} />;
      }`,
      "button.tsx",
    );

    expect(code).toContain('"click", handleClick, true');
    expect(code).toContain('"dblclick", handleDoubleClick');
  });

  it("reports namespaced JSX tag names instead of failing with an opaque error", () => {
    expect(() => transformVynnOxc(`function Icon() { return <svg:path />; }`, "icon.tsx")).toThrow(
      "does not support namespaced JSX tag names",
    );
  });

  it("preserves ordinary source comments while lowering JSX wrappers", () => {
    const code = transformVynnOxc(
      `// keep this source comment
      function Page() {
        return (
          <main>
            <p>Content</p>
          </main>
        );
      }`,
      "page.tsx",
    );

    expect(code).toContain("keep this source comment");
    expect(code).toContain("_$cmpnt(function Page");
  });

  it("discards comments inside empty JSX expression containers", () => {
    const code = transformVynnOxc(
      `function Page() {
        return (
          <main>
            {/* JSX-only comment */}
            <p>Content</p>
          </main>
        );
      }`,
      "page.tsx",
    );

    expect(code).not.toContain("JSX-only comment");
    expect(code).toContain("_$cmpnt(function Page");
  });
});

describe("Vynn compiler output", () => {
  it("returns a source map for transformed JSX", () => {
    const result = transformVynnOxcWithMap(
      "function Page() { return <main>Content</main>; }",
      "page.tsx",
    );

    expect(result.code).toContain("_$tmpl");
    expect(result.map).toMatchObject({
      version: expect.any(Number),
      sources: expect.any(Array),
      names: expect.any(Array),
      mappings: expect.any(String),
    });
  });

  it("returns the original source when no JSX is present", () => {
    const source = "export const answer: number = 42;";
    expect(transformVynnOxcWithMap(source, "answer.ts")).toEqual({
      code: source,
      map: null,
    });
  });
});
