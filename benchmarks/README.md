# Framework size benchmarks

This workspace compares the minimum production client payload produced by Vynn, Solid 2, Svelte 5, and React 19.

The cross-framework comparison uses two scenarios:

- **Minimal**: mount a component that renders the same small static markup.
- **Counter**: render the same markup plus reactive state, a derived value, and an increment button.

These are standalone client-rendered Vite apps. They do not use routers, SSR adapters, CSS frameworks, icon libraries, or shared app utilities. Each framework uses its idiomatic public API.

## Run the cross-framework comparison

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

The Vynn-only trace builds the same client entry under five progressively richer scenarios:

```sh
pnpm bench:vynn
```

- **Minimal**: static template and mount path.
- **State**: one `$state(0)` value rendered as dynamic text.
- **Computed**: state plus a synchronous `$computed` value.
- **Event**: state, dynamic text, and an event handler.
- **Counter**: state, computed value, dynamic text, and event handler.

Each build emits `module-report.json` from Rolldown's chunk metadata. The report records each included module's rendered length and rendered exports. Rolldown's `renderedLength` is measured after tree-shaking but before final chunk minification, so it is useful for finding retained modules but is not a per-module gzip measurement.

The trace is written to `benchmarks/results/vynn-trace.json`. It includes the final entry's raw, gzip, and Brotli sizes plus the module-level report. Use the differences between scenarios to see which modules enter the bundle when state, computed values, and event handling are added.

## What is measured

For the cross-framework report, initial static import graph and all emitted JavaScript/CSS assets are measured separately. The report records raw, gzip (level 9), and Brotli (quality 11) bytes for JavaScript and CSS independently.

Compressed totals are calculated by compressing each emitted resource independently and summing the results. HTML documents, manifests, source maps, compression sidecars, and build tooling are excluded.

## Fairness and limitations

The **minimal** scenario measures the cost of mounting and rendering a tiny application, not the unpacked size of a package on npm. It includes the framework and renderer code needed by that app. The **counter** scenario adds a small reactive workload.

The applications use their frameworks' normal client entry points:

- Vynn's integrated client-only app entry and `renderToDOM`.
- Solid's `@solidjs/web` `render`.
- Svelte 5's `mount`.
- React's `createRoot`.

All framework and bundler versions are pinned in the app manifests and workspace lockfile. The source is intentionally tiny and contains no CSS. The same bundler, target, minifier, and output settings are used for each app.

This is a controlled application-payload benchmark, not a claim that one framework is universally fastest or smallest. Runtime performance, hydration, SSR, memory, and larger workloads are separate benchmarks and should not be inferred from these bundle numbers.
