declare global {
  var __stream_context: StreamContext;
  var __resource: any[] | undefined;
}

export type StreamContext = {
  encoder: TextEncoder;
  controller: ReadableStreamDefaultController<Uint8Array>;
  // start: () => void;
  // end: () => void;
  promises: Promise<any>[];
};

/**
 * Get current stream context use in streaming,
 * If used in client, it will use a single context
 * Otherwise it will use AsyncLocalStorage for per context streaming
 *
 * @returns current stream context
 */
export const getStream = () => {
  return globalThis.__stream_context as StreamContext;
};
