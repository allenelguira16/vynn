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
      lang="tsx"
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
      lang="tsx"
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
      lang="tsx"
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
      lang="tsx"
      code={
        'import {\n  $cmpnt as _cmpnt,\n  $tmpl as _tmpl,\n  $txt as _txt,\n  $insert as _insert,\n} from "vynn/render";\n\nconst Greeting = _cmpnt(function Greeting(props: { name: string }) {\n  const el1 = _tmpl("h1");\n  _insert(el1, _txt("Hello "));\n  _insert(el1, () => props.name);\n  return el1;\n});\n\nconst App = _cmpnt(function App() {\n  return Greeting({\n    get name() {\n      return "Ada";\n    },\n  });\n});'
      }
    />
    <p>
      This is a simplified view of the generated module. The compiler chooses helper aliases and
      temporary variable names automatically, so the exact formatting and import order may differ.
      The important parts are the transformations:
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
        <code>$tmpl("h1")</code>; static text becomes <code>$txt("Hello ")</code>; and
        <code>$insert()</code> inserts the text and the dynamic child into the element.
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
              <code>$tmpl()</code>
            </td>
            <td>Creates or claims an HTML or SVG element.</td>
          </tr>
          <tr>
            <td>
              <code>$txt()</code>
            </td>
            <td>Creates or claims a text node.</td>
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
              <code>$head()</code>, <code>$headTmpl()</code>
            </td>
            <td>Register and build managed document-head elements.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Treat this list as a runtime map, not a recommendation to hand-author generated output. The
      helpers coordinate DOM creation, ownership, reactive updates, and hydration markers; importing
      only one of them outside compiler output does not replace the surrounding runtime behavior.
    </p>

    <h2>TypeScript configuration</h2>
    <p>Leave JSX in the source for Vynn's compiler and use Vynn's JSX types:</p>
    <CodeBlock
      lang="json5"
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
