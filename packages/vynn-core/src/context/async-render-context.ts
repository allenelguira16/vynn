import { getContext, setContext } from "../life-cycle/owner";

export type AsyncRenderContext = {
  values: Record<string, unknown>;
  reservations: Set<string>;
};

type AsyncRenderContextProvider = {
  get(): AsyncRenderContext | undefined;
};

const ASYNC_RENDER_CONTEXT = Symbol("vynn.async-render-context");
const SERVER_ASYNC_RENDER_CONTEXT_PROVIDER = Symbol.for("vynn.async-render-context-provider.v1");

function getServerProvider(): AsyncRenderContextProvider | undefined {
  const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
  return globals[SERVER_ASYNC_RENDER_CONTEXT_PROVIDER] as
    | AsyncRenderContextProvider
    | undefined;
}

/**
 * Resolve request-scoped SSR state first. The browser has no server provider,
 * so client hydration falls back to the active owner context.
 */
export function getAsyncRenderContext(): AsyncRenderContext | undefined {
  return getServerProvider()?.get() ?? getContext<AsyncRenderContext>(ASYNC_RENDER_CONTEXT);
}

/** Initialize client/test context; SSR context is created by AsyncLocalStorage. */
export function initializeAsyncRenderContext(): void {
  if (getServerProvider()?.get()) return;

  setContext<AsyncRenderContext>(ASYNC_RENDER_CONTEXT, {
    values: Object.create(null) as Record<string, unknown>,
    reservations: new Set<string>(),
  });
}
