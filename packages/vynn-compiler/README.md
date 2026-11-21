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
- `runtimeTarget`: `"client"` or `"server"`. Defaults to `"client"`.

The output imports generated helpers from `vynn/render/client` by default.
Set `runtimeTarget: "server"` to generate imports from `vynn/render/server`.
The Vite plugin selects the target automatically for client and SSR transforms.
There is no `vynn/render` umbrella entry; use the explicit client or server
subpath when importing render helpers directly. Generated local aliases keep
the helper's `$` prefix while adding a leading underscore, for example
`$cmpnt as _$cmpnt`. The underscore marks a compiler-generated binding without
hiding which Vynn runtime helper it refers to. Numeric suffixes are added only
when needed to avoid a name collision.

Run this transform before any other JSX transform; do not run a second JSX
lowering pass on the same source.
