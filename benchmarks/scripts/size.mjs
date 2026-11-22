import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "node:zlib";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scenarios = ["minimal", "counter", "async"];
const apps = [
  { id: "vynn", label: "Vynn", packageName: "@vynn-bench/vynn" },
  { id: "solid", label: "Solid 2", packageName: "@vynn-bench/solid" },
  { id: "svelte", label: "Svelte 5", packageName: "@vynn-bench/svelte" },
  { id: "react", label: "React 19", packageName: "@vynn-bench/react" },
];

function selectedScenarios(args) {
  const inline = args.find((arg) => arg.startsWith("--scenario="));
  const index = args.indexOf("--scenario");
  const selected = inline?.slice("--scenario=".length) ?? (index >= 0 ? args[index + 1] : undefined);

  if (selected === undefined) return scenarios;
  if (!scenarios.includes(selected)) {
    throw new Error(`Unknown scenario "${selected}". Choose: ${scenarios.join(", ")}.`);
  }
  return [selected];
}

function runBuild(app, scenario) {
  const args = ["--filter", app.packageName, "exec", "vite", "build", "--mode", scenario];
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
    throw new Error(`Build failed for ${app.label} (${scenario}) with exit code ${result.status}.`);
  }
}

function isMeasuredAsset(path) {
  return /\.(?:m?js|css)$/i.test(path);
}

async function walk(directory, outputDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute, outputDirectory)));
    } else if (entry.isFile()) {
      const path = relative(outputDirectory, absolute).replaceAll("\\", "/");
      if (isMeasuredAsset(path)) files.push(path);
    }
  }

  return files;
}

async function getInitialAssetGraph(outputDirectory) {
  const manifestPath = resolve(outputDirectory, ".vite/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const entries = Object.entries(manifest);

  // Vite may emit an HTML entry separately from the JS module entry.
  // Prefer the actual JS entry so the initial payload cannot omit app code.
  const jsEntry = entries.find(([, item]) => item.isEntry && /\.(?:m?js)$/i.test(item.file));
  const htmlEntry = entries.find(
    ([key, item]) => item.isEntry && (/\.html$/i.test(key) || /\.html$/i.test(item.file)),
  );
  const rootEntry = jsEntry ?? htmlEntry;

  if (!rootEntry) {
    throw new Error(`No Vite entry was found in ${manifestPath}.`);
  }

  const files = new Set();
  const visited = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);

    const item = manifest[key];
    if (!item) throw new Error(`Manifest import "${key}" was not found in ${manifestPath}.`);

    if (item.file && isMeasuredAsset(item.file)) files.add(item.file);
    for (const css of item.css ?? []) files.add(css);
    // Follow only static imports. Dynamic imports are intentionally excluded
    // from the initial route payload and included in the all-emitted total.
    for (const imported of item.imports ?? []) visit(imported);
  }

  visit(rootEntry[0]);
  if (htmlEntry && htmlEntry[0] !== rootEntry[0]) {
    for (const css of htmlEntry[1].css ?? []) files.add(css);
  }
  return [...files];
}

async function measureAssetSet(outputDirectory, paths) {
  const result = {
    javascript: { files: 0, raw: 0, gzip: 0, brotli: 0 },
    css: { files: 0, raw: 0, gzip: 0, brotli: 0 },
  };
  const assets = [];

  for (const path of paths) {
    if (!isMeasuredAsset(path)) continue;
    const content = await readFile(resolve(outputDirectory, path));
    const kind = path.toLowerCase().endsWith(".css") ? "css" : "javascript";
    const sizes = {
      raw: content.byteLength,
      gzip: gzipSync(content, { level: 9 }).byteLength,
      brotli: brotliCompressSync(content, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
    };

    result[kind].files += 1;
    result[kind].raw += sizes.raw;
    result[kind].gzip += sizes.gzip;
    result[kind].brotli += sizes.brotli;
    assets.push({ path, kind, ...sizes });
  }

  result.total = {
    files: result.javascript.files + result.css.files,
    raw: result.javascript.raw + result.css.raw,
    gzip: result.javascript.gzip + result.css.gzip,
    brotli: result.javascript.brotli + result.css.brotli,
  };

  return { totals: result, assets };
}

function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function printTable(results, scenario) {
  const rows = results.filter((item) => item.scenario === scenario);
  const headers = ["Framework", "Initial JS", "Initial CSS", "Initial total", "All emitted"];
  const values = rows.map((item) => [
    item.framework,
    formatKb(item.initial.javascript.gzip),
    formatKb(item.initial.css.gzip),
    formatKb(item.initial.total.gzip),
    formatKb(item.allEmitted.total.gzip),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index].length)),
  );
  const line = (row) => row.map((value, index) => value.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(`${scenario.toUpperCase()} (gzip, per resource)`);
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of values) console.log(line(row));
}

function printAsyncDelta(results) {
  const rows = results.flatMap((item) => {
    if (item.scenario !== "async") return [];

    const baseline = results.find(
      (candidate) => candidate.id === item.id && candidate.scenario === "counter",
    );
    if (!baseline) return [];

    return [[
      item.framework,
      formatDelta(item.initial.javascript.gzip - baseline.initial.javascript.gzip),
      formatDelta(item.allEmitted.total.gzip - baseline.allEmitted.total.gzip),
    ]];
  });

  if (rows.length === 0) return;

  const headers = ["Framework", "Async initial JS delta", "Async all-emitted delta"];
  const values = rows;
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index].length)),
  );
  const line = (row) => row.map((value, index) => value.padEnd(widths[index])).join("  ");

  console.log("");
  console.log("ASYNC INCREMENT OVER COUNTER (gzip)");
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of values) console.log(line(row));
}

function formatDelta(bytes) {
  const sign = bytes > 0 ? "+" : "";
  return `${sign}${(bytes / 1000).toFixed(2)} kB`;
}

async function main() {
  const selected = selectedScenarios(process.argv.slice(2));
  const results = [];

  for (const scenario of selected) {
    for (const app of apps) {
      console.log("");
      console.log(`Building ${app.label} / ${scenario}...`);
      runBuild(app, scenario);

      const outputDirectory = resolve(root, "benchmarks/apps", app.id, "dist/client");
      const initialPaths = await getInitialAssetGraph(outputDirectory);
      const allPaths = await walk(outputDirectory);
      const initial = await measureAssetSet(outputDirectory, initialPaths);
      const allEmitted = await measureAssetSet(outputDirectory, allPaths);

      results.push({
        framework: app.label,
        id: app.id,
        scenario,
        initial: initial.totals,
        allEmitted: allEmitted.totals,
        assets: {
          initial: initial.assets,
          allEmitted: allEmitted.assets,
        },
      });
    }

    printTable(results, scenario);
    if (scenario === "async") printAsyncDelta(results);
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      vite: "8.3.6",
      frameworkVersions: {
        vynn: "workspace",
        solid: "2.0.0-rc.18",
        svelte: "5.59.1",
        react: "19.3.1",
      },
      minifier: "oxc",
      target: "es2022",
      gzipLevel: 9,
      brotliQuality: 11,
    },
    methodology: "Initial static manifest import graph and all emitted JavaScript/CSS assets; compressed per resource.",
    results,
  };

  const output = resolve(root, "benchmarks/results/latest.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + String.fromCharCode(10));
  console.log("");
  console.log(`Wrote ${relative(root, output).replaceAll("\\", "/")}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
