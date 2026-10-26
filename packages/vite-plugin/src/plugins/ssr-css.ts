import type { Plugin, ViteDevServer } from "vite";

export const VYNN_SSR_CSS_URL = "/@vynn/ssr.css";

type ModuleNode = {
  id: string | null;
  url: string;
  file: string | null;
  type?: "js" | "css";
  importedModules: Set<ModuleNode>;
};

type ClientEnvironment = {
  transformRequest(url: string): Promise<unknown>;
  moduleGraph: {
    getModuleByUrl(url: string): Promise<ModuleNode | undefined>;
  };
};

export type VynnSsrCssCollector = {
  plugin: Plugin;
  registerEntryUrl(url: string): void;
};

export function createVynnSsrCssPlugin(): VynnSsrCssCollector {
  let base = "/";
  let isServe = false;

  const entryUrls = new Set<string>();

  function registerEntryUrl(src: string): void {
    const url = normalizeEntryUrl(src, base);

    if (url && !url.startsWith("/@vite/client")) {
      entryUrls.add(url);
    }
  }

  const plugin: Plugin = {
    name: "vynn:ssr-css",

    config(_config, env) {
      isServe = env.command === "serve";

      if (env.command === "build") {
        return {
          build: {
            cssCodeSplit: false,
          },
        };
      }
    },

    configResolved(config) {
      base = config.base || "/";
      isServe = config.command === "serve";
    },

    transformIndexHtml: {
      order: "pre",

      handler(html) {
        if (!isServe) return;

        const scriptRE = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;

        for (const match of html.matchAll(scriptRE)) {
          const src = match[2];

          if (
            !src ||
            /^(?:https?:)?\/\//i.test(src) ||
            /^(?:data:|blob:)/i.test(src)
          ) {
            continue;
          }

          registerEntryUrl(src);
        }

        return [
          {
            tag: "link",
            injectTo: "head",
            attrs: {
              rel: "stylesheet",
              href: joinBase(base, VYNN_SSR_CSS_URL),
            },
          },
        ];
      },
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? "/", "http://vynn.local").pathname;

        if (stripBase(pathname, base) !== VYNN_SSR_CSS_URL) {
          next();
          return;
        }

        void collectCssUrls(server, entryUrls)
          .then((urls) => {
            const css = urls
              .map(
                (url) =>
                  `@import url(${JSON.stringify(
                    joinBase(base, `${url.split("?", 1)[0]}?direct`),
                  )});`,
              )
              .join("\n");

            res.statusCode = 200;
            res.setHeader("Content-Type", "text/css; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache");
            res.end(css);
          })
          .catch(next);
      });
    },
  };

  return {
    plugin,
    registerEntryUrl,
  };
}

