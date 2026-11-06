import { injectSsrPreloadLinks, renderSsrPreloadLinks } from "vynn/server";

import type { VynnSsrCssLink } from "../ssr-css.ts";
import type { ViteSsrManifest } from "../ssr-preload.ts";

type SsrRenderResult = {
  body: string | Uint8Array | ReadableStream<Uint8Array>;
  head: {
    render(): string;
  };
  modules: Iterable<string>;
};

export type SsrHandlerOptions = {
  render(url: string): SsrRenderResult | Response | Promise<SsrRenderResult | Response>;
  clientEntryUrl: string;
  css: string[];
  base: string;
  dev: boolean;
  ssrManifest: ViteSsrManifest | null;
  handleServerFunctionRequest?: (request: Request) => Promise<Response | null>;
};

function escapeAttribute(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapInternalRange(value: string): string {
  return value ? "<!--vynn:internal:start-->" + value + "<!--vynn:internal:end-->" : "";
}

function isWebResponse(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;

  const response = value as Response;

  return (
    typeof response.status === "number" &&
    !!response.headers &&
    typeof response.headers.forEach === "function" &&
    "body" in response &&
    (response.body === null || typeof response.body?.getReader === "function") &&
    typeof response.arrayBuffer === "function"
  );
}

function assetUrl(path: string, base: string): string {
  const value = String(path).replace(/^\/+/, "");

  if (base === "./") return "./" + value;
  if (/^https?:\/\//.test(base)) return base.replace(/\/$/, "") + "/" + value;

  const prefix = base === "/" ? "" : base.replace(/\/$/, "");
  return prefix + "/" + value;
}

function createHeadAssets(
  dev: boolean,
  base: string,
  css: string[],
  devCssLinks: VynnSsrCssLink[],
  preloadLinks: string,
  headHtml: string,
  patchRuntime: string,
): string {
  const charset = headHtml.toLowerCase().includes("charset=")
    ? ""
    : wrapInternalRange('<meta charset="UTF-8">');

  const cssLinks = dev
    ? devCssLinks
        .map(
          (link) =>
            '<link rel="stylesheet" data-vite-dev-id="' +
            escapeAttribute(link.id) +
            '" href="' +
            escapeAttribute(assetUrl(link.url + "?direct", base)) +
            '">',
        )
        .join("")
    : css
        .map(
          (file) =>
            '<link rel="stylesheet" href="' +
            escapeAttribute(assetUrl(file, base)) +
            '">',
        )
        .join("");

  const viteClient = dev
    ? '<script type="module" src="' +
      escapeAttribute(assetUrl("/@vite/client", base)) +
      '"></script>'
    : "";

  return (
    charset +
    headHtml +
    wrapInternalRange(cssLinks) +
    wrapInternalRange(preloadLinks) +
    wrapInternalRange(viteClient) +
    wrapInternalRange(patchRuntime)
  );
}

function asReadableStream(value: unknown): ReadableStream<Uint8Array> {
  if (value instanceof ReadableStream) return value;

  if (typeof value === "string" || value instanceof Uint8Array) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value.slice();

    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  throw new TypeError(
    "[Vynn App] The SSR render result body must be a string, Uint8Array, or ReadableStream.",
  );
}

async function peekStream(
  body: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader();

  let first: ReadableStreamReadResult<Uint8Array>;

  try {
    first = await reader.read();
  } catch (error) {
    reader.releaseLock();
    throw error;
  }

  let firstPending = true;
  let released = false;

  const release = (): void => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let result: ReadableStreamReadResult<Uint8Array>;

        if (firstPending) {
          firstPending = false;
          result = first;
        } else {
          result = await reader.read();
        }

        if (result.done) {
          controller.close();
          release();
          return;
        }

        controller.enqueue(result.value);
      } catch (error) {
        release();
        controller.error(error);
      }
    },

    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        release();
      }
    },
  });
}

