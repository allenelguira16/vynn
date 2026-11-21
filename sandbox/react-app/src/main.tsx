import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app";
import "./main.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The root element was not found.");
}

hydrateRoot(
  root,
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
