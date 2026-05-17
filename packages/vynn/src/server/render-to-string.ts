import { clientStreamContext } from "~/context/stream-context";
import { JSX } from "~/types/jsx";

/**
 * render an application into a string.
 *
 * @param App root application
 * @returns stream
 */
export function renderToString(App: () => JSX.Element) {
  const memoStore = clientStreamContext().memo;
  memoStore.clear();

  return App() as string;
}
