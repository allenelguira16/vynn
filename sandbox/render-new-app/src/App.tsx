import "./style.css";
import "./router.css";
import { Router, toFileRouter } from "vynn-router/render_new";

const routes = toFileRouter("/src/pages");

export default function App(props: { url: string }) {
  return (
    <html lang="en-PH">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="An interactive browser sandbox for Vynn's new renderer and native router."
        />
        <title>Vynn render_new</title>
      </head>
      <body>
        <Router routes={routes} url={props.url} />
      </body>
    </html>
  );
}
