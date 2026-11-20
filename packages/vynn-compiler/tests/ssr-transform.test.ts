import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { transformVynnSsr } from "../src/ssr/index.ts";

function expectValidModule(code: string): void {
  const result = parseSync("generated.tsx", code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  expect(result.errors.filter((error) => error.severity === "Error")).toEqual([]);
}

describe("Vynn SSR string compiler", () => {
  it("lowers host elements into strings and escapes dynamic content", () => {
    const code = transformVynnSsr(
      `function Page(props: { name: string; busy: boolean }) {
        return (
          <main>
            <h1>Hello {props.name}</h1>
            <button disabled={props.busy}>Save</button>
          </main>
        );
      }`,
      "page.tsx",
    );

    expect(code).toContain('from "vynn/server/ssr"');
    expect(code).toContain("_vynnSsrText(() => props.name)");
    expect(code).toContain('_vynnSsrAttribute("disabled", () => props.busy, false)');
    expect(code).toContain('"Hello "');
    expect(code).toContain('"</button>"');
    expect(code).not.toContain("$template");
    expect(code).not.toContain("$insert");
    expect(code).not.toContain("$child");
    expectValidModule(code);
  });

  it("keeps built-in components as direct calls with lazy getter props", () => {
    const code = transformVynnSsr(
      `function Page() {
        return (
          <Await fallback={<Loading />}>
            <UserProfile />
          </Await>
        );
      }`,
      "await.tsx",
    );

    expect(code).toContain("Await({");
    expect(code).toContain("get fallback() { return Loading({");
    expect(code).toContain("get children() { return _vynnSsrChildren(() =>");
    expect(code).toContain("UserProfile({");
    expect(code).not.toContain("$ssr.component");
    expect(code).not.toContain("$ssr.await");
    expect(code).not.toContain("$cmpnt");
    expect(code).toContain("$ssrComponent as _vynnSsrComponent");
    expect(code).toContain("Page = _vynnSsrComponent(Page)");
    expectValidModule(code);
  });

  it("preserves component prop getters and spreads", () => {
    const code = transformVynnSsr(
      `function Page(props: { title: string; extra: Record<string, unknown> }) {
        return <Panel {...props.extra} title={props.title} />;
      }`,
      "panel.tsx",
    );

    expect(code).toContain("Panel({ ...props.extra, get title()");
    expect(code).not.toContain("$ssr.component");
    expectValidModule(code);
  });

  it("defers component children until they are consumed", () => {
    const code = transformVynnSsr(
      `function Form(props: { children: unknown }) {
        return <Provider>{props.children}</Provider>;
      }
      function Page() {
        return <Form><Input /></Form>;
      }`,
      "lazy-component-children.tsx",
    );

    expect(code).toContain("$ssrChildren as _vynnSsrChildren");
    expect(code).toContain("get children() { return _vynnSsrChildren(() =>");
    expect(code).toContain("_vynnSsrJoin(() => Input({}), true");
    expectValidModule(code);
  });

  it("passes component children through without escaping their HTML", () => {
    const code = transformVynnSsr(
      `function Layout(props: { children: unknown }) {
        return <section>{props.children}</section>;
      }`,
      "layout.tsx",
    );

    expect(code).not.toContain("_vynnSsrText(() => props.children)");
    expect(code).toContain("_vynnSsrJoin(() => props.children)");
  });

  it("escapes both branches of conditional children", () => {
    const code = transformVynnSsr(
      `function Status(props: { ready: boolean; message: string }) {
        return <div>{props.ready ? <strong>Ready</strong> : props.message}</div>;
      }`,
      "status.tsx",
    );

    expect(code).toContain("props.ready ? ");
    expect(code).toContain("Ready");
    expect(code).toContain("_vynnSsrText(() => props.message)");
  });

  it("flattens mapped JSX results without escaping the generated markup", () => {
    const code = transformVynnSsr(
      `function List(props: { items: string[] }) {
        return <ul>{props.items.map((item) => <li>{item}</li>)}</ul>;
      }`,
      "list.tsx",
    );

    expect(code).toContain("_vynnSsrJoin(() => props.items.map");
    expect(code).toContain("_vynnSsrText(() => item)");
    expect(code).toContain('"<li>"');
  });

  it("escapes explicit text children but preserves compiled JSX children", () => {
    const code = transformVynnSsr(
      `function Page(props: { message: string; children: unknown }) {
        return <>
          <Panel children={props.message} />
          <Panel children={props.children} />
          <Panel children={<strong>Trusted</strong>} />
          <Panel children={Badge()} />
        </>;
      }
      function Badge() { return <b>Badge</b>; }`,
      "explicit-children.tsx",
    );

    expect(code).toContain("get children() { return _vynnSsrChildren(() => _vynnSsrText(() => props.message, true))");
    expect(code).toContain("get children() { return _vynnSsrChildren(() => _vynnSsrJoin(() => props.children, true))");
    expect(code).toContain('"Trusted"');
    expect(code).toContain('"<strong"');
    expect(code).not.toContain('_vynnSsrText(() => "<strong"');
    expect(code).toContain("_vynnSsrJoin(() => Badge(), true");
    expectValidModule(code);
  });
  it("preserves JSX returned by lowercase local render helpers", () => {
    const code = transformVynnSsr(
      `const nameEl = (name: string) => <>Name: {name} Hi </>;
      function Page(props: { name: string }) {
        return <>{nameEl(props.name)}</>;
      }`,
      "lowercase-jsx-helper.tsx",
    );

    expect(code).toContain("_vynnSsrJoin(() => nameEl(props.name), true)");
    expect(code).not.toContain("_vynnSsrText(() => nameEl(props.name)");
    expect(code).toContain("_vynnSsrJoinChildren([");
    expectValidModule(code);
  });

  it("recognizes JSX-returning function declarations used as child expressions", () => {
    const code = transformVynnSsr(
      `function nameLabel(name: string) {
        return <>Name: {name} Hi </>;
      }
      function Page(props: { name: string }) {
        return <>{nameLabel(props.name)}</>;
      }`,
      "function-jsx-helper.tsx",
    );

    expect(code).toContain("_vynnSsrJoin(() => nameLabel(props.name), true)");
    expect(code).not.toContain("_vynnSsrText(() => nameLabel(props.name)");
    expectValidModule(code);
  });

  it("normalizes component return values before inserting them as children", () => {
    const code = transformVynnSsr(
      `function Empty() { return null; }
      function Disabled() { return false; }
      function Page() { return <main><Empty /><Disabled /></main>; }`,
      "component-values.tsx",
    );

    expect(code).toContain("_vynnSsrJoin(() => Empty(), true)");
    expect(code).toContain("_vynnSsrJoin(() => Disabled(), true)");
    expectValidModule(code);
  });

  it("rejects unsafe static inline event-handler attributes", () => {
    expect(() =>
      transformVynnSsr(
        `function Page() { return <div onclick="alert(1)" />; }`,
        "unsafe-attribute.tsx",
      ),
    ).toThrow("Unsafe HTML/SVG attribute name");
  });
  it("keeps a directive prologue before generated imports", () => {
    const code = transformVynnSsr(
      `"use client";
      export function Page(props: { value: string }) {
        return <p>{props.value}</p>;
      }`,
      "directive.tsx",
    );

    expect(code.indexOf('"use client"')).toBeLessThan(code.indexOf('from "vynn/server/ssr"'));
    expect(code).toContain("_vynnSsrText(() => props.value)");
  });


  it("wraps authored component declarations without changing JSX call sites", () => {
    const code = transformVynnSsr(
      `const Profile = (props: { name: string }) => <p>{props.name}</p>;

      export function Page() {
        return <Profile name="Vynn" />;
      }`,
      "components.tsx",
    );

    expect(code).toContain("_vynnSsrComponent((");
    expect(code).toContain("Page = _vynnSsrComponent(Page)");
    expect(code).toContain('Profile({ get name() { return "Vynn"; } })');
    expect(code).not.toContain("$ssr.component");
  });

  it("wraps anonymous default component expressions", () => {
    const code = transformVynnSsr(
      `export default () => <main>Anonymous</main>;`,
      "default.tsx",
    );

    expect(code).toContain("export default _vynnSsrComponent(() =>");
    expect(code).toContain('"<main"');
    expectValidModule(code);
  });

  it("emits client-compatible anchors for dynamic children and empty text", () => {
    const code = transformVynnSsr(
      `function Page(props: { name: string }) {
        return <main><p>Hello {props.name}</p><Widget />{""}</main>;
      }
      function Widget() { return <i>Widget</i>; }`,
      "anchors.tsx",
    );

    expect(code).toContain("<!--$v0-->");
    expect(code).toContain("<!--$v1-->");
    expect(code).toContain("<!--$0-->");
    expect(code).not.toContain("$template");
    expectValidModule(code);
  });

  it("marks raw HTML hosts so hydration skips injected descendants", () => {
    const code = transformVynnSsr(
      `function Page(props: { parsedCode: string }) {
        return (
          <main>
            <code html={props.parsedCode}></code>
            <p>After raw HTML</p>
          </main>
        );
      }`,
      "raw-html.tsx",
    );

    expect(code).toContain("data-vynn-raw-html");
    expect(code).toContain("_vynnSsrRaw(() => props.parsedCode)");
    expect(code).toContain("After raw HTML");
    expectValidModule(code);
  });

  it("treats a null raw HTML value as an empty raw HTML region", () => {
    const code = transformVynnSsr(
      `function Page() {
        return <code html={null}></code>;
      }`,
      "raw-html-null.tsx",
    );

    expect(code).toContain("data-vynn-raw-html");
    expect(code).toContain("_vynnSsrRaw(() => null)");
    expectValidModule(code);
  });

  it("preserves raw-text contents in script and style elements", () => {
    const code = transformVynnSsr(
      `function Page(props: { script: string }) {
        return <>
          <script>const lessThan = 1 &lt; 2;</script>
          <script>{props.script}</script>
          <style>.item::before { content: "&lt;"; }</style>
        </>;
      }`,
      "raw-text.tsx",
    );

    expect(code).toContain('"const lessThan = 1 < 2;"');
    expect(code).toContain('_vynnSsrJoin(() => props.script, false, "script")');
    expect(code).toContain("\\\\3C ");
    expect(code).not.toContain("<!--$v");
    expectValidModule(code);
  });
  it("hoists document metadata into the SSR head registry", () => {
    const code = transformVynnSsr(
      `function Page() {
        return <>
          <title>Vynn page</title>
          <meta name="description" content="A Vynn page" />
          <link rel="canonical" href="/page" />
          <main>Body</main>
        </>;
      }`,
      "head.tsx",
    );

    expect(code).toContain("$ssrHead as _vynnSsrHead");
    expect(code).toContain('_vynnSsrHead("title", { get children()');
    expect(code).toContain('_vynnSsrHead("meta", {');
    expect(code).toContain('_vynnSsrHead("link", {');
    expect(code).not.toContain('"<title"');
    expect(code).toContain('"<main"');
    expectValidModule(code);
  });

  it("keeps metadata inside an authored document head", () => {
    const code = transformVynnSsr(
      `function Document() {
        return <html><head><title>Document title</title><meta charSet="utf-8" /></head><body>App</body></html>;
      }`,
      "document.tsx",
    );

    expect(code).not.toContain("$ssrHead(");
    expect(code).toContain('"<html"');
    expect(code).toContain('"<title"');
    expectValidModule(code);
  });

  it("compiles nested head elements as an isolated metadata group", () => {
    const code = transformVynnSsr(
      `function Page() {
        return <><head><title>Nested title</title><meta name="description" content="Nested" /></head><main>Body</main></>;
      }`,
      "head-group.tsx",
    );

    expect(code).toContain("$ssrHeadGroup as _vynnSsrHeadGroup");
    expect(code).toContain("_vynnSsrHeadGroup(() => [");
    expect(code).toContain('_vynnSsrHead("title"');
    expectValidModule(code);
  });

  it("leaves JSX-free modules untouched to preserve client owner identity", () => {
    const source = `export function Page(props: { children?: string }) {
      return props.children ?? null;
    }
    export function formatValue(value: number) {
      return value.toFixed(2);
    }`;

    expect(transformVynnSsr(source, "component-without-jsx.ts")).toBe(source);
  });
  it("does not change modules that contain no JSX", () => {
    const source = `export function add(a: number, b: number) {
      return a + b;
    }`;

    expect(transformVynnSsr(source, "plain.ts")).toBe(source);
  });
  it("preserves adjacent text descriptors for the client hydration cursor", () => {
    const code = transformVynnSsr(
      `function Page() {
        return <p>Hello {"world"}</p>;
      }`,
      "adjacent-static-text.tsx",
    );

    expect(code).toContain("_vynnSsrJoinChildren([");
    expect(code).toContain('"Hello "');
    expect(code).toContain('"world"');
    expect(code).not.toContain("$template");
    expectValidModule(code);
  });

  it("keeps dynamic and static text as separately claimable SSR nodes", () => {
    const code = transformVynnSsr(
      `function Page(props: { name: string }) {
        return <label>Hi {props.name}!</label>;
      }`,
      "dynamic-text-boundary.tsx",
    );

    expect(code).toContain("_vynnSsrJoinChildren([");
    expect(code).toContain("_vynnSsrText(() => props.name)");
    expectValidModule(code);
  });

});
