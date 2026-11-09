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
applications must include the `vynn` runtime package. Run this transform before
any other JSX transform; do not run a second JSX lowering pass on the same
source.
