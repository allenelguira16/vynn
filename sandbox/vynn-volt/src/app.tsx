import "./main.css";

import { AppProps } from "@vynn/volt";

export default function App({ assets, scripts, children }: AppProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vynn App</title>
        {assets}
      </head>
      <body>
        <div id="app">{children()}</div>
        {scripts}
      </body>
    </html>
  );
}
