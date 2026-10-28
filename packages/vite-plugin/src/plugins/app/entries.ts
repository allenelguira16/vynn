import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  CLIENT_ENTRY_ID,
  type ResolvedEntries,
  type VynnAppOptions,
} from "./shared.ts";

const ENTRY_EXTENSIONS = [
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".tsrx",
  ".mts",
  ".mjs",
];
const CLIENT_ENTRY_NAMES = ["entry-client"];
const SERVER_ENTRY_NAMES = ["entry-server"];

export function resolveEntries(
  root: string,
  options: VynnAppOptions,
  ssr: boolean,
): ResolvedEntries {
  const clientFile = options.entryClient
    ? resolveUserFile(root, options.entryClient, "entryClient")
    : findConventionalFile(root, CLIENT_ENTRY_NAMES);
  const serverFile = ssr
    ? options.entryServer
      ? resolveUserFile(root, options.entryServer, "entryServer")
      : findConventionalFile(root, SERVER_ENTRY_NAMES)
    : null;

  const needsApp = !clientFile || (ssr && !serverFile);
  const appSpecifier = options.app
    ? toModuleSpecifier(root, options.app)
    : needsApp
      ? findAppSpecifier(root)
      : null;
  const styleSpecifiers = needsApp ? findConventionalStyles(root) : [];

  if (needsApp && !appSpecifier) {
    throw new Error(
      "[Vynn Start] Could not find the root component. Add src/App.tsx (or src/app.tsx), configure start.app, or provide conventional entry-client/entry-server files.",
    );
  }

  return {
    appSpecifier,
    styleSpecifiers,
    clientFile,
    serverFile,
    clientInput: clientFile ?? CLIENT_ENTRY_ID,
    clientIsGenerated: !clientFile,
    serverIsGenerated: ssr && !serverFile,
  };
}

function findAppSpecifier(root: string): string | null {
  const candidates = ["src/App", "src/app"];
  for (const stem of candidates) {
    for (const extension of ENTRY_EXTENSIONS) {
      const file = resolve(root, `${stem}${extension}`);
      if (existsSync(file)) return toAbsoluteSpecifier(file);
    }
  }
  return null;
}

function findConventionalStyles(root: string): string[] {
  // Conventional global styles are included only when Start generates entries.
  // Projects with authored entries remain in full control of their imports.
  return ["src/main.css", "src/index.css"]
    .map((file) => resolve(root, file))
    .filter((file) => existsSync(file))
    .map(toAbsoluteSpecifier);
}

function findConventionalFile(root: string, names: string[]): string | null {
  for (const stem of names) {
    for (const extension of ENTRY_EXTENSIONS) {
      const file = resolve(root, "src", `${stem}${extension}`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

function resolveUserFile(root: string, value: string, label: string): string {
  const file = resolve(root, value);
  if (!existsSync(file)) {
    throw new Error(`[Vynn Start] start.${label} does not exist: ${value}`);
  }
  return file;
}

function toModuleSpecifier(root: string, value: string): string {
  if (value.startsWith("virtual:") || value.startsWith("@/")) return value;
  if (isAbsolute(value)) {
    // Vite-root paths are a common spelling in plugin configuration. Prefer a
    // real absolute path only when it exists; otherwise treat `/src/X.tsx` as
    // root-relative.
    if (existsSync(value)) return toAbsoluteSpecifier(value);
    const rooted = resolve(root, value.slice(1));
    if (existsSync(rooted)) return toAbsoluteSpecifier(rooted);
    return value.replace(/\\/g, "/");
  }
  if (value.startsWith("./") || value.startsWith("../")) {
    return toAbsoluteSpecifier(resolve(root, value));
  }
  if (value.includes("/") || /\.(?:tsx?|jsx?|tsrx|mjs)$/.test(value)) {
    const file = resolve(root, value);
    if (existsSync(file)) return toAbsoluteSpecifier(file);
    return `/${value.replace(/^\.\//, "").replace(/\\/g, "/")}`;
  }
  return value;
}

export function toAbsoluteSpecifier(file: string): string {
  return file.replace(/\\/g, "/");
}
