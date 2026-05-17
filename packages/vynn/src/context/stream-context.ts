import { MemoState } from "~/util/memo";
import { isServer } from "~/util/server-util";

export type StreamContext = {
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController<Uint8Array>;
  tryClose: () => void;
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
  (globalThis as any).__stream_context ??= {};

  // if (!(globalThis as any).__stream_context) throw new Error("No active stream");
  return (globalThis as any).__stream_context as StreamContext;
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

export const clientStreamContext = () => {
  let value:
    | {
        suspenseID: number;
        resourceID: number;
        lazyID: number;
        stateID: number;
        memo: Map<() => any, MemoState<any, any>>;
      }
    | undefined;

  if (!isServer) {
    if (!clienStreamMap.has(window))
      clienStreamMap.set(window, {
        suspenseID: 0,
        resourceID: 0,
        lazyID: 0,
        stateID: 0,
        memo: new Map(),
      });

    value = clienStreamMap.get(window)!;
  } else {
    const context = getCurrentStream();
    if (!clienStreamMap.has(context))
      clienStreamMap.set(context, {
        suspenseID: 0,
        resourceID: 0,
        lazyID: 0,
        stateID: 0,
        memo: new Map(),
      });

    value = clienStreamMap.get(context)!;
  }

  if (!value) throw new Error("[vynn]: context does not exists");

  return value;
};
