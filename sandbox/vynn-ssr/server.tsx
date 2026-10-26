import fs from "node:fs";

import express, { Request, Response } from "express";
import { createServer as createViteServer, ViteDevServer } from "vite";

const isDev = process.env.NODE_ENV === "development";
const PORT = isDev ? 5173 : 4173;

const start = Date.now();
const app = express();
let vite: ViteDevServer | undefined;

if (isDev) {
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
} else {
  const compression = (await import("compression")).default;
  const sirv = (await import("sirv")).default;
  app.use(compression());
  app.use("/", sirv("./dist/client", { extensions: [] }));
}

app.use("*all", async (req: Request, res: Response, next) => {
  const url = req.originalUrl;

  if (url.includes(".")) {
    next();
    return;
  }

  try {
    let template: string;
    let render: (
      url: string,
    ) => Promise<string> | ReadableStream<Uint8Array<ArrayBufferLike>>;

    if (isDev && vite) {
      template = fs.readFileSync("./index.html", "utf-8");
      template = (await vite.transformIndexHtml(url, template))
        .replace(/>\s+</g, "><")
        .trim();

      render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render;
    } else {
      template = fs
        .readFileSync("./dist/client/index.html", "utf-8")
        .replace(/>\s+</g, "><")
        .trim();
      // @ts-expect-error dist file
      render = (await import("./dist/server/entry-server.js")).render;
    }

    // const appHtml = await render(url);

    // let html = template.replace("<!--ssr-outlet-->", appHtml);
    // if (isDev) html = pretty(html);
    // else html = html.replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ");
    // // html = html.replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ");

    // res.status(200).set({ "Content-Type": "text/html" }).end(html);

    const stream = await render(url);

    const [head, tail] = template.split("<!--ssr-outlet-->");

    res.status(200).set({
      "Content-Type": "text/html; charset=utf-8",
    });

    const flush = () => {
      (
        res as Response & {
          flush?: () => void;
        }
      ).flush?.();
    };

    async function writeChunk(chunk: string | Uint8Array) {
      const canContinue = res.write(chunk);

      // Force the compression middleware to emit buffered output.
      flush();

      if (!canContinue) {
        await new Promise<void>((resolve) => {
          res.once("drain", resolve);
        });
      }
    }

    await writeChunk(head);

    for await (const chunk of stream) {
      await writeChunk(chunk);
    }

    await writeChunk(tail);
    res.end();
  } catch (e) {
    if (e instanceof Error && vite) {
      vite.ssrFixStacktrace(e);
    }
    next(e);
  }
});

app.listen(PORT, () => {
  console.clear();
  const elapsed = Date.now() - start;

  console.log(`\n  VYNN v0.0.0  ready in ${elapsed} ms\n`);
  console.log(`  ➜  Local:   \x1b[36mhttp://localhost:${PORT}/\x1b[0m`);
  console.log(`  ➜  Network: use --host to expose`);
  console.log(`  ➜  press h + enter to show help`);
});
