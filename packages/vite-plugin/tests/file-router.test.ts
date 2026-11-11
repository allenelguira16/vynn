import { afterEach, describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { transformFileRouterCalls } from "../src/plugins/file-router";

let projectRoot = "";

afterEach(() => {
  if (projectRoot) {
    rmSync(projectRoot, { recursive: true, force: true });
    projectRoot = "";
  }
});

function createProject(): string {
  projectRoot = mkdtempSync(join(tmpdir(), "vynn-file-router-"));
  mkdirSync(join(projectRoot, "src", "app"), { recursive: true });
  return projectRoot;
}

function writeAppFile(path: string, source: string): void {
  const absolutePath = join(projectRoot, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, source, "utf8");
}

describe("Vynn App Router transform", () => {
  it("injects a static glob for route special files", () => {
    const root = createProject();

    writeAppFile("src/app/page.tsx", "export default function Home() { return null; }");
    writeAppFile("src/app/not-found.tsx", "export default function NotFound() { return null; }");
    writeAppFile(
      "src/app/blog/not-found.tsx",
      "export default function BlogNotFound() { return null; }",
    );
    writeAppFile(
      "src/app/layout.tsx",
      "export const beforeLoad = async () => undefined; export default function RootLayout() { return null; }",
    );
    writeAppFile(
      "src/app/about/page.tsx",
      "export const beforeLoad = async () => undefined; export default function About() { return null; }",
    );
    writeAppFile(
      "src/app/users/[id]/page.tsx",
      "export default function User() { return null; } export function beforeLoad() {}",
    );
    writeAppFile("src/app/components/button.tsx", "export default function Button() { return null; }");
    writeAppFile("src/app/_private/page.tsx", "export default function Private() { return null; }");
    writeAppFile("src/app/example.test.tsx", "export default function TestPage() { return null; }");

    const source = [
      'import { toFileRouter as appRoutes } from "vynn-router";',
      'export const routes = appRoutes("./app");',
    ].join("\n");
    const watchedFiles: string[] = [];

    const transformed = transformFileRouterCalls(
      source,
      resolve(root, "src", "routes.ts"),
      root,
      (filePath) => watchedFiles.push(filePath),
    );

    expect(transformed).not.toBeNull();
    expect(transformed).toContain(
      'appRoutes("/src/app", import.meta.glob(["/src/app/**/{page,layout,not-found}.{js,jsx,ts,tsx,mjs,mts}", "!/src/app/**/_*/**/{page,layout,not-found}.{js,jsx,ts,tsx,mjs,mts}"])',
    );
    expect(transformed).toContain(
      '"path":"/src/app/page.tsx","kind":"page","beforeLoad":false',
    );
    expect(transformed).toContain(
      '"path":"/src/app/layout.tsx","kind":"layout","beforeLoad":true',
    );
    expect(transformed).toContain(
      '"path":"/src/app/not-found.tsx","kind":"not-found","beforeLoad":false',
    );
    expect(transformed).toContain(
      '"path":"/src/app/blog/not-found.tsx","kind":"not-found","beforeLoad":false',
    );
    expect(transformed).toContain(
      '"path":"/src/app/about/page.tsx","kind":"page","beforeLoad":true',
    );
    expect(transformed).toContain(
      '"path":"/src/app/users/[id]/page.tsx","kind":"page","beforeLoad":true',
    );
    expect(transformed).not.toContain("_private");
    expect(transformed).not.toContain("components/button");
    expect(transformed).not.toContain("example.test");
    expect(watchedFiles).toContain(resolve(root, "src", "app", "page.tsx"));
    expect(watchedFiles).toContain(resolve(root, "src", "app", "about", "page.tsx"));
    expect(watchedFiles).toContain(resolve(root, "src", "app", "not-found.tsx"));
    expect(watchedFiles).toContain(resolve(root, "src", "app", "blog", "not-found.tsx"));
  });

  it("supports root-absolute app directories", () => {
    const root = createProject();
    writeAppFile("src/app/page.tsx", "export default function Home() { return null; }");

    const transformed = transformFileRouterCalls(
      'import { toFileRouter } from "vynn-router"; const routes = toFileRouter("/src/app");',
      resolve(root, "src", "routes.ts"),
      root,
    );

    expect(transformed).toContain(
      'toFileRouter("/src/app", import.meta.glob(["/src/app/**/{page,layout,not-found}.',
    );
  });

  it("requires a static directory string", () => {
    const root = createProject();
    const source =
      'import { toFileRouter } from "vynn-router"; const routes = toFileRouter(getAppDirectory());';

    expect(() =>
      transformFileRouterCalls(source, resolve(root, "src", "routes.ts"), root),
    ).toThrow("directory must be a string literal");
  });

  it("rejects unsupported parallel route folders", () => {
    const root = createProject();
    writeAppFile("src/app/@modal/page.tsx", "export default function Modal() { return null; }");

    const source =
      'import { toFileRouter } from "vynn-router"; const routes = toFileRouter("/src/app");';

    expect(() =>
      transformFileRouterCalls(source, resolve(root, "src", "routes.ts"), root),
    ).toThrow("Parallel route slots are not supported yet");
  });

  it("rejects unsupported intercepting route folders", () => {
    const root = createProject();
    writeAppFile("src/app/(.)photo/page.tsx", "export default function Photo() { return null; }");

    const source =
      'import { toFileRouter } from "vynn-router"; const routes = toFileRouter("/src/app");';

    expect(() =>
      transformFileRouterCalls(source, resolve(root, "src", "routes.ts"), root),
    ).toThrow("Intercepting route folders are not supported yet");
  });

  it("requires page and layout files to have a default export", () => {
    const root = createProject();
    writeAppFile("src/app/page.tsx", "export const page = true;");

    const source =
      'import { toFileRouter } from "vynn-router"; const routes = toFileRouter("/src/app");';

    expect(() =>
      transformFileRouterCalls(source, resolve(root, "src", "routes.ts"), root),
    ).toThrow("must have a default component export");
  });

  it("ignores unrelated router imports and unbound function names", () => {
    const root = createProject();
    const source = 'import { createRouter } from "vynn-router"; createRouter({ routes: [] });';

    expect(transformFileRouterCalls(source, resolve(root, "src", "routes.ts"), root)).toBeNull();
  });
});
