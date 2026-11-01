import compression from "compression";
import express from "express";
import { resolve } from "node:path";
import sirv from "sirv";
import { createServer as createViteServer } from "vite";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_request, response) => {
  response.send("OK");
});

if (process.env.NODE_ENV === "production") {
  const nodeAdapterPath = "./dist/server/node.js";
  const { listener } = await import(nodeAdapterPath);

  app.use(compression());
  app.use(sirv(resolve("dist/client"), { extensions: [] }));
  app.use(listener);
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.info(`Vynn app listening on http://localhost:${port}`);
});
