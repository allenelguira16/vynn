import { describe, expect, it } from "vitest";

import { transformVynnOxc } from "../src/index";
import { transformVynnRenderNewOxc } from "../src/render-new";

describe("render_new JSX compiler target", () => {
  it("compiles a named component's dynamic child into a comment range", () => {
    const code = transformVynnRenderNewOxc(
      `function Greeting(props: { name: string }) {
        return <h1>{props.name}</h1>;
      }`,
      "greeting.tsx",
    );

    expect(code).toContain('markup: "<h1><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></h1>"');
    expect(code).toContain('namespace: "html"');
    expect(code).toContain('kind: "anchor", path: [0, 0]');
    expect(code).toContain('kind: "child", reference: 0');
    expect(code).toContain("read: () => (props.name)");
    expect(code).toContain("as const");
    expect(code).not.toContain('from "vynn/render";');
  });

  it("compiles reactive attributes, form properties, and event listeners", () => {
    const code = transformVynnRenderNewOxc(
      `function Button(props: {
        title: string;
        value: string;
        disabled: boolean;
        onClick: (event: Event) => void;
      }) {
        return (
          <button
            title={props.title}
            value={props.value}
            disabled={props.disabled}
            onClick={props.onClick}
            onDoubleClickCapture={props.onClick}
          >
            Save
          </button>
        );
      }`,
      "button.tsx",
    );

    expect(code).toContain('kind: "element", path: [0]');
    expect(code).toContain('name: "title"');
    expect(code).toContain('kind: "property"');
    expect(code).toContain('name: "value"');
    expect(code).toContain('name: "disabled"');
    expect(code).toContain('event: "click"');
    expect(code).toContain('event: "dblclick"');
    expect(code).toContain("options: true");
  });

  it("compiles nested element references using child-node paths", () => {
    const code = transformVynnRenderNewOxc(
      `function Page(props: { title: string; text: string }) {
        return (
          <main>
            <button title={props.title} />
            <p>{props.text}</p>
          </main>
        );
      }`,
      "page.tsx",
    );

    expect(code).toContain('kind: "element", path: [0, 0]');
    expect(code).toContain('kind: "anchor", path: [0, 1]');
  });

  it("compiles fragments as multiple template roots", () => {
    const code = transformVynnRenderNewOxc(
      `function Page(props: { value: string }) {
        return (
          <>
            <h1>Heading</h1>
            <p>{props.value}</p>
          </>
        );
      }`,
      "fragment.tsx",
    );

    expect(code).toContain('markup: "<h1>Heading</h1><p><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></p>"');
    expect(code).toContain('path: [0]');
    expect(code).toContain('path: [1, 0]');
  });

  it("preserves nested SVG namespaces and namespaced attributes", () => {
    const code = transformVynnRenderNewOxc(
      `function Icon(props: { href: string; width: number }) {
        return (
          <svg>
            <use xlinkHref={props.href} />
            <path strokeWidth={props.width} />
          </svg>
        );
      }`,
      "icon.tsx",
    );

    expect(code).toContain('namespace: "svg"');
    expect(code).toContain('namespaceURI":"http://www.w3.org/1999/xlink"');
    expect(code).toContain('qualifiedName":"xlink:href"');
    expect(code).toContain('name: "stroke-width"');
  });

  it("compiles HTML attributes and boolean attributes with their expected semantics", () => {
    const code = transformVynnRenderNewOxc(
      `function Button(props: { disabled: boolean }) {
        return <button className="primary" disabled={props.disabled} aria-hidden={false} />;
      }`,
      "button.tsx",
    );

    expect(code).toContain('class="primary"');
    expect(code).toContain('name: "disabled"');
    expect(code).toContain('aria-hidden=\\\"false\\\"');
    expect(code).not.toContain('read: () => (false)');
  });

  it("keeps null event handlers as reactive event instructions", () => {
    const code = transformVynnRenderNewOxc(
      `function Button() {
        return <button onClick={null} />;
      }`,
      "button.tsx",
    );

    expect(code).toContain('kind: "event"');
    expect(code).toContain('read: () => (null)');
  });

  it("compiles expression-bodied named component variables", () => {
    const code = transformVynnRenderNewOxc(
      `const Greeting = (props: { name: string }) => <strong>{props.name}</strong>;`,
      "greeting.tsx",
    );

    expect(code).toContain('markup: "<strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong>"');
    expect(code).toContain("read: () => (props.name)");
  });

  it("hoists template definitions after module directives", () => {
    const code = transformVynnRenderNewOxc(
      `"use client";
      function Page(props: { value: string }) {
        return <main>{props.value}</main>;
      }`,
      "page.tsx",
    );

    expect(code.indexOf('"use client"')).toBeLessThan(
      code.indexOf("const _vynnTemplate0"),
    );
    expect(code.indexOf("const _vynnTemplate0")).toBeLessThan(
      code.indexOf("function Page"),
    );
  });

  it("deduplicates identical template definitions across components", () => {
    const code = transformVynnRenderNewOxc(
      `function First(props: { value: string }) {
        return <p>{props.value}</p>;
      }
      function Second(props: { value: string }) {
        return <p>{props.value}</p>;
      }`,
      "components.tsx",
    );

    expect(code.match(/const _vynnTemplate[0-9]+ =/g)).toHaveLength(1);
    expect(code.match(/template: _vynnTemplate0/g)).toHaveLength(2);
  });

  it("compiles multiple JSX returns in the same component", () => {
    const code = transformVynnRenderNewOxc(
      `function Status(props: { loading: boolean }) {
        if (props.loading) return <strong>Loading</strong>;
        return <span>Ready</span>;
      }`,
      "status.tsx",
    );

    expect(code).toContain('markup: "<strong>Loading</strong>"');
    expect(code).toContain('markup: "<span>Ready</span>"');
    expect(code).toContain("if (props.loading) return");
  });

  it("preserves static text and escapes markup characters", () => {
    const code = transformVynnRenderNewOxc(
      `function Text() {
        return <p title="a &quot;quote&quot;">A &amp; B <em>safe</em></p>;
      }`,
      "text.tsx",
    );

    expect(code).toContain('markup: "<p title=\\\"a &quot;quote&quot;\\\">A &amp; B <em>safe</em></p>"');
  });

  it("compiles component children into nested template programs", () => {
    const code = transformVynnRenderNewOxc(
      `function Page() {
        return <main><Child /></main>;
      }`,
      "page.tsx",
    );

    expect(code).toContain('kind: "child"');
    expect(code).toContain("Child({  })");
    expect(code).toContain("__vynn_render_new_child_0_start__");
  });

  it("compiles conditional JSX branches into replaceable child programs", () => {
    const code = transformVynnRenderNewOxc(
      `function View(props) {
        return <main>{props.ready ? <strong>Ready</strong> : <i>Waiting</i>}</main>;
      }`,
      "view.jsx",
    );

    expect(code).toContain('markup: "<strong>Ready</strong>"');
    expect(code).toContain('markup: "<i>Waiting</i>"');
    expect(code).toContain('kind: "child"');
    expect(code).toContain("props.ready ? ({");
  });

  it("compiles a conditional component return into a root child slot", () => {
    const code = transformVynnRenderNewOxc(
      `function View(props) {
        return props.ready ? <strong>Ready</strong> : null;
      }`,
      "view.jsx",
    );

    expect(code).toContain('markup: "<!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__-->"');
    expect(code).toContain('read: () => (props.ready ? ({');
    expect(code).toContain('markup: "<strong>Ready</strong>"');
  });

  it("compiles direct JSX returns with null early-return branches", () => {
    const code = transformVynnRenderNewOxc(
      `function View(props) {
        if (!props.ready) return null;
        return <strong>Ready</strong>;
      }`,
      "view.jsx",
    );

    expect(code).toContain('markup: "<strong>Ready</strong>"');
    expect(code).toContain("if (!props.ready) return ({");
    expect(code).toContain("_vynnCreateRenderNewComponent");
  });

  it("compiles mapped JSX into arrays of child template programs", () => {
    const code = transformVynnRenderNewOxc(
      `function List(props) {
        return <ul>{props.items.map((item) => <li>{item.label}</li>)}</ul>;
      }`,
      "list.jsx",
    );

    expect(code).toContain('markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>"');
    expect(code).toContain("props.items.map");
    expect(code).toContain("item.label");
    expect(code).toContain('kind: "child"');
  });

  it("emits stable keys on host template programs created inside arrays", () => {
    const code = transformVynnRenderNewOxc(
      `function List(props) {
        return <ul>{props.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
      }`,
      "list.jsx",
    );

    expect(code).toContain('key: (item.id)');
    expect(code).toContain('markup: "<li><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></li>"');
  });

  it("returns keyed programs from a compiled map callback", () => {
    const code = transformVynnRenderNewOxc(
      `function List(props) {
        return <ul>{props.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
      }`,
      "list.jsx",
    );
    const executable = code.replace(
      'import { createRenderNewComponent as _vynnCreateRenderNewComponent } from "vynn/render_new/internal";',
      "const _vynnCreateRenderNewComponent = (render) => ({ render });",
    );
    const createList = new Function(executable + "\\nreturn List;") as () => (
      props: { items: Array<{ id: string; label: string }> },
    ) => { render: () => {
      bindings: Array<{ read: () => unknown }>;
    } };

    const component = createList()({
      items: [
        { id: "first", label: "First" },
        { id: "second", label: "Second" },
      ],
    });
    const program = component.render();
    const children = program.bindings[0]!.read() as Array<{
      key: string;
      template: object;
    }>;

    expect(children.map((item) => item.key)).toEqual(["first", "second"]);
    expect(children[0]!.template).toBe(children[1]!.template);
  });

  it("supports static string keys on nested host templates", () => {
    const code = transformVynnRenderNewOxc(
      `function List() {
        return <ul>{[<li key="first">First</li>]}</ul>;
      }`,
      "list.jsx",
    );

    expect(code).toContain('key: ("first")');
    expect(code).not.toContain('key="first"');
  });

  it("rejects keyed component entries until component prop updates are supported", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        `function List(props) {
          return <ul>{props.items.map((item) => <Row key={item.id} item={item} />)}</ul>;
        }`,
        "list.jsx",
      ),
    ).toThrow("Keyed component entries are not supported yet");
  });

  it("passes nested JSX through a component's children prop", () => {
    const code = transformVynnRenderNewOxc(
      `function Page(props) {
        return <Panel title={props.title}><strong>{props.message}</strong></Panel>;
      }`,
      "page.jsx",
    );

    expect(code).toContain('get "title"() { return (props.title); }');
    expect(code).toContain('get "children"() { return [({ template:');
    expect(code).toContain('markup: "<strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong>"');
  });

  it("rejects spread attributes with a targeted diagnostic", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        `function Page(props: { attrs: object }) {
          return <button {...props.attrs} />;
        }`,
        "page.tsx",
      ),
    ).toThrow("spread attributes are not supported");
  });

  it("supports static text beside a dynamic child slot", () => {
    const code = transformVynnRenderNewOxc(
      `function Greeting(props: { name: string }) {
        return <p>Hello {props.name}</p>;
      }`,
      "greeting.tsx",
    );

    expect(code).toContain('markup: "<p>Hello <!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></p>"');
    expect(code).toContain('kind: "child"');
  });

  it("rejects JSX outside a direct named component return", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        `const view = <main />;`,
        "view.tsx",
      ),
    ).toThrow("returned directly from a named function component");
  });

  it("does not change the legacy JSX compiler output", () => {
    const code = transformVynnOxc(
      `function Page() {
        return <main>Legacy</main>;
      }`,
      "page.tsx",
    );

    expect(code).toContain("_$staticTemplate");
    expect(code).toContain('from "vynn/render"');
  });

  it("emits executable JavaScript programs with live accessor closures", () => {
    const code = transformVynnRenderNewOxc(
      `function Page(props) {
        return <button title={props.title}>{props.label}</button>;
      }`,
      "page.jsx",
    );

    expect(code).not.toContain(" as const");

    const executable = code.replace(
      'import { createRenderNewComponent as _vynnCreateRenderNewComponent } from "vynn/render_new/internal";',
      'const _vynnCreateRenderNewComponent = (render) => ({ render });',
    );
    const createPage = new Function(executable + "\nreturn Page;") as () => (
      props: { title: string; label: string },
    ) => { render: () => {
      template: { markup: string; namespace: string; references: unknown[] };
      bindings: Array<{ kind: string; read: () => unknown }>;
    } };

    const Page = createPage();
    const component = Page({ title: "First title", label: "First label" });
    const program = component.render();

    expect(program.template.markup).toBe(
      '<button><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></button>',
    );
    expect(program.template.namespace).toBe("html");
    expect(program.bindings).toHaveLength(2);
    expect(program.bindings[0].read()).toBe("First title");
    expect(program.bindings[1].read()).toBe("First label");

    const secondComponent = Page({ title: "Second title", label: "Second label" });
    const secondProgram = secondComponent.render();
    expect(secondProgram.template).toBe(program.template);
    expect(secondProgram.bindings[0].read()).toBe("Second title");
    expect(secondProgram.bindings[1].read()).toBe("Second label");
  });

  it("defers a component body until the returned descriptor is rendered", () => {
    const code = transformVynnRenderNewOxc(
      "function Page(props) { props.onRender(); return <p>{props.label}</p>; }",
      "page.jsx",
    );
    const executable = code.replace(
      'import { createRenderNewComponent as _vynnCreateRenderNewComponent } from "vynn/render_new/internal";',
      "const _vynnCreateRenderNewComponent = (render) => ({ render });",
    );
    const createPage = new Function(executable + "\nreturn Page;") as () => (
      props: { label: string; onRender: () => void },
    ) => { render: () => unknown };

    let calls = 0;
    const component = createPage()({
      label: "deferred",
      onRender: () => calls++,
    });

    expect(calls).toBe(0);
    component.render();
    expect(calls).toBe(1);
  });

  it("rejects async and generator components", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        "async function Page() { return <main />; }",
        "page.jsx",
      ),
    ).toThrow("Async and generator components are not supported");

    expect(() =>
      transformVynnRenderNewOxc(
        "function* Page() { return <main />; }",
        "page.jsx",
      ),
    ).toThrow("Async and generator components are not supported");
  });

  it("rejects script mode when a component helper import is required", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        "function Page() { return <main />; }",
        "page.jsx",
        { sourceType: "script" },
      ),
    ).toThrow("requires module source type");
  });

  it("returns original source when the module contains no JSX", () => {
    const source = "export const value: number = 42;";
    expect(transformVynnRenderNewOxc(source, "value.ts")).toBe(source);
  });
});
