// Hydration
import "./main.css";

import { App } from "./app";
import { hydrateToDOM } from "vynn/render";
import { $location } from "vynn-router";

hydrateToDOM(() => {
  return App({ url: $location.pathname });
}, "#app");
