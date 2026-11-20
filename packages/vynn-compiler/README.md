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

## SSR compiler

The server compiler is a separate entry point and does not use the client
compiler's template or hydration lowering:

```ts
import { transformVynnSsr } from "vynn-compiler/ssr";

const code = transformVynnSsr(source, "App.tsx");
```

Host JSX is emitted as HTML string expressions. Dynamic text and attributes
use the SSR HTML serializers from `vynn/server`. Component JSX remains an
ordinary function call with lazy getter props, including its `children`
getter. For example, `<Await fallback={<Loading />}>...</Await>` lowers to
`Await({ get fallback() { ... }, get children() { ... } })`; the compiler
does not special-case built-in components.

This is the initial compiler target. The Vite plugin and `renderToServer()`
still use the existing renderer until the string-based async renderer is
implemented and integrated. The transform currently returns no source map.
