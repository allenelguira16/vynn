import { getContext, setContext } from "../life-cycle/owner";

export type RenderMode = "async" | "stream";

const RENDER_MODE = Symbol("vynn.render-mode");

export function getRenderMode(): RenderMode | null {
  return getContext<RenderMode>(RENDER_MODE) ?? null;
}

export function setRenderMode(mode: RenderMode): void {
  setContext(RENDER_MODE, mode);
}
