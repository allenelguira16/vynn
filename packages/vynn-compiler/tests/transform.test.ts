import { describe, expect, it } from "vitest";

import { transformVynnOxc, transformVynnOxcWithMap } from "../src/index.ts";

describe("Vynn Oxc JSX compiler", () => {
  it("routes statically known $state values through the lightweight runtime entry", () => {
    const code = transformVynnOxc(
      `import { $state as state } from "vynn";
      export function Counter() {
        const count = state(0 as number);
        return <button>{count.value}</button>;
      }`,
      "counter.tsx",
    );

    expect(code).toContain('from "vynn/internal/state-value"');
    expect(code).toContain("_$stateValue(0 as number)");
  });

  it("does not rewrite function initializers or unknown value expressions", () => {
    const code = transformVynnOxc(
      `import { $state } from "vynn";
      const initial = getInitialValue();
      export function Counter() {
        const fromFunction = $state(() => 0);
        const fromVariable = $state(initial);
        return <button>{fromFunction.value + fromVariable.value}</button>;
      }`,
      "counter.tsx",
    );

    expect(code).not.toContain("vynn/internal/state-value");
    expect(code).toContain("$state(() => 0)");
    expect(code).toContain("$state(initial)");
  });

  it("respects imported state aliases and lexical shadowing", () => {
    const code = transformVynnOxc(
      `import * as Vynn from "vynn";
      function Counter() {
        const count = Vynn.$state(0);
        function local($state: (value: number) => number) {
          return $state(1);
        }
        return <button>{count.value + local((value) => value).valueOf()}</button>;
      }`,
      "counter.tsx",
    );

    expect(code).toContain('from "vynn/internal/state-value"');
    expect(code).toContain("_$stateValue(0)");
    expect(code).toContain("$state(1)");
  });

  it("rewrites direct state values in TypeScript modules without JSX", () => {
    const code = transformVynnOxc(
      `import { $state } from "vynn";
      export const count = $state(0);`,
      "state.ts",
    );

    expect(code).toContain('from "vynn/internal/state-value"');
    expect(code).toContain("_$stateValue(0)");
  });



  it("claims static fragment text before evaluating dynamic children", () => {
    const code = transformVynnOxc(
      `function Contexts(props: { name: string }) {
        const nameEl = () => <>Name: {props.name} Hi </>;

        return (
          <>
            {" "}
            {props.name}
            {nameEl()}
          </>
        );
      }`,
      "contexts.tsx",
    );

    expect(code).toContain("$text as _$text");
    expect(code).toContain('_$text("Name: ")');
    expect(code).toContain('_$text(" Hi ")');
    expect(code).toContain('_$text(" ")');
  });

  it("hoists fully static JSX subtrees into module-level templates", () => {
    const code = transformVynnOxc(
      `function Page() {
        return <main><h1>Vynn</h1><p>A static subtree</p></main>;
      }`,
      "page.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toMatch(/const _tmpl\d* = _\$template\(/);
    expect(code).not.toContain("TemplateDescriptor");
    expect(code).not.toContain("_$child(");
    expect(code.indexOf("const _tmpl")).toBeLessThan(code.indexOf("function Page"));
    expect(code).toContain("_tmpl");
    expect(code).toContain("A static subtree");
    expect(code).not.toContain('_$tmpl("main")');
    expect(code).not.toContain('_$txt("A static subtree")');
  });



  it("serializes static table content into one template", () => {
    const code = transformVynnOxc(
      `function Table() {
        return (
          <table class="table">
            <thead>
              <tr><th>ID</th><th onClick={handleClick}>Name</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={3}>loading...</td></tr>
            </tbody>
          </table>
        );
      }`,
      "table.tsx",
    );

    expect(code).toContain(
      '_$template("<table class=\\"table\\"><thead><tr><th>ID</th><th>Name</th></tr></thead><tbody><tr><td colspan=\\"3\\">loading...</td></tr></tbody></table>")',
    );
    expect(code).toContain("_$on(");
    expect(code).not.toContain("$txt");
  });

  it("keeps component slots inside serialized table sections", () => {
    const code = transformVynnOxc(
      `function Table(props: { value: string }) {
        return (
          <table>
            <tbody>
              <Await fallback={<tr><td colSpan={3}>Loading</td></tr>}>
                <tr><td>{props.value}</td></tr>
              </Await>
            </tbody>
          </table>
        );
      }`,
      "table-await.tsx",
    );

    expect(code).toContain('_$template("<table><tbody><!--$v0--></tbody></table>")');
    expect(code).toContain("Await(");
    expect(code).toContain("props.value");
    expect(code).not.toContain("$txt");
  });

  it("adds an explicit tbody when static rows are direct table children", () => {
    const code = transformVynnOxc(
      `function Table() {
        return <table><tr><td>First row</td></tr><tr><td>Second row</td></tr></table>;
      }`,
      "table-rows.tsx",
    );

    expect(code).toContain(
      '_$template("<table><tbody><tr><td>First row</td></tr><tr><td>Second row</td></tr></tbody></table>")',
    );
    expect(code).not.toContain("$txt");
  });

  it("reuses a hoisted factory for identical static subtrees", () => {
    const code = transformVynnOxc(
      `function Repeated() {
        return <><div>same</div><div>same</div></>;
      }`,
      "repeated.tsx",
    );

    expect(code.match(/_\$template\(/g)).toHaveLength(1);
    expect(code.match(/_tmpl\d*\(/g)).toHaveLength(2);
  });


  it("emits positional paths for bindings on nested host elements", () => {
    const code = transformVynnOxc(
      `function Nested(props: { title: string; value: string }) {
        return (
          <section>
            <div><button title={props.title} /></div>
            <p>{props.value}</p>
          </section>
        );
      }`,
      "nested.tsx",
    );

    expect(code).toContain("_$child(");
    expect(code).toContain("_$sibling(");
    expect(code).toContain("_$attr(");
    expect(code).toContain("_$insert(");
    expect(code).toContain("<!--$v0-->");
    expect(code).not.toContain("data-vynn-bind-");
    expect(code).not.toContain("_find(");
  });


  it("uses compact HTML comments for dynamic child slots", () => {
    const code = transformVynnOxc(
      `function Counter(props: { count: number }) {
        return <div>Count: {props.count}</div>;
      }`,
      "counter.tsx",
    );

    expect(code).toContain('_$template("<div>Count: <!--$v0--></div>")');
    expect(code).not.toContain("vynn:slot:");
  });

  it("preserves empty string expressions as empty text nodes in templates", () => {
    const code = transformVynnOxc(
      `function Empty() {
        return <div>{""}<span>after</span></div>;
      }`,
      "empty.tsx",
    );

    expect(code).toContain("<!--$0-->");
    expect(code).toContain("<span>after</span>");
  });


  it("flattens fragment children into their parent's positional indexes", () => {
    const code = transformVynnOxc(
      `function FragmentPaths(props: { title: string; value: string }) {
        return (
          <section>
            <header>top</header>
            <>
              <button title={props.title} />
              {props.value}
            </>
            <footer>bottom</footer>
          </section>
        );
      }`,
      "fragment-paths.tsx",
    );

    expect(code).toContain("<header>top</header>");
    expect(code).toContain("<button></button>");
    expect(code).toContain("<!--$v0-->");
    expect(code).toContain("<footer>bottom</footer>");
    expect(code).toContain("_$child(");
    expect(code).toContain("_$sibling(");
    expect(code).not.toContain("data-vynn-bind-");
  });

  it("preserves HTML boolean attribute semantics in static templates", () => {
    const code = transformVynnOxc(
      `function Button() {
        return <button disabled={false} aria-hidden={true} />;
      }`,
      "button.tsx",
    );

    expect(code).toMatch(/aria-hidden=\\?"true\\?"/);
    expect(code).not.toContain('disabled=""');
  });

  it("uses one mixed template for reactive attributes, events, and children", () => {
    const code = transformVynnOxc(
      `function Counter(props: { label: string; className: string }) {
        return <button className={props.className} onClick={handleClick}>
          {props.label}<span>static sibling</span>
        </button>;
      }`,
      "counter.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toContain("<!--$v0-->");
    expect(code).not.toContain("firstChild");
    expect(code).not.toContain("nextSibling");
    expect(code).not.toContain("$claimTemplateNode");
    expect(code).toContain("_$finishTemplate(");
    expect(code).toContain("_tmpl");
    expect(code).not.toMatch(/_tmpl\d*\(\s*\(/);
    expect(code).not.toContain("data-vynn-bind-");
    expect(code).not.toContain("_find(");
    expect(code).toContain("_$attr(");
    expect(code).toContain("_$on(");
    expect(code).toContain("_$insert(");
    expect(code).toContain('<span>static sibling</span>');
  });

  it("defers conditional and list expressions until their template slot is claimed", () => {
    const code = transformVynnOxc(
      `function Page(props: { show: boolean; items: number[] }) {
        return (
          <main>
            <button>Before the conditional</button>
            {props.show && <List items={props.items} />}
            <footer>After the conditional</footer>
          </main>
        );
      }

      function List(props: { items: number[] }) {
        return <section>{props.items.map((item) => <span>{item}</span>)}</section>;
      }`,
      "hydration-order.tsx",
    );

    expect(code).toMatch(/_\$insert\([^,]+,\s*\(\)\s*=>\s*_\$if\(/);
    expect(code).toMatch(/_\$insert\([^,]+,\s*\(\)\s*=>\s*_\$for\(/);
  });

  it("keeps static siblings in the same template as dynamic children", () => {
    const code = transformVynnOxc(
      `function Message(props: { value: string }) {
        return <div>{props.value}<span>unchanged</span></div>;
      }`,
      "message.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toContain("<!--$v0-->");
    expect(code).toContain("<span>unchanged</span>");
    expect(code).not.toContain("firstChild");
    expect(code).not.toContain("nextSibling");
    expect(code).not.toContain("$claimTemplateNode");
    expect(code).not.toContain('_$tmpl("div")');
  });
  it("preserves dollar-prefixed runtime helper names in generated aliases", () => {
    const code = transformVynnOxc(
      `function Greeting(props: { name: string }) {
        return <h1>Hello {props.name}</h1>;
      }`,
      "greeting.tsx",
    );

    expect(code).toContain("$cmpnt as _$cmpnt");
    expect(code).toContain("$template as _$template");
    expect(code).not.toContain("$child as _$child");
    expect(code).not.toContain("_$child(");
    expect(code).not.toContain("$claimTemplateNode as _$claimTemplateNode");
    expect(code).toContain("$finishTemplate as _$finishTemplate");
    expect(code).toContain("$insert as _$insert");
    expect(code).not.toContain("$tmpl as _$tmpl");
    expect(code).not.toContain("$txt as _$txt");
    expect(code).toContain("_$cmpnt(function Greeting");
    expect(code).not.toContain("$cmpnt as _cmpnt");
  });


  it("compiles component children and spreads as template bindings", () => {
    const code = transformVynnOxc(
      `function Panel(props: { children: unknown; [key: string]: unknown }) {
        return <section {...props}><Widget />{props.children}</section>;
      }`,
      "panel.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toContain("_$spread(");
    expect(code).toContain("Widget(");
    expect(code).toContain("<!--$v0-->");
    expect(code).not.toContain("firstChild");
    expect(code).not.toContain("nextSibling");
    expect(code).not.toContain("$claimTemplateNode");
  });

  it("emits host child template setup directly in the component children getter", () => {
    const code = transformVynnOxc(
      `function Forms() {
        return (
          <Template title="Forms">
            <div>
              <span>{name.firstName}</span>
              <input value={name.firstName} />
            </div>
            <Counter key={1} />
            <Input key={2} />
          </Template>
        );
      }`,
      "forms.tsx",
    );

    expect(code).toMatch(/get children\(\) \{\s*const _root\d* = _tmpl\d*\(\)/);
    expect(code).not.toMatch(/get children\(\) \{\s*return \(\(\) =>/);
    expect(code).toContain("Counter(");
    expect(code).toContain("Input(");
    expect(code).toContain("_$finishTemplate(");
  });

  it("preserves component child evaluation order before later host setup", () => {
    const code = transformVynnOxc(
      `function Forms() {
        return (
          <Template>
            <Counter key={1} />
            <div><span>{name.firstName}</span></div>
          </Template>
        );
      }`,
      "forms-order.tsx",
    );

    const componentIndex = code.indexOf("const _child = Counter(");
    const templateIndex = code.indexOf("const _root = _tmpl(");
    expect(componentIndex).toBeGreaterThan(-1);
    expect(templateIndex).toBeGreaterThan(componentIndex);
  });

  it("keeps fragment host setup in the owning component children getter", () => {
    const code = transformVynnOxc(
      `function Forms() {
        return (
          <Template title="Forms">
            <>
              <div><span>{name.firstName}</span></div>
              <Counter key={1} />
              <Input key={2} />
            </>
          </Template>
        );
      }`,
      "forms-fragment.tsx",
    );

    expect(code).toMatch(/get children\(\) \{\s*return/);
    expect(code).toContain("(() => {");
    expect(code).toContain("Counter(");
    expect(code).toContain("Input(");
  });

  it("attaches refs through a template element binding", () => {
    const code = transformVynnOxc(
      `function Input() {
        let input: HTMLInputElement;
        return <div><input ref={input} value="hello" /></div>;
      }`,
      "input.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toContain("$child as _$child");
    expect(code).not.toContain("$claimTemplateNode");
    expect(code).not.toContain("data-vynn-bind-");
    expect(code).not.toContain("_find(");
    expect(code).toContain("input =");
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

    expect(code).toContain(" is a TypeScript UI framework");
  });

  it("keeps a direct JSX fragment return in the surrounding function body", () => {
    const code = transformVynnOxc(
      `function LayoutPage(props: { children: unknown }) {
        let el: HTMLDivElement;
        return (
          <>
            <main>
              <ButtonPageList />
              <div ref={el}>{props.children}</div>
            </main>
            <Portal mount={el}><span>Portal content</span></Portal>
          </>
        );
      }`,
      "layout.tsx",
    );

    expect(code).toMatch(/let el;\s*return\s*\[/);
    expect(code).not.toMatch(/let el;\s*\{\s*return/);
    expect(code).toContain("Portal(");
  });

  it("keeps JSX setup inside an unbraced conditional return", () => {
    const code = transformVynnOxc(
      `function Status(props: { loading: boolean; title: string }) {
        if (props.loading) return <button title={props.title} />;
        return null;
      }`,
      "status.tsx",
    );

    expect(code).toMatch(/if \(props\.loading\) \{\s*(?:const|let) /);
    expect(code).toContain("_$attr(");
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
    expect(code).toContain('_$template("<div");
    expect(code).toContain('_$template("<section");
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
    expect(code).toContain('_$template("<strong");
    expect(code).toContain('_$template("<em");
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
    expect(code).toContain('_$template("<span");
    expect(code).toContain('_$template("<button");
  });

  it("wraps anonymous default function declarations", () => {
    const code = transformVynnOxc(
      `export default function () {
        return <main>Anonymous</main>;
      }`,
      "app.tsx",
    );

    expect(code).toMatch(/export default _$cmpnt\(function\s*\(/);
    expect(code).toContain('_$template("<main");
  });

  it("wraps anonymous default arrow components", () => {
    const code = transformVynnOxc(`export default () => <main>Anonymous</main>;`, "app.tsx");

    expect(code).toMatch(/export default _$cmpnt\(function\s*\(/);
    expect(code).toContain('_$template("<main");
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


  it("normalizes SVG camelCase attributes in mixed templates", () => {
    const code = transformVynnOxc(
      `function Icon() {
        return <svg><path strokeWidth={2} fillRule="evenodd" /></svg>;
      }`,
      "icon.tsx",
    );

    expect(code).toContain("_$template(");
    expect(code).toContain('stroke-width="2"');
    expect(code).toContain('fill-rule="evenodd"');
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

    expect(result.code).toContain("_$template");
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
