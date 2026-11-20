import type { SsrHeadManager } from "./head";
import type { RequestContext } from "./server-function-context";

/** Result shared by the independent SSR renderers and HTTP adapters. */
export interface SsrRenderResult<TBody> {
  readonly body: TBody;
  readonly head: SsrHeadManager;
  readonly modules: ReadonlySet<string>;
  /** Request metadata written by server functions during this SSR render. */
  readonly response?: RequestContext["response"];
}
