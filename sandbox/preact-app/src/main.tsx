import { hydrate } from "preact";
import App from "./app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The root element was not found.");
}

hydrate(<App />, root);
