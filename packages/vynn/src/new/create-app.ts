import { JSX } from "~/types/jsx";

export function createApp(App: () => JSX.Element) {
  console.log(App);
}
