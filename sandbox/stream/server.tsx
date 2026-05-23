import fs from "node:fs";

import express, { Request, Response } from "express";
import { createServer as createViteServer, ViteDevServer } from "vite";
import { HydrateStreamScript } from "vynn/server";

const ssrLoadedModules = new Set<string>();
const PORT = 3000;
const isDev = process.env.NODE_ENV === "development";

const start = Date.now();
const app = express();
let vite: ViteDevServer | undefined;

if (isDev) {
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  // (globalThis as any).__SSR_CTX__ = { ssrLoadModule: vite.ssrLoadModule };

  app.use(vite.middlewares);
} else {
  const compression = (await import("compression")).default;
  const sirv = (await import("sirv")).default;
  app.use(compression());
  app.use(
    "/",
    sirv("./dist/client", {
      extensions: [],
      maxAge: 31536000,
      immutable: true,
    }),
  );
}

// helper: invalidate a module so ssrLoadModule re-evaluates it
async function reloadServerEntry(vite: ViteDevServer, url: string) {
  const mod = await vite.moduleGraph.getModuleByUrl(url);
  if (mod) vite.moduleGraph.invalidateModule(mod);
  // also drop any previous evaluated instance from ssrModuleLoader cache
  // (internal symbol but safe to call through the public API)
  return vite.ssrLoadModule(url);
}

app.use("*all", async (req: Request, res: Response, next) => {
  const url = req.originalUrl;

  if (url.includes(".")) {
    next();
    return;
  }

  try {
    let template: string;
    let render: <T>(url: string) => Promise<T>;

    if (isDev && vite) {
      const original = vite.ssrLoadModule.bind(vite);

      vite.ssrLoadModule = async (url: string) => {
        ssrLoadedModules.add(url);
        return original(url);
      };

      template = fs.readFileSync("./index.html", "utf-8");
      template = await vite.transformIndexHtml(url, template);

      const entry = await reloadServerEntry(vite, "/src/entry-server.tsx");
      render = entry.render;
    } else {
      template = fs.readFileSync("./dist/client/index.html", "utf-8");
      // @ts-expect-error dist file
      render = (await import("./dist/server/entry-server.js")).render;
    }

    const stream = await render<AsyncGenerator<Uint8Array<ArrayBufferLike>, void, unknown>>(url);

    const [head, tail] = template.split("<!--ssr-outlet-->");

    res.status(200).set({ "Content-Type": "text/html" });
    res.write(head.replace("<!--hydration-script-->", HydrateStreamScript() as string));

    for await (const chunk of stream) {
      res.write(chunk);
    }

    res.write(tail);
    res.end();
  } catch (e) {
    if (e instanceof Error && vite) {
      vite.ssrFixStacktrace(e);
    }
    next(e);
  }
});

app.listen(PORT, () => {
  if (isDev) console.clear();
  const elapsed = Date.now() - start;

  console.log(`\n  VYNN v0.0.0  ready in ${elapsed} ms\n`);
  console.log(`  ➜  Local:   \x1b[36mhttp://localhost:${PORT}/\x1b[0m`);
  console.log(`  ➜  Network: use --host to expose`);
  console.log(`  ➜  press h + enter to show help`);
});
