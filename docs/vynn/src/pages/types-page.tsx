import { CodeBlock } from "../components/CodeBlock";

export const TypesPage = () => (
  <div>
    <h1>TypeScript types</h1>
    <section>
      <p>
        You can write Vynn components without annotating every return type or reaching for a utility
        type each time. TypeScript can infer a lot on its own. These helpers are useful when you want
        to make a component's public props explicit, share a type between files, or describe a
        reactive value in an API.
      </p>
      <p>
        Everything on this page is a type, not a runtime helper. Import it with
        <code>import type</code> and it will be erased from the emitted JavaScript.
      </p>

      <h2 class="mt-6">What can a component return? JSX.Element</h2>
      <p>
        <code>JSX.Element</code> describes values that Vynn can render. You might use it to
        annotate a component's return type, or when a prop is expected to contain JSX. It includes
        text and number values, DOM nodes, arrays of elements, and empty values such as
        <code>null</code>, <code>undefined</code>, and <code>false</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { JSX } from "vynn";

function Message(): JSX.Element {
  return <p>Hello from Vynn</p>;
}
      `}
      />

      <h2 class="mt-6">Do you want to annotate a component? FC</h2>
      <p>
        <code>FC&lt;Props&gt;</code> is an optional shorthand for a function component's type.
        It describes a component that receives <code>Props</code> and returns a
        <code>JSX.Element</code>. You can also write the function normally and let TypeScript infer
        its return type; use <code>FC</code> when you find the explicit annotation useful.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { FC } from "vynn";

type BadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "warning";
};

const Badge: FC<BadgeProps> = (props) => (
  <span data-tone={props.tone ?? "neutral"}>
    {props.label}
  </span>
);
      `}
      />

      <h2 class="mt-6">A component that wraps other content</h2>
      <p>
        <code>PropsWithChildren&lt;T&gt;</code> combines your props with a required{" "}
        <code>children</code> property typed as
        <code>JSX.Element</code>. The children property is required in this utility type.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { FC, PropsWithChildren } from "vynn";

type PanelProps = PropsWithChildren<{
  title: string;
}>;

const Panel: FC<PanelProps> = (props) => (
  <section>
    <h2>{props.title}</h2>
    <div>{props.children}</div>
  </section>
);
      `}
      />

      <h2 class="mt-6">A component that exposes a DOM ref</h2>
      <p>
        <code>PropsWithRef&lt;T&gt;</code> adds a required callback ref property. The callback
        receives an <code>HTMLElement</code>. Use it when a component forwards access to one of its
        DOM elements.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { FC, PropsWithRef } from "vynn";

type SearchFieldProps = PropsWithRef<{
  placeholder?: string;
}>;

const SearchField: FC<SearchFieldProps> = (props) => (
  <input
    ref={props.ref}
    type="search"
    placeholder={props.placeholder}
  />
);
      `}
      />

      <h2 class="mt-6">Add types to your reactive values</h2>
      <p>
        <code>State&lt;T&gt;</code> and <code>Async&lt;T&gt;</code> describe writable reactive
        references. <code>Computed&lt;T&gt;</code>
        describes a read-only reactive reference returned by
        <code>$computed()</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $computed, $state } from "vynn";
import type { Async, Computed, State } from "vynn";

const count: State<number> = $state(0);

const total: Computed<number> = $computed(() => count.value * 2);

const remoteCount: Async<number> = $state(async () => {
  const response = await fetch("/api/count");
  return response.json() as Promise<number>;
});
      `}
      />
      <p>
        These aliases describe the reference shapes returned by the corresponding primitives.{" "}
        <code>Async&lt;T&gt;</code> is a semantic alias for the writable async resource reference
        used by the asynchronous APIs.
      </p>

      <h2 class="mt-6">Type the computed options</h2>
      <p>
        <code>ComputedOptions</code> describes the optional configuration accepted by{" "}
        <code>$computed()</code>. Its <code>lazy</code> flag defaults to <code>false</code>. When
        enabled, the first getter evaluation is deferred until the computed value is read.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { ComputedOptions } from "vynn";

const options: ComputedOptions = {
  lazy: true,
};
      `}
      />

      <h2 class="mt-6">Type the server render mode</h2>
      <p>
        <code>RenderMode</code> is the union used by the server renderer:
        <code>"sync"</code>, <code>"async"</code>, or <code>"stream"</code>. It is useful when an
        application passes the chosen SSR mode through its own request-handling layer.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import type { RenderMode } from "vynn";

function renderPage(mode: RenderMode) {
  // Pass mode to renderToServer().
}
      `}
      />

      <h2 class="mt-6">Import types without adding runtime code</h2>
      <p>
        Use <code>import type</code> when you only need a type. TypeScript can then erase the import
        from the generated JavaScript. The package root exports
        <code>JSX</code>, <code>FC</code>, <code>PropsWithChildren</code>,<code>PropsWithRef</code>,{" "}
        <code>State</code>, <code>Async</code>,<code>Computed</code>, <code>ComputedOptions</code>,
        and
        <code>RenderMode</code>.
      </p>
    </section>
  </div>
);
