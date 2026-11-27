import { renderToDOM } from "vynn/client";
import App from "@benchmark-app";

// This fixture compares component rendering, so mount the shared <main>
// component into the document body rather than using Vynn's full-document app entry.
renderToDOM(App, document.body);
