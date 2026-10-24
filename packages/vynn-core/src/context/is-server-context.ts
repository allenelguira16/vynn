import { getRenderMode } from "./render-mode";

export function isServer() {
  return !!getRenderMode();
}
