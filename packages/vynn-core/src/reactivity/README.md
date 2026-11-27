# Unified reactive graph

This directory contains the single reactive implementation exported by `vynn-core` and used by the core renderer. Synchronous and asynchronous primitives share one dependency graph, scheduler, and resource runtime.

## Runtime

- One dependency graph handles synchronous and asynchronous computations.
- `$state` and `$computed` accept synchronous values or PromiseLike results.
- Signal-accepting computed getters, async state initializers, and async store initializers receive an `AbortSignal`. A new computed run aborts the previous signal; state writes and owner disposal abort an in-flight initializer. Stale Promise settlements are ignored even when a callback does not cooperate with cancellation. State and computed share the controller-slot and Promise-settlement helpers in `async/resource.ts`, keeping cancellation and stale-run checks consistent.
- Derived computations flush first, renderer effects second, and normal effects third. Renderer effects stay synchronous; ordinary `$effect` callbacks retain Vynn's microtask timing.
- Effects return a disposer and may return cleanup callbacks. Effects and computed subscriptions are disposed with their Vynn owner.
- Pending reads throw `PendingReadError`, which extends Vynn's shared `NotReadyError`. This lets existing `Await`, conditional rendering, deferred SSR nodes, and streaming SSR understand the new graph's pending state.
- Pending reads register with the active `Await` boundary through the small async-boundary context. Rejected computed/state reads are routed through the owning `Catch` boundary when they occur inside an effect.
- Async resource IDs and serialized values belong to a request-local runtime registry, not the Owner tree. Each component identity scope has a local resource-slot counter; each initializer execution gets a fresh nested slot cursor so descendants reuse the same IDs across retries. State hydration recreates nested resource slots with the optional fake-async probe, then consumes the serialized one-shot value. Computed hydration replays the getter's synchronous portion to recollect dependencies, then uses the serialized result. The Owner only receives resource cleanup callbacks. The runtime serializes resolved resource values without allocating child Owners or coupling resource identity to Owner identity.
- `$store` supports deep object/array/Map/Set reactivity, keyed WeakMap/WeakSet reactivity, raw/proxy identity in array searches, ref unwrapping on object properties, and in-place reconciliation for object initializers. Async root initializers must resolve to a plain object; nested arrays and collections are supported.
- `batch`, `transaction`, and `untrack` are shared graph operations.

## Async tracking boundary

Dependency collection is synchronous by default. When the runtime exposes the native `AsyncContext.Variable` API, the graph uses it to carry a versioned computation context across async continuations, so reads after `await` are tracked without a shared global. In runtimes without that API, reads first performed after `await` remain untracked.

The TC39 Async Context proposal is still Stage 2, and web-platform propagation is a separate part of the work. Vynn therefore detects the API at runtime and does not assume that every browser provides it. Capturing every active async computation in a global variable would cross-contaminate concurrent work, so that fallback is deliberately not used.

Capture reactive inputs before suspending:

```ts
const user = $computed(async (signal) => {
  const id = userId.value;
  const response = await fetchUser(id, { signal });
  return response;
});
```

This does not subscribe to `userId`:

```ts
const user = $computed(async () => {
  const response = await fetchUser();
  return responseFor(userId.value);
});
```

## Remaining validation and limitations

- Reads first performed after `await` are supported only in runtimes that expose native `AsyncContext.Variable`; other runtimes retain synchronous-only dependency tracking.
- Cancellation is cooperative. A getter must pass the supplied signal to `fetch` or another cancellable operation; version checks still prevent stale results from being committed.
- SSR and streaming use the existing Vynn pending-node pipeline through the shared suspension error. Async state/computed values participate in SSR serialization and hydration, but the complete request/hydration matrix still needs browser and server integration tests.
- The scheduler has derived/render/effect priority, but it has not yet been benchmarked against every renderer lifecycle and nested batch scenario.
- The new runtime registry and resource-slot model have not yet been validated with browser hydration, streaming SSR, TypeScript, or the full Vitest suite. Do not treat the refactor as production-validated until those checks pass.
- The graph tests are in `../../tests/reactivity-graph.test.ts`; runtime indexing and hydration tests are in `../../tests/runtime-async-resources.test.ts`. Run them with `pnpm --filter vynn test tests/reactivity-graph.test.ts tests/runtime-async-resources.test.ts`.

## Runtime ownership

Owner instances provide lifecycle and component identity. The async runtime independently allocates resource slots and stores SSR values for hydration. No legacy Owner-ID resource reservations or identity transactions are used.
