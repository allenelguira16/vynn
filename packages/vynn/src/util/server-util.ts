export const isServer = typeof window === "undefined";

(globalThis as any).isServerStreaming = false;
export const isServerStreaming = () => (globalThis as any).isServerStreaming as boolean;
export const setisServerStreaming = (newValue: boolean) =>
  ((globalThis as any).isServerStreaming = newValue);
