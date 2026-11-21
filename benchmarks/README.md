# Framework size benchmarks

This workspace compares the minimum production client payload produced by Vynn, Solid 2, Svelte 5, and React 19.

The cross-framework comparison measures two scenarios:

- **Minimal**: mount a component that renders the same small static markup.
- **Counter**: render the same markup plus reactive state, a derived value, and an increment button.

These are standalone client-rendered Vite apps. They do not use routers, SSR adapters, CSS frameworks, icon libraries, or shared app utilities. Each framework uses its idiomatic public API.

## Versions

The benchmark pins Vite 8.3.6 across all four apps and uses the framework versions already present in the repository's sandbox lockfile:

- Vynn: workspace source from the checked-out revision.
- Solid 2: `solid-js` and `@solidjs/web` 2.0.0-rc.18 (matching the existing Solid sandbox).
- Svelte: 5.59.1.
- React: 19.3.1.

The Solid version is deliberately aligned with the existing sandbox so both measurements use the same release. Update the pin when benchmarking a newer Solid release, and retain the version in the report.

## Run

From the repository root:

```sh
pnpm install
pnpm bench:size
```

Build only one scenario:

```sh
pnpm bench:size -- --scenario minimal
pnpm bench:size -- --scenario counter
```

The script builds each framework in production mode with Vite 8.3.6, the Oxc minifier, and an ES2022 target. It then reads each Vite manifest to identify the initial entry's static import graph. Dynamic imports are excluded from the initial payload. All emitted JavaScript and CSS are measured separately as a second figure.

Results are written to `benchmarks/results/latest.json`. The results directory is generated locally and is not committed.

## Trace Vynn's reactive costs

The Vynn-only trace builds seven focused scenarios:

```sh
pnpm bench:vynn
```

- **Minimal**: static template and mount path.
- **Cell**: `$state(0)` is read by the app but is not rendered reactively.
- **Dynamic**: dynamic text binding without reactive state.
- **State**: one `$state(0)` value rendered as dynamic text.
- **Computed**: state plus a synchronous `$computed` value.
- **Event**: state, dynamic text, and an event handler.
- **Counter**: state, computed value, dynamic text, and event handler.

Each build emits Rolldown chunk metadata with the retained modules' `renderedLength` and rendered exports. The trace reports final entry gzip/Brotli sizes and pre-minification module lengths. Module lengths are useful for identifying retained code, not exact per-module compressed attribution.

The trace is written to `benchmarks/results/vynn-trace.json`, which is ignored by git.

## What is measured

For both the initial entry graph and all emitted assets, the report records:

- Raw JavaScript and CSS bytes.
- Gzip bytes (level 9).
- Brotli bytes (quality 11).
- Asset counts.

Compressed totals are calculated by compressing each emitted resource independently and summing the results. That reflects separate HTTP resources more closely than compressing all files as one artificial archive.

HTML documents, manifests, source maps, compression sidecars, and build tooling are excluded. CSS is measured separately so the JavaScript comparison remains visible.

## Fairness and limitations

The **minimal** scenario measures the cost of mounting and rendering a tiny application, not the unpacked size of a package on npm. It includes the framework and renderer code needed by that app. The **counter** scenario adds a small reactive workload.

The applications use their frameworks' normal client entry points:

- Vynn's integrated client-only app entry and `renderToDOM`.
- Solid's `@solidjs/web` `render`.
- Svelte 5's `mount`.
- React's `createRoot`.

All framework and bundler versions are pinned in the app manifests and workspace lockfile. The source is intentionally tiny and contains no CSS. The same bundler, target, minifier, and output settings are used for each app.

This is a controlled application-payload benchmark, not a claim that one framework is universally fastest or smallest. Runtime performance, hydration, SSR, memory, and larger workloads are separate benchmarks and should not be inferred from these bundle numbers.
