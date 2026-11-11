export const ApiReferencePage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Reference</p>
    <h1>API overview</h1>
    <p class="lead">
      This page maps the public exports from Vynn Core. It includes the package root and each
      supported subpath so you can find the right import before diving into its detailed reference.
    </p>

    <h2>Core package: vynn</h2>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Export</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>$state()</code>, <code>State&lt;T&gt;</code>
            </td>
            <td>
              Writable ref-like state. An async-function initializer creates writable async-derived
              state.
            </td>
          </tr>
          <tr>
            <td>
              <code>$store()</code>
            </td>
            <td>
              Deeply reactive object and collection proxy with property and structural tracking.
            </td>
          </tr>
          <tr>
            <td>
              <code>$computed()</code>, <code>Computed&lt;T&gt;</code>, <code>ComputedOptions</code>
            </td>
            <td>
              Read-only derived values, including Promise-returning getters and lazy initial
              evaluation.
            </td>
          </tr>
          <tr>
            <td>
              <code>$effect()</code>
            </td>
            <td>Reactive side effects scheduled through the ordinary effect queue.</td>
          </tr>
          <tr>
            <td>
              <code>$renderEffect()</code>
            </td>
            <td>
              Synchronous render-phase effects for integrations that need synchronous commit
              behavior.
            </td>
          </tr>
          <tr>
            <td>
              <code>untrack()</code>
            </td>
            <td>Runs a callback without collecting reactive dependencies.</td>
          </tr>
          <tr>
            <td>
              <code>Async&lt;T&gt;</code>, <code>isPending()</code>
            </td>
            <td>Async value type and helper for checking whether an async value is refreshing.</td>
          </tr>
          <tr>
            <td>
              <code>createContext()</code>
            </td>
            <td>Creates a provider component and matching consumer function.</td>
          </tr>
          <tr>
            <td>
              <code>onMount()</code>, <code>onDestroy()</code>
            </td>
            <td>Register component mount work and owner-disposal cleanup.</td>
          </tr>
          <tr>
            <td>
              <code>Await</code>, <code>ErrorBoundary</code>
            </td>
            <td>Handle initially pending content and rendering errors.</td>
          </tr>
          <tr>
            <td>
              <code>lazy()</code>, <code>Portal</code>
            </td>
            <td>Load components dynamically and render content into another DOM element.</td>
          </tr>
          <tr>
            <td>
              <code>getOwner()</code>, <code>createOwner()</code>, <code>runWithOwner()</code>,{" "}
              <code>disposeOwner()</code>
            </td>
            <td>Inspect, create, activate, and dispose owner scopes.</td>
          </tr>
          <tr>
            <td>
              <code>JSX</code>, <code>FC&lt;P&gt;</code>, <code>PropsWithChildren&lt;P&gt;</code>,{" "}
              <code>PropsWithRef&lt;P&gt;</code>
            </td>
            <td>JSX namespace, function component type, and common component prop helpers.</td>
          </tr>
          <tr>
            <td>
              <code>RenderMode</code>
            </td>
            <td>
              Server render mode type: <code>"sync"</code>, <code>"async"</code>, or{" "}
              <code>"stream"</code>.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Learn the standard application behavior in{" "}
      <a href="/docs/core-concepts/reactivity">Reactivity</a>,
      <a href="/docs/core-concepts/advanced-reactivity">Advanced reactivity</a>,
      <a href="/docs/core-concepts/components">Components</a>,
      <a href="/docs/core-concepts/context-and-lifecycle">Context and lifecycle</a>, and
      <a href="/docs/core-concepts/async-ui">Async UI</a>. The
      <a href="/docs/reference/core-runtime">Advanced core APIs</a> reference covers effect phases,
      owners, and component helper types.
    </p>

    <h2>Public package subpaths</h2>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Import</th>
            <th>Named exports</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>vynn/jsx-runtime</code>
            </td>
            <td>
              <code>JSX</code>
            </td>
            <td>
              JSX type namespace used by TypeScript through <code>jsxImportSource</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>vynn/client</code>
            </td>
            <td>
              <code>renderToDOM()</code>, <code>hydrateToDOM()</code>
            </td>
            <td>Manual client mounting and hydration. Both return an unmount function.</td>
          </tr>
          <tr>
            <td>
              <code>vynn/server</code>
            </td>
            <td>
              <code>renderToServer()</code>, <code>SsrRenderResult</code>,{" "}
              <code>SsrHeadManager</code>,<code>getRequestContext()</code>,{" "}
              <code>RequestContext</code>,<code>RequestContextLocals</code>,{" "}
              <code>ServerFunctionCookieOptions</code>,<code>injectSsrPreloadLinks()</code>,{" "}
              <code>renderSsrPreloadLinks()</code>,<code>SsrClientManifest</code>,{" "}
              <code>SsrPreloadLinkOptions</code>,<code>createServerFunctionHandler()</code>,{" "}
              <code>createServerReference()</code>,<code>getServerFunctionImplementation()</code>,{" "}
              <code>ServerFunctionError</code>,<code>registerServerFunctionCodec()</code>,
              <code>serializeServerFunctionValue()</code>,
              <code>deserializeServerFunctionValue()</code>,<code>ServerFunctionCodec</code>,{" "}
              <code>ServerFunctionHandlerOptions</code>,<code>ServerFunctionImplementation</code>,{" "}
              <code>ServerFunctionResolver</code>,<code>ServerFunctionErrorData</code>,{" "}
              <code>ServerFunctionErrorOptions</code>
            </td>
            <td>SSR, head and asset preloading, request context, and server-function hosting.</td>
          </tr>
          <tr>
            <td>
              <code>vynn/server/node</code>
            </td>
            <td>
              <code>createListener()</code>, <code>toWebRequest()</code>,{" "}
              <code>writeResponse()</code>,<code>ToWebRequestOptions</code>,{" "}
              <code>FetchRequestHandler</code>,<code>NodeNextFunction</code>,{" "}
              <code>NodeListener</code>, <code>NodeListenerOptions</code>
            </td>
            <td>Bridge Node HTTP servers to Fetch-compatible handlers.</td>
          </tr>
          <tr>
            <td>
              <code>vynn/server-functions/client</code>
            </td>
            <td>
              <code>createServerReference()</code>, <code>invokeServerFunction()</code>,
              <code>registerServerFunctionCodec()</code>,<code>serializeServerFunctionValue()</code>
              ,<code>deserializeServerFunctionValue()</code>, <code>ServerFunctionError</code>,
              <code>ClientServerFunctionOptions</code>,
              <code>ClientServerFunctionCaptureProvider</code>, <code>ServerFunction</code>,
              <code>ServerFunctionInvocationOptions</code>, <code>ServerFunctionCodec</code>,
              <code>ServerFunctionErrorData</code>, <code>ServerFunctionErrorOptions</code>
            </td>
            <td>Low-level browser RPC references and invocation controls.</td>
          </tr>
          <tr>
            <td>
              <code>vynn/server-functions/server</code>
            </td>
            <td>
              <code>createServerFunctionHandler()</code>, <code>createServerReference()</code>,
              <code>getServerFunctionImplementation()</code>,
              <code>registerServerFunctionCodec()</code>,<code>serializeServerFunctionValue()</code>
              ,<code>deserializeServerFunctionValue()</code>, <code>ServerFunctionError</code>,
              <code>ServerFunctionRequestPayload</code>, <code>ServerFunctionImplementation</code>,
              <code>ServerFunctionResolver</code>, <code>ServerFunctionHandlerOptions</code>,
              <code>ServerFunctionCodec</code>, <code>ServerFunctionErrorData</code>,
              <code>ServerFunctionErrorOptions</code>
            </td>
            <td>Low-level server RPC handler and implementation registry.</td>
          </tr>
          <tr>
            <td>
              <code>vynn/render</code>
            </td>
            <td>
              <code>$attr</code>, <code>$cache</code>, <code>$cmpnt</code>, <code>$for</code>,
              <code>$head</code>, <code>$headTmpl</code>, <code>$if</code>, <code>$insert</code>,
              <code>$nodes</code>, <code>$on</code>, <code>$spread</code>, <code>$tmpl</code>,
              <code>$txt</code>
            </td>
            <td>Low-level JSX runtime helpers imported by generated compiler output.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Server and runtime references</h2>
    <ul>
      <li>
        <a href="/docs/reference/server-integration">Server integration APIs</a> documents{" "}
        <code>SsrRenderResult</code>, <code>SsrHeadManager</code>, request context types, preload
        helpers, and Node adapter types.
      </li>
      <li>
        <a href="/docs/reference/server-functions">Server functions API</a> documents client/server
        helper types, handler options, codecs, serializers, and invocation controls.
      </li>
      <li>
        <a href="/docs/reference/compiler">Compiler and build tooling</a> explains the{" "}
        <code>vynn/render</code> runtime exports and why application code should normally use JSX
        instead.
      </li>
    </ul>

    <h2>Build tooling</h2>
    <ul>
      <li>
        <code>vite-plugin-vynn</code>: integrated Vite app handling, JSX compilation, optional SSR,
        and optional server functions. Its default export is <code>vynn()</code>.
      </li>
      <li>
        <code>vynn-compiler</code>: standalone JSX transforms through
        <code>transformVynnOxc()</code> and <code>transformVynnOxcWithMap()</code>.
      </li>
    </ul>
    <p>
      Continue to <a href="/docs/reference/compiler">Compiler and build tooling</a> for transform
      options, or see the <a href="/docs/guides/rendering">Rendering</a> and
      <a href="/docs/guides/server-functions">Server functions</a> guides for the standard Vite
      workflow.
    </p>
  </article>
);