async function collectCssUrls(
  server: ViteDevServer,
  entryUrls: Set<string>,
): Promise<string[]> {
  const environment = server.environments
    .client as unknown as ClientEnvironment;

  const visited = new Set<string>();
  const cssUrls = new Set<string>();

  function isGlobModule(module: ModuleNode): boolean {
    const id = module.id ?? module.file ?? module.url;

    // Vite may represent glob imports as patterns, not real files.
    return /[*{}]/.test(id) || /[*{}]/.test(module.url);
  }

  function isOptimizedDependency(module: ModuleNode): boolean {
    const id = (module.id ?? module.file ?? module.url).replace(/\\/g, "/");

    // These URLs can become stale while Vite is re-optimizing dependencies.
    return /\/node_modules\/\.vite\/deps\//.test(id);
  }

  function isCssModule(module: ModuleNode): boolean {
    const id = (module.id ?? module.file ?? module.url)
      .split("?", 1)[0]
      .replace(/\\/g, "/");

    const query = new URLSearchParams(module.url.split("?", 2)[1] ?? "");

    return (
      /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/i.test(id) &&
      !query.has("inline") &&
      !query.has("raw") &&
      !query.has("url")
    );
  }

  function getModulePath(module: ModuleNode): string {
    return (module.file ?? module.id ?? module.url)
      .split(/[?#]/, 1)[0]
      .replace(/\\/g, "/");
  }

  function isScriptModule(module: ModuleNode): boolean {
    return /\.(?:[cm]?[jt]sx?)$/i.test(getModulePath(module));
  }

  function isServerEntryModule(module: ModuleNode): boolean {
    const filename = getModulePath(module).split("/").pop() ?? "";

    return /^(?:server|entry-server)\.[cm]?[jt]sx?$/i.test(filename);
  }

  async function visitModule(
    initial: ModuleNode,
    parentIsCss = false,
  ): Promise<void> {
    if (isGlobModule(initial) || isOptimizedDependency(initial)) {
      return;
    }

    const initialIsCss = isCssModule(initial);

    // Stylesheet dependencies such as Tailwind's source-scanning files
    // must not be treated as application JavaScript dependencies.
    if (parentIsCss && !initialIsCss) return;

    // Never process HTML, assets, or unrelated file types as JS.
    if (!initialIsCss && !isScriptModule(initial)) return;

    // The Node server and SSR entry aren't browser dependencies.
    if (isServerEntryModule(initial)) return;

    const initialKey = initial.id ?? initial.url;

    if (visited.has(initialKey)) return;
    visited.add(initialKey);

    let module = initial;

    try {
      await environment.transformRequest(module.url);

      module =
        (await environment.moduleGraph.getModuleByUrl(module.url)) ?? module;
    } catch (error) {
      const code = (error as { code?: string })?.code;

      if (code !== "ERR_OUTDATED_OPTIMIZED_DEP") {
        console.warn(
          `[vynn:ssr-css] Could not process module: ${module.url}`,
          error,
        );
      }
    }

    const cssModule = isCssModule(module);

    if (cssModule) {
      cssUrls.add(module.url.split("?", 1)[0]);
    }

    const dependencies = [...module.importedModules].filter((dependency) => {
      if (isGlobModule(dependency) || isOptimizedDependency(dependency)) {
        return false;
      }

      if (isServerEntryModule(dependency)) return false;

      if (cssModule) {
        // CSS can import CSS. Its other graph dependencies may be
        // watched source files, not stylesheets that need linking.
        return isCssModule(dependency);
      }

      // Application modules can import scripts and stylesheets.
      return isCssModule(dependency) || isScriptModule(dependency);
    });

    await Promise.all(
      dependencies.map((dependency) => visitModule(dependency, cssModule)),
    );
  }

  async function visitEntry(url: string): Promise<void> {
    const path = url.split(/[?#]/, 1)[0];

    if (
      !/\.(?:[cm]?[jt]sx?|css|pcss|postcss|scss|sass|less|styl|stylus)$/i.test(
        path,
      )
    ) {
      return;
    }

    try {
      // Explicit entries are transformed first so Vite can populate
      // their dependency graph.
      await environment.transformRequest(url);
    } catch (error) {
      console.warn(`[vynn:ssr-css] Could not process entry: ${url}`, error);
      return;
    }

    const module = await environment.moduleGraph.getModuleByUrl(url);

    if (!module) {
      console.warn(`[vynn:ssr-css] Entry not found in module graph: ${url}`);
      return;
    }

    await visitModule(module);
  }

  await Promise.all([...entryUrls].map(visitEntry));

  return [...cssUrls];
}

function normalizeEntryUrl(src: string, base: string): string {
  const origin = "http://vynn.local";
  const baseUrl = new URL(base.startsWith("/") ? base : "/", origin);
  const url = new URL(src, baseUrl);

  let pathname = url.pathname;

  const basePath =
    base.startsWith("/") && base !== "/" ? base.replace(/\/+$/, "") : "";

  if (basePath && pathname.startsWith(`${basePath}/`)) {
    pathname = pathname.slice(basePath.length);
  }

  return `${pathname}${url.search}`;
}

function stripBase(pathname: string, base: string): string {
  const basePath =
    base.startsWith("/") && base !== "/" ? base.replace(/\/+$/, "") : "";

  if (basePath && pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return pathname;
}

function joinBase(base: string, pathname: string): string {
  if (/^https?:\/\//i.test(pathname)) return pathname;

  const path = `/${pathname.replace(/^\/+/, "")}`;

  if (base === "./") return `.${path}`;

  if (/^https?:\/\//i.test(base)) {
    return `${base.replace(/\/+$/, "")}${path}`;
  }

  const prefix = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;

  return `${prefix}${path}`;
}
