import { CodeBlock } from "../components/code-block";

export const ServerIntegrationPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Reference</p>
    <h1>Server integration APIs</h1>
    <p class="lead">
      Vynn's server entry point exposes the primitives used by custom SSR hosts: render results,
      head updates, asset preloads, request context, and a Node HTTP adapter.
    </p>

    <h2>Understand the SSR result</h2>
    <p>
      <code>renderToServer()</code> accepts a root function, an explicit render mode, and an
      optional Web <code>Request</code>. It returns an <code>SsrRenderResult</code> containing the
      rendered body, a head manager, and the set of module IDs reached while rendering.
    </p>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Return value</th>
            <th>When it is useful</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>"sync"</code>
            </td>
            <td>
              <code>SsrRenderResult&lt;string&gt;</code>
            </td>
            <td>Only when rendering is guaranteed not to suspend.</td>
          </tr>
          <tr>
            <td>
              <code>"async"</code>
            </td>
            <td>
              <code>Promise&lt;SsrRenderResult&lt;string&gt;&gt;</code>
            </td>
            <td>When the host needs the complete HTML string before responding.</td>
          </tr>
          <tr>
            <td>
              <code>"stream"</code>
            </td>
            <td>
              <code>SsrRenderResult&lt;ReadableStream&lt;Uint8Array&gt;&gt;</code>
            </td>
            <td>When the response should begin while async boundaries are still resolving.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <CodeBlock
      lang="tsx"
      code={
        'import { renderToServer } from "vynn/server";\n\nconst result = await renderToServer(\n  () => App(),\n  "async",\n  request,\n);\n\nconst html = result.body;\nconst headHtml = result.head.render();\nconst renderedModules = result.modules;'
      }
    />
    <p>
      Pass the incoming request when the render needs request-scoped data or when server functions
      invoked during rendering may update response metadata. In that case, the result can also
      contain <code>response</code>, with the final status and headers recorded in the active
      request context. That status is limited to body-bearing 2xx responses; use an HTTP
      <code>Response</code> or a server-function error for redirect and failure responses.
    </p>

    <h2>Manage document head output</h2>
    <p>
      The result's <code>head</code> implements <code>SsrHeadManager</code>. Its
      <code>render()</code> method returns the current serialized head markup. Its
      <code>subscribe(listener)</code> method reports later head changes and returns an unsubscribe
      function. This is useful when a streaming render discovers additional head entries after the
      first response chunk.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        "const unsubscribe = result.head.subscribe((nextHeadHtml) => {\n  writeHeadUpdate(nextHeadHtml);\n});\n\n// Stop listening when the stream or request has finished.\nunsubscribe();"
      }
    />
    <p>
      Application code normally declares native <code>title</code>, <code>meta</code>, and
      <code>link</code> elements in JSX. The head manager is for a custom server integration that
      needs to read or forward the serialized result.
    </p>

    <h2>Preload modules discovered during SSR</h2>
    <p>
      <code>renderSsrPreloadLinks()</code> converts module IDs from an SSR render into stylesheet
      and module-preload link tags using a client asset manifest. Its options let an integration
      choose an asset base, use Vite development URLs, or provide a mutable set of files that were
      already linked.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { renderSsrPreloadLinks } from "vynn/server";\n\nconst alreadyLinked = new Set<string>();\nconst links = renderSsrPreloadLinks(result.modules, clientManifest, {\n  base: "/",\n  dev: false,\n  exclude: alreadyLinked,\n});'
      }
    />
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Option</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>base</code>
            </td>
            <td>
              Prefix used when building asset URLs. Defaults to <code>"/"</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>dev</code>
            </td>
            <td>
              Use development-server module URLs instead of looking up production manifest assets.
            </td>
          </tr>
          <tr>
            <td>
              <code>exclude</code>
            </td>
            <td>
              A set of asset URLs already emitted. The function updates this set as it discovers new
              files.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      For streaming SSR, pass the same <code>exclude</code> set before each emitted chunk. This
      allows newly discovered lazy modules to add their assets without repeating links that were
      already sent. The <code>SsrClientManifest</code> type is a record mapping module IDs to the
      asset files associated with those modules. The corresponding{" "}
      <code>SsrPreloadLinkOptions</code>
      type describes the <code>base</code>, <code>dev</code>, and <code>exclude</code> settings.
    </p>
    <p>
      <code>injectSsrPreloadLinks()</code> turns the generated link markup into a small browser-side
      script that places those links in <code>document.head</code>. It is intended for integrations
      that need to inject preload links into an already-streaming document while keeping them out of
      the hydrated application content.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { injectSsrPreloadLinks } from "vynn/server";\n\nconst preloadPatch = injectSsrPreloadLinks(links);\nstream.enqueue(encoder.encode(preloadPatch));'
      }
    />

    <h2>Read request-scoped server context</h2>
    <p>
      <code>getRequestContext()</code> returns the context active for an SSR render or server
      function invocation. It is request-scoped and remains available across awaited work in that
      request.
    </p>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Property</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>request</code>
            </td>
            <td>
              The incoming Web <code>Request</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>functionId</code>
            </td>
            <td>
              The current server-function ID, or <code>null</code> outside a specific function
              invocation.
            </td>
          </tr>
          <tr>
            <td>
              <code>signal</code>
            </td>
            <td>
              An <code>AbortSignal</code> for client cancellation or request disconnects.
            </td>
          </tr>
          <tr>
            <td>
              <code>response.status</code>
            </td>
            <td>
              Mutable body-bearing 2xx status for the outgoing response. Statuses 204 and 205 are
              not accepted here.
            </td>
          </tr>
          <tr>
            <td>
              <code>response.headers</code>
            </td>
            <td>
              A standard <code>Headers</code> object applied to the outgoing response.
            </td>
          </tr>
          <tr>
            <td>
              <code>cookies</code>
            </td>
            <td>Helpers to read incoming cookies and append outgoing cookie writes.</td>
          </tr>
          <tr>
            <td>
              <code>locals</code>
            </td>
            <td>
              A request-local <code>RequestContextLocals</code> map for sharing typed values across
              server integrations.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <CodeBlock
      lang="tsx"
      code={
        'import { getRequestContext } from "vynn/server";\n\ntype Session = { userId: string };\n\nconst context = getRequestContext();\nconst session = context.locals.get<Session>("session");\n\ncontext.response.headers.set("cache-control", "no-store");\ncontext.cookies.set("visited", "yes", {\n  httpOnly: true,\n  secure: true,\n  sameSite: "Lax",\n  path: "/",\n});'
      }
    />
    <p>
      The exported context types are <code>RequestContext</code>,<code>RequestContextLocals</code>,
      and <code>ServerFunctionCookieOptions</code>. Cookie options include <code>domain</code>,{" "}
      <code>expires</code>, <code>httpOnly</code>,<code>maxAge</code>, <code>path</code>,{" "}
      <code>sameSite</code>, and <code>secure</code>;<code>sameSite</code> accepts{" "}
      <code>"Strict"</code>, <code>"Lax"</code>, or
      <code>"None"</code>. <code>cookies.delete()</code> writes an expired cookie. The
      <code>RequestContextLocals</code> class is a <code>Map</code> with a generic
      <code>get&lt;T&gt;()</code> for typed reads.
    </p>
    <p>
      Calling <code>getRequestContext()</code> outside an active server request throws. Keep this
      import in server-only modules.
    </p>

    <h2>Adapt a Fetch handler to Node HTTP</h2>
    <p>
      The <code>vynn/server/node</code> entry point bridges Node's
      <code>IncomingMessage</code> and <code>ServerResponse</code> types with Web-standard
      <code>Request</code> and <code>Response</code> objects.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { createListener } from "vynn/server/node";\n\nconst listener = createListener(async (request) => {\n  return handleWebRequest(request);\n}, {\n  origin: "https://app.example.com",\n  onError(error, request, response) {\n    logger.error({ error, url: request.url, status: response.statusCode });\n  },\n});\n\nnodeServer.on("request", listener);'
      }
    />
    <p>
      <code>createListener()</code> returns middleware that can be passed to
      <code>node:http.createServer()</code> or mounted in Express. It converts the incoming request,
      calls your Fetch-compatible handler, and streams the Web response back to Node. When a
      downstream <code>next</code> callback is available, handler errors are passed to it; otherwise
      the adapter sends a generic 500 response when headers have not been sent.
    </p>
    <p>
      If you already have a Node HTTP server and do not need the listener wrapper, call the two
      adapters directly. <code>toWebRequest()</code> converts the incoming Node request, and
      <code>writeResponse()</code> streams the Fetch response back to Node:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { createServer } from "node:http";\nimport { toWebRequest, writeResponse } from "vynn/server/node";\n\nconst server = createServer(async (incoming, outgoing) => {\n  try {\n    const request = toWebRequest(incoming, { origin: "https://app.example.com" });\n    const response = await handleWebRequest(request);\n    await writeResponse(outgoing, response, incoming.method ?? "GET");\n  } catch (error) {\n    logger.error(error);\n    if (outgoing.headersSent) {\n      outgoing.destroy(error instanceof Error ? error : undefined);\n      return;\n    }\n    outgoing.statusCode = 500;\n    outgoing.end("Internal Server Error");\n  }\n});\n\nserver.listen(3000);'
      }
    />
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>API or option</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>toWebRequest(request, options?)</code>
            </td>
            <td>
              Converts a Node request to a Web <code>Request</code>, preserving headers and
              streaming request bodies.
            </td>
          </tr>
          <tr>
            <td>
              <code>writeResponse(target, response, requestMethod?)</code>
            </td>
            <td>
              Writes a Web <code>Response</code> to a Node <code>ServerResponse</code>, including
              headers, cookies, and streaming bodies.
            </td>
          </tr>
          <tr>
            <td>
              <code>createListener(handler, options?)</code>
            </td>
            <td>Creates a Node listener around a Fetch-compatible request handler.</td>
          </tr>
          <tr>
            <td>
              <code>url</code>
            </td>
            <td>
              Overrides the incoming request URL with a string or callback. Express{" "}
              <code>originalUrl</code> is detected when available.
            </td>
          </tr>
          <tr>
            <td>
              <code>origin</code>
            </td>
            <td>
              Sets the public origin used to resolve relative URLs, including when running behind a
              reverse proxy.
            </td>
          </tr>
          <tr>
            <td>
              <code>onError</code>
            </td>
            <td>
              Receives handler or response-stream errors before the adapter forwards or handles
              them.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The exported Node types are <code>ToWebRequestOptions</code>, <code>FetchRequestHandler</code>
      ,<code>NodeNextFunction</code>, <code>NodeListener</code>, and
      <code>NodeListenerOptions</code>. If the Vite plugin already generated a Node server entry for
      your app, use that listener instead of building a second adapter around it.
    </p>
  </article>
);
