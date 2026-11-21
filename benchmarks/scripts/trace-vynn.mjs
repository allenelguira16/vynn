import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = "@vynn-bench/vynn";
const scenarios = ["minimal", "cell", "dynamic", "state", "initializer", "promise", "computed", "event", "counter"];

function runBuild(scenario) {
  const args = ["--filter", app, "exec", "vite", "build", "--mode", scenario];
  const isWindows = process.platform === "win32";
  const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "pnpm";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["pnpm", ...args].join(" ")]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    windowsVerbatimArguments: isWindows,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Build failed for Vynn / ${scenario} with exit code ${result.status}.`);
  }
}

function normalizeModuleId(id) {
  return id.replaceAll("\\", "/");
}

function getModuleGroup(id) {
  const normalized = normalizeModuleId(id);
  if (normalized.includes("/packages/vynn-core/")) return "vynn-core";
  if (normalized.includes("/packages/vite-plugin/")) return "vite-plugin";
  if (normalized.includes("/packages/vynn-compiler/")) return "vynn-compiler";
  if (normalized.includes("/node_modules/")) return "dependencies";
  if (normalized.includes("/benchmarks/apps/vynn/")) return "benchmark-app";
  return "other";
}

function collectStaticFiles(manifest, entry) {
  const files = new Set();

  function visit(item) {
    if (!item || files.has(item.file)) return;
    files.add(item.file);

    for (const importedId of item.imports ?? []) {
      visit(manifest[importedId]);
    }
  }

  visit(entry);
  return [...files];
}

async function measureEntry(outputDirectory) {
  const manifest = JSON.parse(
    await readFile(resolve(outputDirectory, ".vite/manifest.json"), "utf8"),
  );
  const entries = Object.values(manifest);
  const entry = entries.find((item) => item.isEntry && /\.m?js$/i.test(item.file));
  if (!entry) throw new Error("Could not find the Vynn JavaScript entry in the Vite manifest.");

  const staticFiles = collectStaticFiles(manifest, entry).filter((file) => /\.m?js$/i.test(file));
  const staticAssets = await Promise.all(staticFiles.map(async (file) => {
    const content = await readFile(resolve(outputDirectory, file));
    return {
      file,
      raw: content.byteLength,
      gzip: gzipSync(content, { level: 9 }).byteLength,
      brotli: brotliCompressSync(content, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
    };
  }));

  return {
    file: entry.file,
    staticFiles,
    staticAssets,
    raw: staticAssets.reduce((sum, asset) => sum + asset.raw, 0),
    gzip: staticAssets.reduce((sum, asset) => sum + asset.gzip, 0),
    brotli: staticAssets.reduce((sum, asset) => sum + asset.brotli, 0),
  };
}

async function measureDeferredChunks(outputDirectory, chunks, staticFiles) {
  const initialFiles = new Set(staticFiles);
  const deferred = chunks.filter((chunk) => !initialFiles.has(chunk.file));

  return Promise.all(deferred.map(async (chunk) => {
    const content = await readFile(resolve(outputDirectory, chunk.file));
    return {
      file: chunk.file,
      raw: content.byteLength,
      gzip: gzipSync(content, { level: 9 }).byteLength,
      brotli: brotliCompressSync(content, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
      renderedLength: chunk.modules.reduce(
        (sum, module) => sum + (module.renderedLength ?? 0),
        0,
      ),
    };
  }));
}

async function main() {
  const outputDirectory = resolve(root, "benchmarks/apps/vynn/dist/client");
  const results = [];

  for (const scenario of scenarios) {
    console.log("");
    console.log(`Building Vynn / ${scenario}...`);
    runBuild(scenario);

    const [entry, moduleReport] = await Promise.all([
      measureEntry(outputDirectory),
      readFile(resolve(outputDirectory, "module-report.json"), "utf8").then(JSON.parse),
    ]);

    const staticFiles = new Set(entry.staticFiles);
    const initialChunks = moduleReport.chunks.filter((chunk) => staticFiles.has(chunk.file));
    const deferredChunks = moduleReport.chunks.filter((chunk) => !staticFiles.has(chunk.file));
    const deferredAssets = await measureDeferredChunks(
      outputDirectory,
      moduleReport.chunks,
      entry.staticFiles,
    );

    const modules = initialChunks.flatMap((chunk) =>
      chunk.modules.map((module) => ({
        ...module,
        group: getModuleGroup(module.id),
        id: normalizeModuleId(module.id),
      })),
    );
    const deferredModules = deferredChunks.flatMap((chunk) =>
      chunk.modules.map((module) => ({
        ...module,
        group: getModuleGroup(module.id),
        id: normalizeModuleId(module.id),
      })),
    );
    const deferredGzip = deferredAssets.reduce((sum, asset) => sum + asset.gzip, 0);
    const grouped = new Map();
    for (const module of modules) {
      const entries = grouped.get(module.group) ?? [];
      entries.push(module);
      grouped.set(module.group, entries);
    }
    const groupTotals = Object.fromEntries(
      [...grouped.entries()].map(([group, entries]) => [
        group,
        {
          modules: entries.length,
          renderedLength: entries.reduce((sum, module) => sum + (module.renderedLength ?? 0), 0),
        },
      ]),
    );

    results.push({
      scenario,
      entry,
      moduleCount: modules.length,
      groupTotals,
      deferredAssets,
      deferredGzip,
      deferredModules: deferredModules.sort(
        (left, right) => (right.renderedLength ?? 0) - (left.renderedLength ?? 0),
      ),
      modules: modules.sort(
        (left, right) => (right.renderedLength ?? 0) - (left.renderedLength ?? 0),
      ),
    });

    const core = groupTotals["vynn-core"];
    console.log(
      `${scenario.padEnd(9)} entry gzip ${(entry.gzip / 1000).toFixed(2)} kB | ` +
      `initial vynn-core ${core?.modules ?? 0} modules / ${core?.renderedLength ?? 0} bytes | ` +
      `deferred gzip ${(deferredGzip / 1000).toFixed(2)} kB (${deferredAssets.length} chunks)`,
    );
  }

  const baseline = new Map(
    results[0].modules.map((module) => [module.id, module.renderedLength ?? 0]),
  );

  console.log("");
  console.log("Largest Vynn core modules (post-tree-shaking, pre-minification)");
  console.log("Scenario  Module                                               Rendered  Change");
  console.log("--------  ---------------------------------------------------  --------  ------");

  for (const result of results) {
    const rows = result.modules
      .filter((module) => module.group === "vynn-core" && (module.renderedLength ?? 0) > 0)
      .slice(0, 12);

    for (const module of rows) {
      const previous = baseline.get(module.id) ?? 0;
      const delta = (module.renderedLength ?? 0) - previous;
      const shortId = module.id.split("/packages/vynn-core/").at(-1);
      console.log(
        `${result.scenario.padEnd(9)} ${shortId.padEnd(51)} ` +
        `${String(module.renderedLength ?? 0).padStart(8)}  ${delta >= 0 ? "+" : ""}${delta}`,
      );
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      vite: "8.3.6",
      minifier: "oxc",
      target: "es2022",
      gzipLevel: 9,
      brotliQuality: 11,
    },
    moduleSizes:
      "Rolldown renderedLength after tree-shaking and before chunk minification, split between the static entry graph and deferred dynamic chunks; not final compressed attribution.",
    results,
  };

  const output = resolve(root, "benchmarks/results/vynn-trace.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + String.fromCharCode(10));
  console.log("");
  console.log(`Wrote ${relative(root, output).replaceAll("\\", "/")}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
