# Vynn Compiler

The Vynn compiler transforms Vynn JSX and TypeScript/JavaScript modules into
calls to the Vynn runtime. It is independent of Vite and can be integrated
into any build tool that supports source transforms.

## Programmatic usage

```ts
import { transformVynnOxc, transformVynnOxcWithMap } from "vynn-compiler";

const code = transformVynnOxc(source, "App.tsx");
const result = transformVynnOxcWithMap(source, "App.tsx");
```

Both functions accept optional compiler settings:

- `lang`: `"js"`, `"jsx"`, `"ts"`, or `"tsx"`. Defaults to the inferred
  language from the filename.
- `sourceType`: `"module"`, `"script"`, or `"unambiguous"`. Defaults to
  `"module"`.

The output imports generated helpers from `vynn/render`, so transformed
applications must include the `vynn` runtime package. Generated local aliases keep
the helper's `$` prefix while adding a leading underscore, for example
`$cmpnt as _$cmpnt`. The underscore marks a compiler-generated binding without
hiding which Vynn runtime helper it refers to. Numeric suffixes are added only
when needed to avoid a name collision.

Run this transform before any other JSX transform; do not run a second JSX
lowering pass on the same source.


## Experimental `render_new` target

The compiler also exposes a separate, experimental target for Vynn's independent
`render_new` runtime:

```ts
import { transformVynnRenderNewOxc } from "vynn-compiler/render-new";

const code = transformVynnRenderNewOxc(source, "App.tsx");
```

This target emits `DOMTemplateProgram`-shaped values containing static template
markup, numeric node references, and reactive binding accessors. Template
definitions are hoisted and deduplicated at module scope; each component call
creates fresh accessors while reusing the same static definition. It does not
import or call the legacy `vynn/render` helpers and does not change the output
of `transformVynnOxc()`.

The current target supports named function components with direct JSX
returns, static host markup, reactive attributes and properties, event handlers,
comment-ranged dynamic children, nested component programs, conditional JSX
expressions, and array expressions such as `.map(item => <Row />)`. Component
props are emitted as lazy getters so reactive values remain live. Component
children are available through a `children` getter.

Dynamic slots accept nullish/boolean values, strings, numbers, bigints, DOM
nodes on the client, arrays, and nested component template programs. Array
updates currently replace the contents of the slot; keyed identity and
incremental list reconciliation are not implemented. The compiler still
rejects JSX spreads, refs, raw-HTML bindings, dynamic style objects,
member-expression component tags, and parser-sensitive contexts such as
tables, selects, and textareas. JSX must be returned directly from a named
component function or appear inside one of its compiled JSX expressions.

Generated components return a `DOMTemplateProgram`; they do not mount
themselves. Use `mountRenderNew(parent, App())` for client rendering,
`renderTemplateProgramToString(App())` for synchronous HTML serialization,
and `hydrateRenderNew(parent, App())` for DOM hydration. The matching Vite
adapter is `vynnRenderNewOxcPlugin()` from `vite-plugin-vynn`.


This target is experimental. It does not yet emit source maps, SSR output,
hydration instructions, structural child instructions, or an automatic Vite
integration.
