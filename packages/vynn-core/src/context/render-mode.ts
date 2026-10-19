import { getOwnerContext, setOwnerContext } from "../life-cycle/owner";

export type RenderMode = "sync" | "async" | "stream";

const RENDER_MODE = Symbol("vynn.render-mode");

export function getRenderMode(): RenderMode | null {
  return getOwnerContext<RenderMode>(RENDER_MODE) ?? null;
}

export function setRenderMode(mode: RenderMode): void {
  setOwnerContext(RENDER_MODE, mode);
}