function withDocument(
  body: ReadableStream<Uint8Array>,
  dev: boolean,
  base: string,
  css: string[],
  clientEntryUrl: string,
  ssrManifest: ViteSsrManifest | null,
  devCssLinks: VynnSsrCssLink[],
  moduleIds: Iterable<string>,
  headHtml: string,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const seenPreloads = new Set(css);

  const preloadLinks = (): string =>
    renderSsrPreloadLinks(moduleIds, ssrManifest, {
      base,
      dev,
      exclude: seenPreloads,
    });

  const clientEntry =
    '<script type="module" src="' + escapeAttribute(clientEntryUrl) + '"></script>';

  let buffer = "";
  let foundHtml = false;
  let injectedHead = false;
  let removedBodyClose = false;
  let removedHtmlClose = false;
  let headAssets = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (value: string): void => {
        if (value) controller.enqueue(encoder.encode(value));
      };

      function flushDocumentBody(final: boolean): void {
        if (!removedBodyClose) {
          const endBody = buffer.toLowerCase().indexOf("</body>");

          if (endBody === -1) {
            if (final) {
              throw new TypeError("[Vynn App] The root document is missing a closing </body> tag.");
            }

            const safeLength = Math.max(0, buffer.length - 7);
            emit(buffer.slice(0, safeLength));
            buffer = buffer.slice(safeLength);
            return;
          }

          emit(buffer.slice(0, endBody));
          buffer = buffer.slice(endBody + 7);
          removedBodyClose = true;
        }

        if (!removedHtmlClose) {
          const endHtml = buffer.toLowerCase().indexOf("</html>");

          if (endHtml === -1) {
            if (final) {
              throw new TypeError("[Vynn App] The root document is missing a closing </html> tag.");
            }

            const safeLength = Math.max(0, buffer.length - 7);
            emit(buffer.slice(0, safeLength));
            buffer = buffer.slice(safeLength);
            return;
          }

          emit(buffer.slice(0, endHtml));
          buffer = buffer.slice(endHtml + 7);
          removedHtmlClose = true;
        }

        if (removedHtmlClose && buffer) {
          emit(buffer);
          buffer = "";
        }
      }

      function transform(text: string, final = false): void {
        buffer += text;

        if (!foundHtml) {
          const match = /<html(?:\s|>)/i.exec(buffer);

          if (!match) {
            if (final) {
              throw new TypeError(
                "[Vynn App] The root component must render a complete <html> document.",
              );
            }
            return;
          }

          let prefix = buffer.slice(0, match.index);
          const doctype = /<!doctype\s+html[^>]*>/i.exec(prefix);

          emit(doctype ? doctype[0] : "<!doctype html>");

          if (doctype) prefix = prefix.replace(doctype[0], "");

          const patchRuntime = prefix.trim();

          headAssets = createHeadAssets(
            dev,
            base,
            css,
            devCssLinks,
            preloadLinks(),
            headHtml,
            patchRuntime,
          );

          buffer = buffer.slice(match.index);
          foundHtml = true;
        }

        if (!injectedHead) {
          const endHead = buffer.toLowerCase().indexOf("</head>");

          if (endHead === -1) {
            if (final) {
              throw new TypeError("[Vynn App] The root document is missing a closing </head> tag.");
            }
            return;
          }

          emit(buffer.slice(0, endHead) + headAssets + "</head>");
          buffer = buffer.slice(endHead + 7);
          injectedHead = true;
        }

        flushDocumentBody(final);
      }

      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;

          const links = injectedHead ? preloadLinks() : "";
          if (links) emit(injectSsrPreloadLinks(links));

          transform(decoder.decode(result.value, { stream: true }));
        }

        transform(decoder.decode(), true);

        if (!foundHtml || !injectedHead || !removedBodyClose || !removedHtmlClose) {
          throw new TypeError("[Vynn App] Could not inject assets into the root HTML document.");
        }

        emit(wrapInternalRange(clientEntry) + "</body></html>");
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },

    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Create the Fetch-compatible request handler used by Vynn's integrated SSR
 * application. The generated virtual module supplies build-specific assets
 * and the application render function; the request and stream handling stays
 * in this regular, typed module.
 */
export function createSsrHandler(options: SsrHandlerOptions) {
  return async function handleRequest(
    request: Request,
    devCssLinks: VynnSsrCssLink[] = [],
  ): Promise<Response> {
    const serverFunctionResponse = await options.handleServerFunctionRequest?.(request);
    if (serverFunctionResponse) return serverFunctionResponse;

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);
    const headers = { "content-type": "text/html; charset=utf-8" };

    let rendered: unknown;

    try {
      rendered = await options.render(url.pathname + url.search);
    } catch (error) {
      if (isWebResponse(error)) return error;
      throw error;
    }

    if (isWebResponse(rendered)) return rendered;

    if (
      !rendered ||
      typeof rendered !== "object" ||
      !("body" in rendered) ||
      !("head" in rendered) ||
      !("modules" in rendered) ||
      typeof (rendered as SsrRenderResult).head?.render !== "function"
    ) {
      throw new TypeError(
        "[Vynn App] The server entry render() must return a Vynn SSR render result or Response.",
      );
    }

    const result = rendered as SsrRenderResult;
    let body: ReadableStream<Uint8Array>;

    try {
      body = await peekStream(asReadableStream(result.body));
    } catch (error) {
      if (isWebResponse(error)) return error;
      throw error;
    }

    if (request.method === "HEAD") {
      await body.cancel();
      return new Response(null, { status: 200, headers });
    }

    const headHtml = result.head.render();

    return new Response(
      withDocument(
        body,
        options.dev,
        options.base,
        options.css,
        options.clientEntryUrl,
        options.ssrManifest,
        devCssLinks,
        result.modules,
        headHtml,
      ),
      {
        status: 200,
        headers,
      },
    );
  };
}
