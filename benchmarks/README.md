# Framework size benchmarks

This workspace compares the minimum production client payload produced by Vynn, Solid 2, Svelte 5, and React 19.

The benchmark measures three scenarios:

- **Minimal**: mount a component that renders the same small static markup.
- **Counter**: render the same markup plus synchronous reactive state, a derived value, and an increment button.
- **Async**: render the same markup plus an async derived value, a reactive input that invalidates it, and a loading boundary.

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
pnpm bench:size -- --scenario async
```

The full run prints the async increment over the counter for both the initial JavaScript graph and all emitted assets. Run the full command when comparing the async delta; the single-scenario command is useful for a focused build but does not include the counter baseline.

The script builds each framework in production mode with Vite 8.3.6, the Oxc minifier, and an ES2022 target. It then reads each Vite manifest to identify the initial entry's static import graph. Dynamic imports are excluded from the initial payload. All emitted JavaScript and CSS are measured separately as a second figure.

Results are written to `benchmarks/results/latest.json`. The results directory is generated locally and is not committed.

## What is measured

For both the initial entry graph and all emitted assets, the report records:

- Raw JavaScript and CSS bytes.
- Gzip bytes (level 9).
- Brotli bytes (quality 11).
- Asset counts.

Compressed totals are calculated by compressing each emitted resource independently and summing the results. That reflects separate HTTP resources more closely than compressing all files as one artificial archive.

HTML documents, manifests, source maps, compression sidecars, and build tooling are excluded. CSS is measured separately so the JavaScript comparison remains visible.

## Fairness and limitations

The **minimal** scenario measures the cost of mounting and rendering a tiny application, not the unpacked size of a package on npm. It includes the framework and renderer code needed by that app. The **counter** scenario adds a synchronous reactive workload. The **async** scenario adds an async derived value and a loading boundary. Each framework uses its native async-read pattern; the fallback is configured to show on both initial load and subsequent invalidations so the UI behavior is comparable.

The applications use their frameworks' normal client entry points:

- Vynn's integrated client-only app entry and `renderToDOM`.
- Solid's `@solidjs/web` `render`.
- Svelte 5's `mount`.
- React's `createRoot`.

All framework and bundler versions are pinned in the app manifests and workspace lockfile. The source is intentionally tiny and contains no CSS. The same bundler, target, minifier, and output settings are used for each app.

This is a controlled application-payload benchmark, not a claim that one framework is universally fastest or smallest. Runtime performance, hydration, SSR, memory, and larger workloads are separate benchmarks and should not be inferred from these bundle numbers.
