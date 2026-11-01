import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLIENT_ENTRY_ID,
  type ResolvedEntries,
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

export function resolveEntries(root: string, ssr: boolean): ResolvedEntries {
  const clientFile = findConventionalFile(root, CLIENT_ENTRY_NAMES);
  const serverFile = ssr
    ? findConventionalFile(root, SERVER_ENTRY_NAMES)
    : null;

  const needsApp = !clientFile || (ssr && !serverFile);
  const appSpecifier = needsApp ? findAppSpecifier(root) : null;
  const styleSpecifiers = needsApp ? findConventionalStyles(root) : [];

  if (needsApp && !appSpecifier) {
    throw new Error(
      "[Vynn App] Could not find the root component. Add src/App.tsx (or src/app.tsx), or provide conventional entry-client/entry-server files.",
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
  // Conventional global styles are included only when generated entries are used.
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

export function toAbsoluteSpecifier(file: string): string {
  return file.replace(/\\/g, "/");
}
