import { resetRuntimeContext } from "~/context/runtime-context";
import { JSX } from "~/types/jsx";

import { normalizeToString } from "./normalize-to-string";

/**
 * render an application into a string.
 *
 * @param App root application
 * @returns stream
 */
export function renderToString(App: () => JSX.Element) {
  resetRuntimeContext();

  return normalizeToString(App) || "";
}
