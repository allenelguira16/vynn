import { CodeBlock } from "../components/CodeBlock";

export const TypesPage = () => (
  <div>
    <h1>TypeScript types</h1>
    <section>
      <p>
        The <code>vynn</code> package exports types for JSX values, component props, reactive
        references, and server-render modes. These are type-only exports; they do not add runtime
        behavior to an application.
      </p>

      <h2 class="mt-6">JSX.Element</h2>
      <p>
        <code>JSX.Element</code> is the type used for a Vynn-renderable JSX value. It includes
        primitive text and number values, DOM nodes, arrays of elements, and empty values such as{" "}
        <code>null</code>,<code>undefined</code>, and <code>false</code>.
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

      <h2 class="mt-6">FC</h2>
      <p>
        <code>FC&lt;Props&gt;</code> describes a function component that receives a props object and
        returns a <code>JSX.Element</code>. Its props type defaults to <code>object</code>.
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

      <h2 class="mt-6">PropsWithChildren</h2>
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

      <h2 class="mt-6">PropsWithRef</h2>
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

      <h2 class="mt-6">Reactive reference types</h2>
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

      <h2 class="mt-6">ComputedOptions</h2>
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

      <h2 class="mt-6">RenderMode</h2>
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

      <h2 class="mt-6">Importing types</h2>
      <p>
        Use <code>import type</code> for type-only imports so these helpers are erased from emitted
        JavaScript. The package root exports
        <code>JSX</code>, <code>FC</code>, <code>PropsWithChildren</code>,<code>PropsWithRef</code>,{" "}
        <code>State</code>, <code>Async</code>,<code>Computed</code>, <code>ComputedOptions</code>,
        and
        <code>RenderMode</code>.
      </p>
    </section>
  </div>
);
