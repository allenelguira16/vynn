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

The initial target intentionally supports a limited subset: named function
components returning host JSX, static host elements and text, standalone
dynamic text nodes, dynamic attributes, common form-control properties, and
event handlers. Dynamic text is stringified and must occupy its own text node;
wrap it in an element when mixing it with static text. It currently rejects
component children, spreads, refs, conditional/list children, mixed
static/dynamic text in one text node, and parser-sensitive HTML contexts such
as tables, selects, and textareas.

Generated component functions return a template program rather than mounting
it. The caller supplies a DOM parent and adapter to
`mountTemplateProgram(parent, program, adapter)` from the new renderer's
internal DOM program module. The runtime is not exposed as a public
`vynn/render_new` package export yet.

This target is experimental. It does not yet emit source maps, SSR output,
hydration instructions, structural child instructions, or an automatic Vite
integration.
