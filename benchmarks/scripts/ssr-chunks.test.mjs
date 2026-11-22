import assert from "node:assert/strict";
import test from "node:test";
import { createSsrChunkReport } from "./ssr-chunks.mjs";

test("builds static and dynamic chunk reachability with module attribution", () => {
  const bundle = {
    "index.js": {
      type: "chunk",
      fileName: "index.js",
      code: 'import "./assets/shared.js"; import("./assets/route.js");',
      isEntry: true,
      isDynamicEntry: false,
      imports: ["assets/shared.js"],
      dynamicImports: ["assets/route.js"],
      modules: {
        "src/main.ts": { originalLength: 90, renderedLength: 70 },
      },
    },
    "assets/shared.js": {
      type: "chunk",
      fileName: "assets/shared.js",
      code: "export const shared = 1;",
      isEntry: false,
      isDynamicEntry: false,
      imports: [],
      dynamicImports: [],
      modules: {
        "src/shared.ts": { originalLength: 25, renderedLength: 20 },
      },
    },
    "assets/route.js": {
      type: "chunk",
      fileName: "assets/route.js",
      code: "export const route = 2;",
      isEntry: false,
      isDynamicEntry: true,
      imports: ["assets/shared.js"],
      dynamicImports: [],
      modules: {
        "src/route.ts": { originalLength: 25, renderedLength: 20 },
      },
    },
  };

  const report = createSsrChunkReport(
    "Vynn",
    "/repo/dist/server",
    bundle,
    "/repo",
  );

  assert.deepEqual(report.entries, ["index.js"]);
  assert.deepEqual(report.graph.staticReachable, ["assets/shared.js", "index.js"]);
  assert.deepEqual(report.graph.dynamicOnly, ["assets/route.js"]);
  assert.deepEqual(report.graph.unreachable, []);
  assert.equal(report.summaries.allEmitted.files, 3);
  assert.equal(report.summaries.staticReachable.files, 2);
  assert.equal(report.summaries.dynamicOnly.files, 1);

  const route = report.chunks.find((chunk) => chunk.fileName === "assets/route.js");
  assert.deepEqual(route.staticImporters, []);
  assert.deepEqual(route.dynamicImporters, ["index.js"]);

  const entry = report.chunks.find((chunk) => chunk.fileName === "index.js");
  assert.equal(entry.modules[0].id, "src/main.ts");
  assert.equal(entry.modules[0].renderedBytes, 70);
  assert.ok(entry.gzip > 0);
  assert.ok(entry.brotli > 0);
});
