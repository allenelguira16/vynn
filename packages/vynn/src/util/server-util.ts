export const isServer = typeof window === "undefined";

(globalThis as any).isServerStreaming = false;
export const isServerStreaming = () => (globalThis as any).isServerStreaming;
export const setIsServerStreaming = (newValue: boolean) =>
  ((globalThis as any).isServerStreaming = newValue);
