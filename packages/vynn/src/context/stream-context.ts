import { MemoState } from "~/util/memo";

declare global {
  var __stream_context: StreamContext;
  var __resource: any[] | undefined;
}

export type StreamContext = {
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController<Uint8Array>;
  start: () => void;
  end: () => void;
};

/**
 * Get current stream context use in streaming,
 * If used in client, it will use a single context
 * Otherwise it will use AsyncLocalStorage for per context streaming
 *
 * @returns current stream context
 */
export const getCurrentStream = () => {
  // if (!isServer)
  // globalThis.__stream_context ??= {};

  // if (!(globalThis as any).__stream_context) throw new Error("No active stream");
  return globalThis.__stream_context as StreamContext;
};

/**
 * Isolated stream per request
 */
export let runWithStream: (ctx: StreamContext, fn: () => void) => void;

export const clienStreamMap = new Map<
  StreamContext | Window,
  {
    suspenseID: number;
    resourceID: number;
    lazyID: number;
    stateID: number;
    memo: Map<() => any, MemoState<any, any>>;
  }
>();

const defaultStreamContext = {
  suspenseID: 0,
  resourceID: 0,
  lazyID: 0,
  stateID: 0,
  memo: new Map(),
};

export const clientStreamContext = () => {
  const context = getCurrentStream();

  if (!clienStreamMap.has(context)) clienStreamMap.set(context, defaultStreamContext);

  const value = clienStreamMap.get(context)!;

  if (!value) throw new Error("[vynn]: context does not exists");

  return value;
};

export const resetClientStreamContext = () => {
  // const context = getCurrentStream();

  // console.log(clienStreamMap.get(context));
  // clienStreamMap.clear();

  clientStreamContext().memo.clear();
  clientStreamContext().lazyID = 0;
  clientStreamContext().resourceID = 0;
  clientStreamContext().stateID = 0;
  clientStreamContext().suspenseID = 0;
};
