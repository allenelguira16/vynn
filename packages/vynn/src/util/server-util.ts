export const isServer = typeof window === "undefined";

export let isServerStreaming = false;
export const setIsServerStreaming = (newValue: boolean) => (isServerStreaming = newValue);
