import { describe, expect, it } from "vitest";

import { transformVynnOxc } from "../src/index";
import { transformVynnRenderNewOxc } from "../src/render-new";

describe("render_new JSX compiler target", () => {
  it("compiles a named component's dynamic text into a text reference", () => {
    const code = transformVynnRenderNewOxc(
      `function Greeting(props: { name: string }) {
        return <h1>{props.name}</h1>;
      }`,
      "greeting.tsx",
    );

    expect(code).toContain('markup: "<h1>__vynn_render_new_text_0__</h1>"');
    expect(code).toContain('namespace: "html"');
    expect(code).toContain('kind: "text", path: [0, 0]');
    expect(code).toContain('kind: "text", reference: 0');
    expect(code).toContain("read: () => (props.name)");
    expect(code).toContain("as const");
    expect(code).not.toContain("vynn/render");
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
    expect(code).toContain('kind: "text", path: [0, 1, 0]');
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

    expect(code).toContain('markup: "<h1>Heading</h1><p>__vynn_render_new_text_0__</p>"');
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

    expect(code).toContain('markup: "<strong>__vynn_render_new_text_0__</strong>"');
    expect(code).toContain("read: () => (props.name)");
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

  it("rejects component children until structural child instructions exist", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        `function Page() {
          return <main><Child /></main>;
        }`,
        "page.tsx",
      ),
    ).toThrow("Component element <Child>");
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

  it("rejects mixed static and dynamic text that the DOM parser would merge", () => {
    expect(() =>
      transformVynnRenderNewOxc(
        `function Greeting(props: { name: string }) {
          return <p>Hello {props.name}</p>;
        }`,
        "greeting.tsx",
      ),
    ).toThrow("must occupy its own text node");
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

  it("returns original source when the module contains no JSX", () => {
    const source = "export const value: number = 42;";
    expect(transformVynnRenderNewOxc(source, "value.ts")).toBe(source);
  });
});
