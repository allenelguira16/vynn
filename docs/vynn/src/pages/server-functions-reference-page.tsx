import { CodeBlock } from "../components/code-block";

export const ServerFunctionsReferencePage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Reference</p>
    <h1>Server functions API</h1>
    <p class="lead">
      The server-functions entry points expose lower-level client references, request handlers,
      cancellation, serialization, and custom codecs. Most applications should start with the
      function-level <code>"use server"</code> workflow in the
      <a href="/docs/guides/server-functions">Server functions guide</a>.
    </p>

    <h2>Know which entry point to import</h2>
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Entry point</th>
            <th>Use it for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>vynn/server-functions/client</code>
            </td>
            <td>
              Creating and invoking browser references, passing invocation signals, and registering
              serializers in the browser.
            </td>
          </tr>
          <tr>
            <td>
              <code>vynn/server-functions/server</code>
            </td>
            <td>
              Creating the Fetch RPC handler, registering implementations, resolving IDs, and using
              server-side serialization.
            </td>
          </tr>
          <tr>
            <td>
              <code>vynn/server</code>
            </td>
            <td>
              Server-side request context, SSR, and the server-function handler and serialization
              APIs used by the integrated server runtime.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The client and server entry points intentionally expose some similarly named helpers. Their
      <code>createServerReference()</code> functions have different signatures and jobs: the client
      creates a callable remote reference from an ID, while the server registers an implementation
      for an ID.
    </p>

    <h2>Create a client reference</h2>
    <p>
      <code>createServerReference()</code> from the client entry point creates a function that sends
      arguments to the configured RPC endpoint. Supply the generated function ID and, when needed,
      an endpoint override or a capture provider.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { createServerReference } from "vynn/server-functions/client";\n\n type LoadAccount = (accountId: string) => Promise<Account>;\n\nconst loadAccount = createServerReference<LoadAccount>(\n  "vynn_0123456789abcdefabcd",\n  { endpoint: "/__vynn/server-function" },\n);\n\nconst account = await loadAccount("acct_42");'
      }
    />
    <p>
      <code>ClientServerFunctionOptions</code> supports <code>endpoint</code> and
      <code>getCaptures</code>. The latter returns values to send alongside the call; a
      <code>ClientServerFunctionCaptureProvider</code> is the equivalent provider function type.
      <code>ServerFunction</code> is the function constraint used by the generic API.
    </p>
    <p>
      The callback itself stays in the browser; Vynn serializes the array of values it returns for
      that invocation. This does not send a JavaScript function or its source code to the server.
      Keep captures limited to the values the generated or custom server implementation expects. The
      default function-level compiler integration should remain the preferred way to create
      references in application code.
    </p>

    <h2>Pass cancellation to an invocation</h2>
    <p>
      Calling a generated reference directly uses its normal request behavior. Use
      <code>invokeServerFunction()</code> when a caller needs to attach a per-invocation
      <code>AbortSignal</code>. The signal cancels the browser request and is available to server
      code through <code>getRequestContext().signal</code>.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { invokeServerFunction } from "vynn/server-functions/client";\n\nconst controller = new AbortController();\nconst pending = invokeServerFunction(\n  loadAccount,\n  ["acct_42"],\n  { signal: controller.signal },\n);\n\n// Cancel when the UI no longer needs this request.\ncontroller.abort();\nawait pending;'
      }
    />
    <p>
      <code>ServerFunctionInvocationOptions</code> currently contains the optional
      <code>signal</code>. Passing a signal to a plain local function that is not a generated Vynn
      reference throws a <code>TypeError</code>, because there is no transport to cancel.
    </p>

    <h2>Create a Fetch-compatible server handler</h2>
    <p>
      <code>createServerFunctionHandler()</code> from the server entry point creates a Fetch handler
      for the RPC endpoint. It returns a <code>Promise&lt;Response | null&gt;</code>: a response
      when the request targets the configured endpoint, or <code>null</code> when the request is not
      for that endpoint.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { createServerFunctionHandler } from "vynn/server-functions/server";\n\nconst handleServerFunction = createServerFunctionHandler({\n  endpoint: "/__vynn/server-function",\n  maxRequestBytes: 1024 * 1024,\n  allowedOrigins: ["https://app.example.com"],\n  exposeErrors: false,\n  resolve: (id) => serverFunctions.get(id),\n});\n\nasync function handleRequest(request: Request) {\n  const rpcResponse = await handleServerFunction(request);\n  if (rpcResponse) return rpcResponse;\n\n  return handleApplicationRequest(request);\n}'
      }
    />
    <div class="not-prose my-5 overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Option</th>
            <th>Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>endpoint</code>
            </td>
            <td>
              Absolute pathname handled by this function. Defaults to{" "}
              <code>/__vynn/server-function</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>maxRequestBytes</code>
            </td>
            <td>Maximum accepted request body size. Defaults to 1 MiB.</td>
          </tr>
          <tr>
            <td>
              <code>allowedOrigins</code>
            </td>
            <td>Additional exact HTTP or HTTPS origins allowed to call the endpoint.</td>
          </tr>
          <tr>
            <td>
              <code>exposeErrors</code>
            </td>
            <td>
              Controls whether unexpected error messages are included in responses. Defaults to the{" "}
              <code>development</code> setting, which is false when omitted.
            </td>
          </tr>
          <tr>
            <td>
              <code>development</code>
            </td>
            <td>
              Provides the development default for error exposure when <code>exposeErrors</code> is
              not set.
            </td>
          </tr>
          <tr>
            <td>
              <code>resolve</code>
            </td>
            <td>
              Resolves a function ID to an implementation. When provided, the resolver is the
              authoritative allowlist.
            </td>
          </tr>
          <tr>
            <td>
              <code>resolveWithCaptures</code>
            </td>
            <td>
              Indicates that resolver implementations use the compiler-generated captures-first
              calling convention.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      The handler accepts POST requests with JSON bodies, checks the request origin and content
      type, enforces the request size limit, and rejects unknown IDs. Treat the endpoint as an
      untrusted HTTP boundary. Your implementation must still validate arguments, authenticate the
      caller, and authorize every operation.
    </p>

    <h2>Register a server implementation manually</h2>
    <p>
      The server-side <code>createServerReference()</code> registers an implementation under a
      validated function ID and returns a callable reference. The handler can then find it through
      <code>getServerFunctionImplementation()</code>. This is a lower-level integration tool; the
      compiler and Vite plugin normally manage generated implementations.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import {\n  createServerReference,\n  getServerFunctionImplementation,\n} from "vynn/server-functions/server";\n\nconst getStatus = createServerReference(\n  async (service: string) => readServiceStatus(service),\n  "vynn_0123456789abcdefabcd",\n);\n\nconst implementation = getServerFunctionImplementation(\n  "vynn_0123456789abcdefabcd",\n);'
      }
    />
    <p>
      The optional third argument to the server-side helper supplies captured values for
      capture-aware implementations. Use the resolver option when an integration needs a custom
      ID-to-implementation lookup; do not expose arbitrary runtime IDs as an authorization
      mechanism.
    </p>

    <h2>Serialize values across the boundary</h2>
    <p>
      The client and server entry points both export
      <code>serializeServerFunctionValue()</code> and
      <code>deserializeServerFunctionValue()</code>. The tagged format supports common structured
      values such as arrays, plain objects, <code>bigint</code>, <code>Date</code>, <code>URL</code>
      ,<code>URLSearchParams</code>, <code>RegExp</code>, <code>Map</code>, <code>Set</code>,
      <code>Error</code>, <code>ArrayBuffer</code>, <code>DataView</code>, and typed-array views.
    </p>
    <p>
      Functions, symbols, cyclic values, symbol-keyed object properties, and unsupported custom
      class instances cannot be sent by default. Register a codec for a custom value type instead of
      relying on JSON to preserve its prototype.
    </p>
    <p>
      The helpers are mainly used by Vynn's RPC transport, but they are also available when a custom
      integration needs to encode a value before sending it through another channel:
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import {\n  deserializeServerFunctionValue,\n  serializeServerFunctionValue,\n} from "vynn/server-functions/client";\n\ntype Snapshot = {\n  createdAt: Date;\n  permissions: Set<string>;\n  revision: bigint;\n};\n\nconst snapshot: Snapshot = {\n  createdAt: new Date(),\n  permissions: new Set(["read", "write"]),\n  revision: 12n,\n};\n\nconst encoded = JSON.stringify(serializeServerFunctionValue(snapshot));\nif (encoded === undefined) throw new Error("Could not encode snapshot.");\n\nconst restored = deserializeServerFunctionValue(JSON.parse(encoded)) as Snapshot;'
      }
    />
    <p>
      Serialize first and then pass the encoded representation through JSON or another transport.
      Deserialization expects that tagged representation, not the original object or raw JSON. When
      using Vynn's generated server references, you normally do not need to call these helpers
      yourself.
    </p>

    <h2>Register a custom codec</h2>
    <p>
      A <code>ServerFunctionCodec&lt;T&gt;</code> defines a stable lowercase tag, a type guard, a
      serializer, and a deserializer. Register the same codec in both the client and server
      runtimes. The returned function unregisters that codec; tags must be unique within each
      runtime and should remain stable across deployments.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { registerServerFunctionCodec } from "vynn/server-functions/client";\n\nclass Money {\n  constructor(readonly cents: number) {}\n}\n\nconst unregisterMoneyCodec = registerServerFunctionCodec<Money>({\n  tag: "money",\n  test: (value): value is Money => value instanceof Money,\n  serialize: (value) => value.cents,\n  deserialize: (value) => new Money(Number(value)),\n});\n\n// Call the same registration during server startup as well.\n// unregisterMoneyCodec() removes the registration when it is no longer needed.'
      }
    />
    <p>
      The exported <code>ServerFunctionCodec</code> type describes this contract. Keep the codec
      implementation compatible between browser and server deployments, and only serialize data that
      is safe to send to the other side.
    </p>

    <h2>Return an intentional error</h2>
    <p>
      <code>ServerFunctionError</code> is exported by both direct server-function entry points and
      by <code>vynn/server</code>. Throw it when the client needs an intentional public error with a
      stable <code>code</code>, HTTP <code>status</code>, or safe structured <code>details</code>.
      Its status must be an integer from 400 through 599, and its code may contain uppercase
      letters, digits, and underscores.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { ServerFunctionError } from "vynn/server";\n\nthrow new ServerFunctionError("Account not found.", {\n  code: "ACCOUNT_NOT_FOUND",\n  status: 404,\n  details: { accountId },\n});'
      }
    />
    <p>
      The associated types are <code>ServerFunctionErrorData</code> and
      <code>ServerFunctionErrorOptions</code>. The server entry also exports
      <code>ServerFunctionImplementation</code>, <code>ServerFunctionResolver</code>,
      <code>ServerFunctionHandlerOptions</code>, and <code>ServerFunctionRequestPayload</code>. The
      client entry exports <code>ClientServerFunctionOptions</code>,
      <code>ClientServerFunctionCaptureProvider</code>, <code>ServerFunction</code>, and
      <code>ServerFunctionInvocationOptions</code>.
    </p>
  </article>
);
