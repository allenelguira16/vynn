import { JSX } from "~/jsx-runtime";

/**
 * render an application into a string.
 *
 * @param App root application
 * @returns stream
 */
export function renderToString(App: () => JSX.Element) {
  return App() as string;
}
