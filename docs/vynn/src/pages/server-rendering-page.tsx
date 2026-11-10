import { CodeBlock } from "../components/CodeBlock";

export const ServerRenderingPage = () => (
  <div>
    <h1>Server rendering</h1>
    <section>
      <p>
        The <code>vynn/server</code> entry point exposes
        <code>renderToServer()</code>. It renders a component tree to HTML without a browser DOM and
        returns the body together with metadata collected during that render.
      </p>

      <h2 class="mt-6">Render modes</h2>
      <p>
        Vynn supports three render modes. The mode determines whether the renderer returns
        immediately, waits for async work, or streams incremental output.
      </p>

      <h3 class="mt-4">Synchronous mode</h3>
      <CodeBlock
        lang="tsx"
        code={`
import { renderToServer } from "vynn/server";

const result = renderToServer(App, "sync");

const html = result.body; // string
const headHtml = result.head.render();
      `}
      />
      <p>
        <code>"sync"</code> returns a string body immediately. Use it when the component tree can be
        rendered synchronously. It does not wait for pending async resources; use{" "}
        <code>"async"</code> or
        <code>"stream"</code> when the output depends on asynchronous work.
      </p>

      <h3 class="mt-4">Async mode</h3>
      <CodeBlock
        lang="tsx"
        code={`
const result = await renderToServer(App, "async");

const html = result.body; // string
const headHtml = result.head.render();
      `}
      />
      <p>
        <code>"async"</code> waits for asynchronous render work to complete before resolving with
        the final HTML string. This is useful when the server must have the complete markup before
        sending a response.
      </p>

      <h3 class="mt-4">Streaming mode</h3>
      <CodeBlock
        lang="tsx"
        code={`
const result = renderToServer(App, "stream");

const body = result.body; // ReadableStream<Uint8Array>
const initialHead = result.head.render();
      `}
      />
      <p>
        <code>"stream"</code> returns a <code>ReadableStream</code>. Vynn can send the initial
        markup and async fallbacks first, then send patches when deferred content becomes available.
        Streaming lets the response begin before every async boundary has completed.
      </p>
      <p>
        The stream includes the runtime markup needed to apply streamed content patches. Send the
        stream as the response body rather than converting it to a string before transmission, or
        the streaming benefit is lost.
      </p>

      <h2 class="mt-6">Understanding the result</h2>
      <p>
        Every mode returns an <code>SsrRenderResult</code> with these fields:
      </p>
      <ul>
        <li>
          <code>body</code>: the rendered HTML string or byte stream, depending on the selected
          mode.
        </li>
        <li>
          <code>head</code>: an <code>SsrHeadManager</code> with <code>render()</code> and{" "}
          <code>subscribe()</code>.
        </li>
        <li>
          <code>modules</code>: a live read-only set of module IDs reached during the render,
          including modules discovered as lazy content is resolved.
        </li>
        <li>
          <code>response</code>: request response metadata when a <code>Request</code> was passed to{" "}
          <code>renderToServer()</code>.
        </li>
      </ul>

      <h2 class="mt-6">Document head management</h2>
      <p>
        Vynn collects supported document metadata declared by the component tree. Call{" "}
        <code>result.head.render()</code> to obtain the current head markup. During streaming,
        subscribe to head changes so metadata discovered in deferred content can be sent with the
        corresponding updates.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const result = renderToServer(App, "stream");

const currentHead = result.head.render();

const unsubscribe = result.head.subscribe((nextHeadHtml) => {
  // Forward the updated head snapshot through your document stream.
});

// Call unsubscribe when the response integration no longer needs updates.
      `}
      />

      <h2 class="mt-6">Passing the incoming request</h2>
      <p>
        The optional third argument is a Web-standard <code>Request</code>. Passing it creates a
        request context for the render. Core code that runs during that SSR request can then access
        request-scoped state through <code>getRequestContext()</code> from <code>vynn/server</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const result = await renderToServer(App, "async", request);
      `}
      />

      <h2 class="mt-6">Node HTTP integration</h2>
      <p>
        The <code>vynn/server/node</code> subpath provides
        <code>createListener()</code>, <code>toWebRequest()</code>, and
        <code>writeResponse()</code>. These helpers adapt Node's
        <code>IncomingMessage</code> and <code>ServerResponse</code> to the Web Request/Response
        interfaces. The listener accepts a Fetch-style request handler and preserves response
        streaming and backpressure.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { createServer } from "node:http";
import { createListener } from "vynn/server/node";

const fetchHandler = async (request: Request): Promise<Response> => {
  // Call your application request handler here.
  return new Response("Handled by the application");
};

createServer(createListener(fetchHandler)).listen(3000);
      `}
      />
      <h3 class="mt-4">Node adapter options</h3>
      <ul>
        <li>
          <code>url</code>: override the request URL with a string or a callback. Express's{" "}
          <code>originalUrl</code> is detected automatically when present.
        </li>
        <li>
          <code>origin</code>: override the public origin used to resolve relative URLs. This is
          useful behind a reverse proxy.
        </li>
        <li>
          <code>onError</code>: observe handler or response-stream failures. When the listener is
          mounted in middleware with a <code>next</code> callback, failures are passed to it.
        </li>
      </ul>
      <p>
        <code>toWebRequest()</code> is useful when you need only the Node-to-Web request conversion.{" "}
        <code>writeResponse()</code> writes a Web
        <code>Response</code> to a Node response and respects backpressure, request method,
        hop-by-hop headers, and client disconnects.
      </p>
      <p>
        The Node adapter does not choose your routes or construct the document shell. Your request
        handler remains responsible for invoking the renderer, combining the result with the
        document response, and setting the appropriate headers.
      </p>

      <h2 class="mt-6">Preload helpers</h2>
      <p>
        The server entry point also exports <code>renderSsrPreloadLinks()</code>
        and <code>injectSsrPreloadLinks()</code>. The former maps reached module IDs through a
        client manifest and returns stylesheet and module-preload link tags. The latter creates the
        small script used to place newly discovered links in <code>document.head</code> during
        streaming.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import {
  injectSsrPreloadLinks,
  renderSsrPreloadLinks,
  type SsrClientManifest,
} from "vynn/server";

const manifest: SsrClientManifest = {
  "/src/App.tsx": ["/assets/app.css", "/assets/app.js"],
};

const linkedAssets = new Set<string>();

const links = renderSsrPreloadLinks(result.modules, manifest, {
  base: "/",
  exclude: linkedAssets,
});

const streamPatch = injectSsrPreloadLinks(links);
      `}
      />
      <p>
        <code>renderSsrPreloadLinks()</code> accepts
        <code>base</code>, <code>dev</code>, and a shared
        <code>exclude</code> set. Reuse the same set across stream chunks to avoid emitting
        duplicate assets.
      </p>

      <h2 class="mt-6">API reference</h2>
      <h3>
        <code>renderToServer(App, mode, request?)</code>
      </h3>
      <p>
        Renders a component for the server. The mode is
        <code>"sync"</code>, <code>"async"</code>, or <code>"stream"</code>. The optional request
        establishes the request context for that render.
      </p>
    </section>
  </div>
);
