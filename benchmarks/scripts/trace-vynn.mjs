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
const scenarios = ["minimal", "state", "computed", "event", "counter"];

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

async function measureEntry(outputDirectory) {
  const manifest = JSON.parse(
    await readFile(resolve(outputDirectory, ".vite/manifest.json"), "utf8"),
  );
  const entries = Object.values(manifest);
  const entry = entries.find((item) => item.isEntry && /\\.m?js$/i.test(item.file));
  if (!entry) throw new Error("Could not find the Vynn JavaScript entry in the Vite manifest.");

  const content = await readFile(resolve(outputDirectory, entry.file));
  return {
    file: entry.file,
    raw: content.byteLength,
    gzip: gzipSync(content, { level: 9 }).byteLength,
    brotli: brotliCompressSync(content, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
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

    const modules = moduleReport.chunks.flatMap((chunk) =>
      chunk.modules.map((module) => ({
        ...module,
        group: getModuleGroup(module.id),
        id: normalizeModuleId(module.id),
      })),
    );
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
      modules: modules.sort((left, right) => right.renderedLength - left.renderedLength),
    });

    const core = groupTotals["vynn-core"];
    console.log(
      `${scenario.padEnd(9)} entry gzip ${(entry.gzip / 1000).toFixed(2)} kB | ` +
      `vynn-core modules ${core?.modules ?? 0} | pre-minify rendered ${core?.renderedLength ?? 0} bytes`,
    );
  }

  const baseline = new Map(
    results[0].modules.map((module) => [module.id, module.renderedLength]),
  );

  console.log("");
  console.log("Largest Vynn core modules (post-tree-shaking, pre-minification)");
  console.log("Scenario  Module                                               Rendered  Change");
  console.log("--------  ---------------------------------------------------  --------  ------");

  for (const result of results) {
    const rows = result.modules
      .filter((module) => module.group === "vynn-core" && module.renderedLength > 0)
      .slice(0, 12);

    for (const module of rows) {
      const previous = baseline.get(module.id) ?? 0;
      const delta = module.renderedLength - previous;
      const shortId = module.id.split("/packages/vynn-core/").at(-1);
      console.log(
        `${result.scenario.padEnd(9)} ${shortId.padEnd(51)} ` +
        `${String(module.renderedLength).padStart(8)}  ${delta >= 0 ? "+" : ""}${delta}`,
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
    moduleSizes: "Rolldown renderedLength after tree-shaking and before chunk minification; not final compressed attribution.",
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
