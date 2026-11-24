import { render } from "preact";
import App from "@benchmark-app";

const target = document.getElementById("root");

if (!target) {
  throw new Error("Benchmark root element was not found.");
}

render(<App />, target);
