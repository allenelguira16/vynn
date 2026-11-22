import { mkdir, writeFile, readFile } from "node:fs/promises";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { dirname, isAbsolute, posix as posixPath, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const frameworks = [
  { id: "vynn", label: "Vynn" },
  { id: "solid", label: "Solid 2" },
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

export function createSsrChunkReport(framework, outputDirectory, bundle, projectRoot = repositoryRoot) {
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
      staticImporters: [],
      dynamicImporters: [],
      modules,
    };
    byFileName.set(record.fileName, record);
    return record;
  });

  for (const chunk of chunks) {
    for (const imported of chunk.staticImports) {
      byFileName.get(imported)?.staticImporters.push(chunk.fileName);
    }
    for (const imported of chunk.dynamicImports) {
      byFileName.get(imported)?.dynamicImporters.push(chunk.fileName);
    }
  }

  for (const chunk of chunks) {
    chunk.staticImporters = [...new Set(chunk.staticImporters)].sort();
    chunk.dynamicImporters = [...new Set(chunk.dynamicImporters)].sort();
  }

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

function reportFileName(frameworkId, root = repositoryRoot) {
  return resolve(root, "benchmarks/results", "ssr-chunks-" + frameworkId + ".json");
}

export function ssrChunkReportPlugin(frameworkId, frameworkLabel) {
  let projectRoot = repositoryRoot;

  return {
    name: "vynn-ssr-chunk-report-" + frameworkId,
    apply: "build",
    configResolved(config) {
      projectRoot = config.root;
    },
    async generateBundle(outputOptions, bundle) {
      const outputDir = resolve(projectRoot, outputOptions.dir ?? "dist/server");
      const normalizedOutputDir = normalizePath(outputDir);

      // Both sandbox apps emit their server environment to dist/server.
      // The client build is deliberately ignored.
      if (!/(^|\/)dist\/server$/.test(normalizedOutputDir)) return;

      const report = createSsrChunkReport(
        frameworkLabel,
        outputDir,
        bundle,
        projectRoot,
      );
      const output = reportFileName(frameworkId);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2) + "\n");
      console.log("Wrote SSR chunk graph: " + normalizePath(relative(repositoryRoot, output)));
    },
  };
}

function formatKb(bytes) {
  return (bytes / 1000).toFixed(2) + " kB";
}

function printSummary(report) {
  const summaries = report.summaries;
  console.log(
    "  All emitted: " + summaries.allEmitted.files + " chunks, " +
    formatKb(summaries.allEmitted.raw) + " raw, " +
    formatKb(summaries.allEmitted.gzip) + " gzip, " +
    formatKb(summaries.allEmitted.brotli) + " Brotli",
  );
  console.log(
    "  Static entry graph: " + summaries.staticReachable.files + " chunks, " +
    formatKb(summaries.staticReachable.raw) + " raw, " +
    formatKb(summaries.staticReachable.gzip) + " gzip, " +
    formatKb(summaries.staticReachable.brotli) + " Brotli",
  );
  console.log(
    "  Dynamic-only reachable: " + summaries.dynamicOnly.files + " chunks, " +
    formatKb(summaries.dynamicOnly.raw) + " raw, " +
    formatKb(summaries.dynamicOnly.gzip) + " gzip, " +
    formatKb(summaries.dynamicOnly.brotli) + " Brotli",
  );
  if (summaries.unreachable.files > 0) {
    console.log("  Unreachable emitted chunks: " + summaries.unreachable.files);
  }
}

function printChunkTable(chunks) {
  const headers = ["Chunk", "Role", "Raw", "Gzip", "Brotli", "Static", "Dynamic", "Modules"];
  const rows = chunks.map((chunk) => [
    chunk.fileName,
    chunk.role,
    formatKb(chunk.raw),
    formatKb(chunk.gzip),
    formatKb(chunk.brotli),
    String(chunk.staticImports.filter((name) => chunks.some((item) => item.fileName === name)).length),
    String(chunk.dynamicImports.filter((name) => chunks.some((item) => item.fileName === name)).length),
    String(chunk.modules.length),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const line = (row) => row.map((value, index) => value.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
}

function printImportGraph(chunks) {
  console.log("");
  console.log("Import relationships (static / dynamic):");
  for (const chunk of chunks) {
    const staticImports = chunk.staticImports.length
      ? chunk.staticImports.join(", ")
      : "-";
    const dynamicImports = chunk.dynamicImports.length
      ? chunk.dynamicImports.join(", ")
      : "-";
    const staticImporters = chunk.staticImporters.length
      ? chunk.staticImporters.join(", ")
      : "-";
    const dynamicImporters = chunk.dynamicImporters.length
      ? chunk.dynamicImporters.join(", ")
      : "-";

    console.log("  " + chunk.fileName);
    console.log("    imports: static [" + staticImports + "]  dynamic [" + dynamicImports + "]");
    console.log("    imported by: static [" + staticImporters + "]  dynamic [" + dynamicImporters + "]");
  }
}

function printSourceAttribution(chunks) {
  const largest = [...chunks].sort((left, right) => right.raw - left.raw).slice(0, 6);
  if (largest.length === 0) return;

  console.log("");
  console.log("Largest chunks: source-module attribution");
  for (const chunk of largest) {
    console.log("  " + chunk.fileName + " (" + formatKb(chunk.raw) + ")");
    const modules = chunk.modules.filter((module) => module.renderedBytes > 0).slice(0, 4);
    if (modules.length === 0) {
      console.log("    No module attribution was reported by the bundler.");
      continue;
    }
    for (const module of modules) {
      console.log(
        "    " + formatKb(module.renderedBytes).padStart(9) + "  " + module.id,
      );
    }
  }
}

export async function printSsrChunkReport(root = repositoryRoot) {
  const available = [];
  const missing = [];

  for (const framework of frameworks) {
    try {
      const contents = await readFile(reportFileName(framework.id, root), "utf8");
      available.push(JSON.parse(contents));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      missing.push(framework.label);
    }
  }

  console.log("");
  console.log("SSR CHUNK GRAPH (sandbox production server builds)");
  if (available.length === 0) {
    console.log("  No SSR chunk reports found.");
    console.log("  Build both sandbox apps first:");
    console.log("    pnpm --filter app build");
    console.log("    pnpm --filter solid-app build");
    console.log("  Then run: pnpm bench:size -- --ssr");
    return;
  }

  for (const report of available) {
    console.log("");
    console.log(report.framework + " · " + report.outputDirectory + " · " + report.generatedAt);
    printSummary(report);
    printChunkTable(report.chunks);
    printImportGraph(report.chunks);
    printSourceAttribution(report.chunks);
  }

  if (missing.length > 0) {
    console.log("");
    console.log("Missing SSR graph for: " + missing.join(", "));
    console.log("Rebuild the corresponding sandbox app, then rerun pnpm bench:size -- --ssr.");
  }

  console.log("");
  console.log("Gzip/Brotli totals are sums of individually compressed JS chunks, not a single archive.");
  console.log("Graph reports: " + normalizePath(relative(root, reportFileName("vynn", root))) + " and " + normalizePath(relative(root, reportFileName("solid", root))));
}
