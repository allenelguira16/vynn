export type RenderMode = "sync" | "async" | "stream";

let currentBoundary: RenderMode | null = null;

export function getRenderMode(): RenderMode | null {
  return currentBoundary;
}

export function withRenderMode<T>(mode: RenderMode, callback: () => T): T {
  currentBoundary = mode;

  return callback();
}
