import compression from "compression";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { renderToPipeableStream } from "react-dom/server";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === "production";

type StreamOptions = NonNullable<Parameters<typeof renderToPipeableStream>[1]>;
type ServerModule = {
  render: (url: string, options: StreamOptions) => ReturnType<typeof renderToPipeableStream>;
};

async function start() {
  const app = express();
  app.use(compression());

  app.get("/api/pokedex", async (request, response) => {
    try {
      const requestedUrl = request.query.url;

      if (typeof requestedUrl !== "string") {
        response.status(400).json({ error: "A PokéAPI URL is required." });
        return;
      }

      const target = new URL(requestedUrl);

      if (target.origin !== "https://pokeapi.co" || target.pathname !== "/api/v2/pokemon/") {
        response.status(400).json({ error: "Invalid PokéAPI URL." });
        return;
      }

      target.searchParams.set("limit", "20");
      const upstream = await fetch(target);

      if (!upstream.ok) {
        response.status(upstream.status).json({ error: "PokéAPI request failed." });
        return;
      }

      response.json(await upstream.json());
    } catch (error) {
      console.error("PokéDex proxy failed:", error);
      response.status(500).json({ error: "Unable to load Pokémon." });
    }
  });

  let vite: ViteDevServer | undefined;

  if (isProduction) {
    app.use(
      express.static(path.resolve(root, "dist/client"), {
        index: false,
        maxAge: "1y",
        immutable: true,
      }),
    );
  } else {
    vite = await createViteServer({
      root,
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  }

  app.use(async (request, response, next) => {
    try {
      const templatePath = isProduction
        ? path.resolve(root, "dist/client/index.html")
        : path.resolve(root, "index.html");

      let template = await fs.readFile(templatePath, "utf-8");

      if (vite) {
        template = await vite.transformIndexHtml(request.originalUrl, template);
      }

      const serverModule: ServerModule = vite
        ? await vite.ssrLoadModule("/src/entry-server.tsx")
        : await import(pathToFileURL(path.resolve(root, "dist/server/entry-server.js")).href);

      const [head, tail] = template.split("<!--app-html-->");

      if (tail === undefined) {
        throw new Error("The HTML template is missing the app-html marker.");
      }

      const notFound =
        ![
          "/",
          "/lazy",
          "/forms",
          "/contexts",
          "/dropdown-list",
          "/component-error",
          "/non-async-suspense",
          "/stacked-suspense",
          "/poke-dex",
          "/poke-dex-await",
          "/redirect",
        ].includes(request.path) && !/^\/params\/[^/]+\/?$/.test(request.path);

      let didError = false;

      const { pipe, abort } = serverModule.render(request.originalUrl, {
        onShellReady() {
          response.statusCode = notFound ? 404 : didError ? 500 : 200;
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.write(head);

          const stream = new PassThrough();
          stream.on("end", () => {
            if (!response.writableEnded) {
              response.end(tail);
            }
          });

          stream.pipe(response, { end: false });
          pipe(stream);
        },
        onShellError(error) {
          console.error("React SSR shell failed:", error);
          if (!response.headersSent) {
            response.status(500).end("Internal Server Error");
          }
        },
        onError(error) {
          didError = true;
          console.error("React SSR error:", error);
        },
      });

      response.on("close", abort);
    } catch (error) {
      if (vite && error instanceof Error) {
        vite.ssrFixStacktrace(error);
      }
      next(error);
    }
  });

  app.listen(port, () => {
    console.log("React sandbox listening at http://localhost:" + port);
  });
}

void start();
