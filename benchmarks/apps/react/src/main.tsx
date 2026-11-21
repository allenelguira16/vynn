import { createRoot } from "react-dom/client";
import App from "@benchmark-app";

const target = document.getElementById("root");

if (!target) {
  throw new Error("Benchmark root element was not found.");
}

createRoot(target).render(<App />);
