import { CodeBlock } from "../../../../components/code-block";
const CompilerPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Reference</p>
    <h1>Compiler and build tooling</h1>
    <p class="lead">
      Vynn's JSX compiler is a separate package powered by Oxc and esrap. The compiler is build-tool
      independent; the Vite plugin provides the integration most applications need.
    </p>
    <h2>Use the Vite plugin when possible</h2>
    <p>
      For a Vite application, install <code>vite-plugin-vynn</code> and add
      <code>vynn()</code>. It includes the JSX transform and integrated application handling. You do
      not need to configure a second JSX plugin or install <code>vynn-compiler</code> directly just
      to use Vynn with Vite.
    </p>
    <CodeBlock
      lang="ts"
      code={
        'import { defineConfig } from "vite";\nimport vynn from "vite-plugin-vynn";\n\nexport default defineConfig({\n  plugins: [vynn()],\n});'
      }
    />
    <h2>Transform source programmatically</h2>
    <p>
      Use <code>vynn-compiler</code> directly when integrating Vynn into another build system or
      when you need to inspect transformed output.
    </p>
    <CodeBlock
      lang="ts"
      code={
        'import { transformVynnOxc, transformVynnOxcWithMap } from "vynn-compiler";\n\nconst source = "export function App() { return <h1>Hello</h1>; }";\n\nconst code = transformVynnOxc(source, "App.tsx");\nconst result = transformVynnOxcWithMap(source, "App.tsx");\n\nconsole.log(code);\nconsole.log(result.map);'
      }
    />
    <p>
      <code>transformVynnOxc()</code> returns the transformed source code. The
      <code>WithMap</code> variant returns an object containing <code>code</code> and a source
      <code>map</code> (or <code>null</code> when no transform is needed).
    </p>
    <h2>How JSX becomes JavaScript</h2>
    <p>
      JSX is syntax that the browser does not understand. Vynn's compiler parses the TSX module with
      Oxc, rewrites the JSX nodes into ordinary JavaScript expressions and function calls, then
      prints the transformed module. It does not turn JSX into a React-style
      <code>createElement()</code> tree.
    </p>
    <p>Start with a component and a second component that uses it:</p>
    <CodeBlock
      lang="ts"
      code={
        'function Greeting(props: { name: string }) {\n  return <h1>Hello {props.name}</h1>;\n}\n\nfunction App() {\n  return <Greeting name="Ada" />;\n}'
      }
    />
    <p>
      A PascalCase function component is rewritten as a function expression passed to
      <code>$cmpnt()</code>. The component's body is still JavaScript. The JSX inside that body is
      what gets lowered into runtime calls.
    </p>
    <CodeBlock
      lang="ts"
      code={
        'import {\n  $cmpnt as _$cmpnt,\n  $template as _$template,\n  $insert as _$insert,\n} from "vynn/render";\n\nconst _tmpl = _$template("<h1>Hello <!--$v0--></h1>");\n\nconst Greeting = _$cmpnt(function Greeting(props: { name: string }) {\n  const el1 = _tmpl();\n  _$insert(el1, () => props.name, "0");\n  return el1;\n});\n\nconst App = _$cmpnt(function App() {\n  return Greeting({\n    get name() {\n      return "Ada";\n    },\n  });\n});'
      }
    />
    <p>
      This is a simplified view of the generated module. Generated runtime helpers keep their
      original <code>$</code> prefix and receive a leading underscore in the local alias, such as
      <code>$cmpnt as _$cmpnt</code>. The underscore marks compiler-generated bindings without
      hiding the Vynn helper name. Temporary names such as <code>el1</code> are allocated
      separately, and numeric suffixes are used when a generated name would collide with a source
      identifier. Exact formatting and import order may differ. The important parts are the
      transformations:
    </p>
    <ol>
      <li>
        <strong>
          <code>Greeting</code> becomes a callable component.
        </strong>{" "}
        The declaration becomes <code>$cmpnt(function Greeting(props))</code>. The function itself
        remains a normal JavaScript function. <code>$cmpnt()</code> returns a callable wrapper that
        creates the component's reactive owner, runs the function in that owner, and connects its
        lifetime to the rendered component.
      </li>
      <li>
        <strong>Native tags become DOM instructions.</strong> <code>&lt;h1&gt;</code> becomes
        <code>$template()</code> creates a reusable static template; dynamic children occupy comment slots handled by <code>$insert()</code>. Dynamic <code>&lt;title&gt;</code> content is the exception: it is compiled as one text binding because the browser parses title contents as RCDATA.
      </li>
      <li>
        <strong>Dynamic expressions stay lazy.</strong> <code>props.name</code> becomes a getter
        such as <code>() =&gt; props.name</code>. Vynn can track and update that value without
        rerunning the component function every time it changes.
      </li>
      <li>
        <strong>Component tags become function calls.</strong>{" "}
        <code>&lt;Greeting name="Ada" /&gt;</code> becomes <code>Greeting(propsObject)</code>. Its
        props are represented by getters, so expression-valued props can be read lazily and remain
        reactive. The compiler also turns JSX children into the <code>children</code> prop.
      </li>
      <li>
        <strong>Runtime imports are added automatically.</strong> The compiler imports only the
        helpers needed by that module from <code>vynn/render</code>. These helpers handle element
        creation, insertion, events, attributes, dynamic ranges, and component ownership.
      </li>
    </ol>
    <p>
      So a Vynn component is not a special JSX object. It is a JavaScript function wrapped by
      <code>$cmpnt()</code>, and using it in JSX is compiled into an ordinary function call. The
      wrapper supplies Vynn's owner and lifecycle behavior; the generated render calls handle the
      DOM and reactive updates.
    </p>
    <h2>Own the document from app.tsx</h2>
    <p>
      An application root can return the complete HTML document instead of a body-only subtree.
      Keep the <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> in
      your app component. Vynn compiles that complete tree into one reusable document template.
      Metadata written inside the document's root <code>&lt;head&gt;</code> stays in place as
      ordinary template markup; it is not extracted into individual head-registration calls.
      Dynamic attributes and children are bound directly to nodes in the template.
    </p>
    <CodeBlock
      lang="tsx"
      code={`import type { JSX } from "vynn";

export default function App(props: { children?: JSX.Element }) {
  return (
    <html lang="en-PH">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My Vynn application</title>
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body>
        <main>{props.children}</main>
      </body>
    </html>
  );
}`}
    />
    <p>
      The compiler output follows the same shape: one document template, then navigation to the
      existing nodes only where a binding is needed. No separate <code>&lt;html&gt;</code>,
      <code>&lt;head&gt;</code>, or <code>&lt;body&gt;</code> templates are generated.
    </p>
    <CodeBlock
      lang="ts"
      code={`import {\n  $template as _$template,\n  $child as _$child,\n  $sibling as _$sibling,\n  $insert as _$insert,\n  $finishTemplate as _$finishTemplate,\n  $cmpnt as _$cmpnt,\n} from "vynn/render";\n\nconst _tmpl$ = _$template(
  '<html lang="en-PH"><head><meta charset="UTF-8"><title>My Vynn application</title><link rel="icon" href="/favicon.svg"></head><body><main><!--$v0--></main></body></html>'
);

const App = _$cmpnt(function App(props) {
  const _el$ = _tmpl$();
  const _htmlHead$ = _$child(_el$);
  const _htmlBody$ = _$sibling(_htmlHead$);
  const _main$ = _$child(_htmlBody$);

  _$insert(_main$, () => props.children, "0");
  _$finishTemplate(_el$);
  return _el$;
});`}
    />
    <p>
      This keeps document structure under application control. The Vite app adapter still places
      generated client assets and stylesheets in the authored document head. Route components can
      declare metadata directly, without a head-specific helper:
    </p>
    <CodeBlock
      lang="tsx"
      code={`export default function ProductPage() {
  return (
    <>
      <head>
        <meta name="description" content="A product description" />
        <meta property="og:title" content="Product" />
        <meta property="og:image" content="/product-large.jpg" />
        <meta property="og:image" content="/product-square.jpg" />
      </head>

      <h1>Product</h1>
    </>
  );
}`}
    />
    <p>
      A metadata element outside the document's root <code>&lt;head&gt;</code> is automatically
      placed there. Bare singleton metadata replaces the inherited value with the same identity,
      while bare repeatable Open Graph values such as <code>og:image</code> append to the existing
      collection. A nested <code>&lt;head&gt;</code> creates a replacement group: singleton metadata
      replaces matching inherited values, and repeatable Open Graph properties replace the inherited
      collection while keeping every entry declared by the group. When the route is disposed, the
      previous declarations are restored.
    </p>
    <h2>Compiler options</h2>
    <div class="not-prose my-6 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Option</th>
            <th>Values</th>
            <th>Default</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>lang</code>
            </td>
            <td>
              <code>"js"</code>, <code>"jsx"</code>, <code>"ts"</code>, <code>"tsx"</code>
            </td>
            <td>Inferred from the filename</td>
          </tr>
          <tr>
            <td>
              <code>sourceType</code>
            </td>
            <td>
              <code>"module"</code>, <code>"script"</code>, <code>"unambiguous"</code>
            </td>
            <td>
              <code>"module"</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The filename also defaults to <code>module.tsx</code> when omitted. Pass the real filename
      when possible so language inference and source-map metadata are meaningful.
    </p>
    <h2>Run the transform before other JSX transforms</h2>
    <p>
      The transform lowers Vynn JSX into runtime calls imported from <code>vynn/render</code>. Make
      sure the runtime package is available to the generated module, and run the Vynn transform
      before any other plugin that would lower JSX. Do not run a second JSX transform on the same
      source.
    </p>
    <p>
      The transform is safe to call on a source file without JSX; it returns the source unchanged.
      When JSX is present, the compiler parses the module, lowers Vynn-specific JSX behavior, and
      prints the transformed module with source-map support.
    </p>
    <h2>What is in vynn/render?</h2>
    <p>
      The compiler lowers JSX into small calls from <code>vynn/render</code>. The entry point is
      exported so transformed modules can import it, but these helpers are implementation-level
      building blocks. Application components should normally use JSX and the public APIs from
      <code>vynn</code> instead of calling the helpers directly.
    </p>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Helper</th>
            <th>Compiler runtime responsibility</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>$template()</code>
            </td>
            <td>Creates a reusable HTML or SVG template factory from static markup.</td>
          </tr>
          <tr>
            <td>
              <code>$child()</code> and <code>$sibling()</code>
            </td>
            <td>
              Navigate to authored child and sibling nodes in a template, including nodes that
              hydration has claimed.
            </td>
          </tr>
          <tr>
            <td>
              <code>$finishTemplate()</code>
            </td>
            <td>
              Completes the remaining static hydration claims after dynamic template bindings.
            </td>
          </tr>
          <tr>
            <td>
              <code>$attr()</code>
            </td>
            <td>Applies and reactively updates an element attribute or property.</td>
          </tr>
          <tr>
            <td>
              <code>$on()</code>
            </td>
            <td>Registers an event listener tied to the current owner lifetime.</td>
          </tr>
          <tr>
            <td>
              <code>$spread()</code>
            </td>
            <td>Applies a reactive set of spread props, including event and ref bindings.</td>
          </tr>
          <tr>
            <td>
              <code>$insert()</code>
            </td>
            <td>Inserts child content into an element and synchronizes reactive children.</td>
          </tr>
          <tr>
            <td>
              <code>$nodes()</code>
            </td>
            <td>Maintains a dynamic node range across reactive updates and hydration.</td>
          </tr>
          <tr>
            <td>
              <code>$text()</code>
            </td>
            <td>
              Creates a static fragment text node and claims its server-rendered counterpart in
              source order during hydration.
            </td>
          </tr>
          <tr>
            <td>
              <code>$if()</code>
            </td>
            <td>Switches between conditional branches.</td>
          </tr>
          <tr>
            <td>
              <code>$for()</code>
            </td>
            <td>Reconciles repeated list entries by item identity.</td>
          </tr>
          <tr>
            <td>
              <code>$cmpnt()</code>
            </td>
            <td>Wraps a component invocation in its own owner and lifetime.</td>
          </tr>
          <tr>
            <td>
              <code>$cache()</code>
            </td>
            <td>Memoizes a getter as a reusable zero-argument reader.</td>
          </tr>
          <tr>
            <td>
              <code>$registerHead()</code>
            </td>
            <td>Registers metadata emitted from ordinary JSX elements.</td>
          </tr>
          <tr>
            <td>
              <code>$registerHeadGroup()</code>
            </td>
            <td>Creates the replacement scope emitted for a nested JSX <code>&lt;head&gt;</code>.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Fragment text is emitted through <code>$text()</code> rather than left as a raw string value.
      It creates the text node and claims the matching server-rendered node immediately, preserving
      source order when a fragment mixes static text and dynamic children. This prevents a later
      dynamic child from consuming a text node that belongs to an earlier literal.
    </p>
    <h2>HTML and SVG namespaces during hydration</h2>
    <p>
      Vynn tracks the current DOM namespace while creating child templates and claiming
      server-rendered nodes. An <code>&lt;svg&gt;</code> element enters the SVG namespace, children
      of <code>&lt;foreignObject&gt;</code> use the HTML namespace, and a nested
      <code>&lt;svg&gt;</code> inside that HTML content enters the SVG namespace again. Hydration
      checks both an element's tag and its namespace, so a valid SVG node is not mistaken for an
      HTML element with the same tag name.
    </p>
    <CodeBlock
      lang="tsx"
      code={`function MixedGraphic() {
  return (
    <svg viewBox="0 0 120 80">
      <foreignObject x="0" y="0" width="120" height="80">
        <div class="graphic-frame">
          <svg viewBox="0 0 20 20">
            <path d="M2 10 L8 16 L18 4" />
          </svg>
        </div>
      </foreignObject>
    </svg>
  );
}`}
    />
    <p>
      Treat the helper list as a runtime map, not a recommendation to hand-author generated output.
      These helpers coordinate DOM creation, ownership, reactive updates, and hydration markers;
      importing only one of them outside compiler output does not replace the surrounding runtime
      behavior.
    </p>
    <h2>TypeScript configuration</h2>
    <p>Leave JSX in the source for Vynn's compiler and use Vynn's JSX types:</p>
    <CodeBlock
      lang="json"
      code={
        '{\n  "compilerOptions": {\n    "target": "ESNext",\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "jsx": "preserve",\n    "jsxImportSource": "vynn",\n    "strict": true,\n    "noEmit": true\n  }\n}'
      }
    />
    <h2>Plugin options</h2>
    <p>
      The default <code>vynn()</code> plugin accepts these application options:
    </p>
    <ul>
      <li>
        <code>ssr</code>: enable server rendering and automatic hydration.
      </li>
      <li>
        <code>ssrMode</code>: choose <code>"sync"</code>, <code>"async"</code>, or{" "}
        <code>"stream"</code>; defaults to <code>"stream"</code>.
      </li>
      <li>
        <code>serverFunctions</code>: enable function-level <code>"use server"</code> transforms,
        optionally with endpoint and request settings.
      </li>
    </ul>
    <p>
      The plugin also exports <code>serverFunctions()</code> for projects that need only the
      server-function transform and handler without the integrated Vynn app plugin. See
      <a href="/docs/guides/server-functions">Server functions</a> for the security and runtime
      details.
    </p>
  </article>
);
export default CompilerPage;