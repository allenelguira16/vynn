import { mkdir, readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { dirname, isAbsolute, posix as posixPath, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const frameworks = [
  { id: "vynn", label: "Vynn" },
  { id: "solid", label: "Solid 2" },
  { id: "svelte", label: "Svelte 5" },
  { id: "react", label: "React 19" },
];

function normalizePath(value) {
  return String(value).replaceAll("\\", "/");
}

function normalizeModuleId(id, projectRoot) {
  const value = normalizePath(id);
  if (!isAbsolute(id)) return value;

  const relativeId = normalizePath(relative(projectRoot, id));
  return relativeId === ".." || relativeId.startsWith("../") ? value : relativeId;
}

function measureCode(code) {
  const bytes = Buffer.from(code ?? "", "utf8");
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

function aggregate(chunks) {
  return chunks.reduce(
    (total, chunk) => {
      total.files += 1;
      total.raw += chunk.raw;
      total.gzip += chunk.gzip;
      total.brotli += chunk.brotli;
      return total;
    },
    { files: 0, raw: 0, gzip: 0, brotli: 0 },
  );
}

function reportFileName(frameworkId, mode, root = repositoryRoot) {
  return resolve(
    root,
    "benchmarks/results",
    `client-chunks-${frameworkId}-${mode}.json`,
  );
}

function createClientChunkReport(framework, mode, outputDirectory, bundle, projectRoot) {
  const outputChunks = Object.values(bundle).filter((item) => item?.type === "chunk");
  const fileNames = new Set(outputChunks.map((chunk) => chunk.fileName));
  const byFileName = new Map();

  function resolveChunkReference(fromFile, reference) {
    const normalized = normalizePath(reference);
    if (fileNames.has(normalized)) return normalized;

    const relativeReference = posixPath.normalize(
      posixPath.join(posixPath.dirname(fromFile), normalized),
    );
    return fileNames.has(relativeReference) ? relativeReference : normalized;
  }

  const chunks = outputChunks.map((chunk) => {
    const sizes = measureCode(chunk.code);
    const modules = Object.entries(chunk.modules ?? {})
      .map(([id, module]) => ({
        id: normalizeModuleId(id, projectRoot),
        originalBytes: Number(module.originalLength ?? 0),
        renderedBytes: Number(module.renderedLength ?? 0),
      }))
      .sort((left, right) => right.renderedBytes - left.renderedBytes);

    const record = {
      fileName: chunk.fileName,
      role: chunk.isEntry ? "entry" : chunk.isDynamicEntry ? "dynamic" : "shared",
      isEntry: Boolean(chunk.isEntry),
      isDynamicEntry: Boolean(chunk.isDynamicEntry),
      facadeModuleId: chunk.facadeModuleId
        ? normalizeModuleId(chunk.facadeModuleId, projectRoot)
        : null,
      ...sizes,
      staticImports: [...new Set((chunk.imports ?? []).map((item) =>
        resolveChunkReference(chunk.fileName, item),
      ))].sort(),
      dynamicImports: [...new Set((chunk.dynamicImports ?? []).map((item) =>
        resolveChunkReference(chunk.fileName, item),
      ))].sort(),
      modules,
    };
    byFileName.set(record.fileName, record);
    return record;
  });

  function reachableFromEntries(includeDynamic) {
    const visited = new Set();
    const queue = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);

    while (queue.length > 0) {
      const fileName = queue.pop();
      if (visited.has(fileName)) continue;
      visited.add(fileName);

      const chunk = byFileName.get(fileName);
      if (!chunk) continue;

      for (const imported of chunk.staticImports) {
        if (byFileName.has(imported) && !visited.has(imported)) queue.push(imported);
      }
      if (includeDynamic) {
        for (const imported of chunk.dynamicImports) {
          if (byFileName.has(imported) && !visited.has(imported)) queue.push(imported);
        }
      }
    }

    return [...visited].sort();
  }

  const staticReachable = reachableFromEntries(false);
  const allReachable = reachableFromEntries(true);
  const dynamicOnly = allReachable.filter((fileName) => !staticReachable.includes(fileName));
  const unreachable = chunks
    .map((chunk) => chunk.fileName)
    .filter((fileName) => !allReachable.includes(fileName))
    .sort();
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));

  chunks.sort((left, right) => left.fileName.localeCompare(right.fileName));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    framework,
    mode,
    outputDirectory: normalizePath(relative(projectRoot, outputDirectory)),
    entries: chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
    summaries: {
      allEmitted: aggregate(chunks),
      staticReachable: aggregate(staticReachable.map((fileName) => byName.get(fileName))),
      dynamicOnly: aggregate(dynamicOnly.map((fileName) => byName.get(fileName))),
      unreachable: aggregate(unreachable.map((fileName) => byName.get(fileName))),
    },
    graph: {
      staticReachable,
      dynamicOnly,
      unreachable,
    },
    chunks,
  };
}

