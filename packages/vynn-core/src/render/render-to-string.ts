import { JSX } from "../types/jsx";

export function renderToString(App: () => JSX.Element) {
  // console.log(App);
  return App();
}
