import { resetClientStreamContext } from "~/context/stream-context";
import { JSX } from "~/types/jsx";

import { normalizeToString } from "./normalize-to-string";

/**
 * render an application into a string.
 *
 * @param App root application
 * @returns stream
 */
export function renderToString(App: () => JSX.Element) {
  resetClientStreamContext();

  return normalizeToString(App) || "";
}

// function minifyHTML(html: string) {
//   console.log(html);
//   return html
//     .replace(/\>[\r\n ]+\</g, "><") // Remove spaces between tags
//     .replace(/(<.*?>)|\s+/g, (_, $1) => ($1 ? $1 : " ")) // Collapse multiple spaces to one
//     .trim();
// }
