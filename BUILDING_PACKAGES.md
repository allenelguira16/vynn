# Building Vynn packages

Each workspace package owns its Rolldown configuration and build command.
Shared configuration and defaults live in `build/rolldown.ts`; the root
manifest only provides build orchestration and shared tooling dependencies.

## Build commands

Build every package in workspace dependency order:

```sh
pnpm build:packages
```

Build one package independently:

```sh
pnpm --filter vynn build
pnpm --filter vynn-router build
pnpm --filter vynn-compiler build
pnpm --filter vite-plugin-vynn build
```

The root command selects the four package names explicitly and delegates to
pnpm's recursive workspace runner. Packages with workspace dependencies are
built after their dependencies. Each package invokes its own
`rolldown.config.ts`, so a package build never builds unrelated packages.

## Package outputs

| Package | JavaScript entry points |
| --- | --- |
| `vynn` (`packages/vynn-core`) | `index`, `jsx-runtime`, `render`, `client`, `server`, `server/node`, `server-functions/client`, `server-functions/server` |
| `vynn-router` | `index` |
| `vynn-compiler` | `index`, `server-functions` |
| `vite-plugin-vynn` | `index` |

Each package writes to its own `dist/` directory. Shared internal modules are
code-split into `dist/chunks/`; public entry filenames remain stable and
correspond to the current public subpaths. The output is ESM targeting ES2022.
Node built-ins and each package's declared dependencies, peer dependencies,
and optional dependencies remain external.

The router build runs Vynn's build-tool-independent Oxc JSX transform before
Rolldown lowers TypeScript and bundles the module graph. It declares
`vynn-compiler` as a development dependency because the transform is needed
only while building the router. It is the only package that enables this transform.

## Shared build configuration

`build/rolldown.ts` owns the common build defaults:

- ES module output targeting ES2022;
- package-local `dist/` output and stable entry filenames;
- shared chunk and asset naming;
- externalization of Node built-ins and manifest-declared dependencies;
- TypeScript Go declaration generation through `rolldown-plugin-dts`.

Each package's `rolldown.config.ts` owns only its entry points and
package-specific transforms. Each package's `build` script runs Rolldown
from that package's working directory.

## Declaration generation

Each package has a dedicated `tsconfig.build.json`. The shared config uses
`rolldown-plugin-dts` with its TypeScript Go (`tsgo`) generator. It resolves
the workspace-root TypeScript installation via `import.meta.resolve`, so all
packages use the same compiler version.

The root manifest pins `typescript@7.1.0-beta` for pre-release validation.
The build config explicitly selects `tsgo`; it does not rely on automatic
generator detection or the deprecated TypeScript 7.0 CLI fallback. The dts
plugin owns declaration emission. Declaration maps are disabled, while
JavaScript source maps remain enabled.

## Tooling prerequisites

The root development dependencies provide:

- `rolldown: ^1.3.3`
- `rolldown-plugin-dts: ^0.30.2`
- `typescript: 7.1.0-beta`

The dts plugin requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0`.

Because TypeScript 7.1 stable is not yet available when this branch is
prepared, the manifest is pinned to the beta for validation. Once stable
TypeScript 7.1.0 is published, update the root dependency to `^7.1.0` and
run `pnpm install` to refresh `pnpm-lock.yaml`.

The native Rolldown config loader is intentional. It imports TypeScript
configs directly and preserves normal Node module resolution for the shared
helper and package-local compiler dependencies.

## Package resolution

The package manifests now point `main`, `types`, and existing `exports`
entries to generated `dist/` files. The `types` condition comes before
`import`, as required for TypeScript's conditional export resolution. The
Vite plugin keeps its existing lack of an `exports` map; only its `main`
and `types` fallback fields are updated, avoiding a new restriction on
previously reachable subpaths.

Build the workspace packages before running apps or tests that import these
workspace packages by name:

```sh
pnpm build:packages
```

The source files remain in each package's `src/` directory, but package-name
resolution now targets `dist/`. This keeps the workspace exercising the same
built entry points that consumers will receive.

Once TypeScript 7.1 is installed and the package build succeeds, validate
consumer resolution, SSR/client isolation, runtime singleton identity, and
every declaration entry point before merging the distribution change.