export function clientChunkReportPlugin(frameworkId, frameworkLabel) {
  let projectRoot = repositoryRoot;
  let mode = "production";

  return {
    name: "vynn-client-chunk-report-" + frameworkId,
    apply: "build",
    enforce: "post",
    configResolved(config) {
      projectRoot = config.root;
      mode = config.mode;
    },
    async generateBundle(outputOptions, bundle) {
      const outputDir = resolve(projectRoot, outputOptions.dir ?? "dist/client");
      const outputPath = normalizePath(relative(projectRoot, outputDir));

      // This reporter is deliberately scoped to the benchmark client build.
      if (outputPath !== "dist/client") return;

      const report = createClientChunkReport(
        frameworkLabel,
        mode,
        outputDir,
        bundle,
        projectRoot,
      );
      const output = reportFileName(frameworkId, mode);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
      console.log(
        "Wrote client chunk graph: " +
          normalizePath(relative(repositoryRoot, output)),
      );
    },
  };
}

function formatKb(bytes) {
  return (bytes / 1000).toFixed(2) + " kB";
}

function formatDelta(bytes) {
  const sign = bytes > 0 ? "+" : "";
  return sign + formatKb(bytes);
}

function collectStaticModules(report) {
  const reachable = new Set(report.graph.staticReachable);
  const modules = new Map();

  for (const chunk of report.chunks) {
    if (!reachable.has(chunk.fileName)) continue;

    for (const module of chunk.modules) {
      const previous = modules.get(module.id) ?? 0;
      modules.set(module.id, previous + module.renderedBytes);
    }
  }

  return modules;
}

async function readReport(frameworkId, mode, root = repositoryRoot) {
  const path = reportFileName(frameworkId, mode, root);
  return JSON.parse(await readFile(path, "utf8"));
}

function printFrameworkComparison(framework, minimal, state) {
  const minimalModules = collectStaticModules(minimal);
  const stateModules = collectStaticModules(state);
  const names = [...stateModules.keys()];
  const rows = names
    .map((id) => {
      const before = minimalModules.get(id) ?? 0;
      const after = stateModules.get(id) ?? 0;
      return { id, before, after, delta: after - before };
    })
    .sort((left, right) =>
      right.delta - left.delta || right.after - left.after,
    )
    .slice(0, 24);

  console.log("");
  console.log(
    framework + " · client initial graph · minimal " +
      formatKb(minimal.summaries.staticReachable.gzip) + " gzip / " +
      formatKb(minimal.summaries.staticReachable.raw) + " raw · state " +
      formatKb(state.summaries.staticReachable.gzip) + " gzip / " +
      formatKb(state.summaries.staticReachable.raw) + " raw",
  );
  console.log("  Module attribution (rendered source bytes; not individually gzip-compressed):");

  const headers = ["Module", "Minimal", "State", "Delta"];
  const values = rows.map((row) => [
    row.id,
    formatKb(row.before),
    formatKb(row.after),
    formatDelta(row.delta),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index].length)),
  );
  const line = (row) => row.map((value, index) => value.padEnd(widths[index])).join("  ");

  console.log("  " + line(headers));
  console.log("  " + widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of values) console.log("  " + line(row));
}

export async function printClientChunkComparison(root = repositoryRoot) {
  console.log("");
  console.log("CLIENT CHUNK ATTRIBUTION (minimal versus state-only)");

  for (const framework of frameworks) {
    try {
      const [minimal, state] = await Promise.all([
        readReport(framework.id, "minimal", root),
        readReport(framework.id, "state", root),
      ]);
      printFrameworkComparison(framework.label, minimal, state);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      console.log(
        "  Missing " + framework.label +
          " client graph. Re-run pnpm bench:size to generate the reports.",
      );
    }
  }

  console.log("");
  console.log(
    "Chunk gzip sizes are measured from final emitted chunks. Per-module rendered bytes are attribution metadata, not additive gzip contributions.",
  );
  console.log(
    "Reports: benchmarks/results/client-chunks-<framework>-<mode>.json",
  );
}
