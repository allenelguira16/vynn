import { render } from "@solidjs/web";
import App from "@benchmark-app";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Benchmark root element was not found.");
}

render(() => <App />, root);
