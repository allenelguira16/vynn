import { CodeBlock } from "../../../../components/code-block";

const ServerFunctionsPage = () => (
  <article>
    <p class="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Build an app</p>
    <h1>Server functions</h1>
    <p class="lead">
      Server functions let browser code call a function that runs on the server. Vynn's compiler
      turns a function-level directive into a remote reference, and the Vite plugin wires the
      request handler into development and production.
    </p>

    <h2>Enable the feature</h2>
    <p>
      Add <code>serverFunctions: true</code> to the Vite plugin options. Server functions can be
      used with a client-rendered application or alongside SSR.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { defineConfig } from "vite";\nimport vynn from "vite-plugin-vynn";\n\nexport default defineConfig({\n  plugins: [\n    vynn({\n      serverFunctions: true,\n    }),\n  ],\n});'
      }
    />
    <p>
      The option can also be an object. It supports <code>endpoint</code>,
      <code>maxRequestBytes</code>, <code>allowedOrigins</code>, <code>exposeErrors</code>, and
      <code>enabled</code>. The default endpoint is <code>/__vynn/server-function</code> and the
      default request body limit is 1 MiB.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'vynn({\n  serverFunctions: {\n    endpoint: "/__vynn/rpc",\n    maxRequestBytes: 1024 * 1024,\n    allowedOrigins: ["https://admin.example.com"],\n    exposeErrors: false,\n  },\n})'
      }
    />
    <p>
      Additional origins must be exact HTTP or HTTPS origins. Configure them only when your
      deployment genuinely needs browser calls from another trusted origin.
    </p>

    <h2>Mark a function as server-only</h2>
    <p>
      Put <code>"use server"</code> at the top of the function body. The directive belongs to the
      function, not the file. A file-level directive is not the Vynn server-function convention.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'export async function createGreeting(name: string) {\n  "use server";\n\n  const normalizedName = name.trim();\n  if (!normalizedName) {\n    throw new Error("A name is required.");\n  }\n\n  return "Hello, " + normalizedName + "!";\n}'
      }
    />

    <h2>Call the function from the browser</h2>
    <p>
      Import the function like a normal function and await its result. Client code calls the
      generated reference; the implementation executes in the server runtime.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { $state } from "vynn";\nimport { createGreeting } from "./actions";\n\nfunction GreetingForm() {\n  const greeting = $state("");\n  const errorMessage = $state("");\n\n  async function submit() {\n    errorMessage.value = "";\n\n    try {\n      greeting.value = await createGreeting("Vynn");\n    } catch (error) {\n      errorMessage.value = error instanceof Error ? error.message : "Request failed.";\n    }\n  }\n\n  return (\n    <section>\n      <button onClick={submit}>Create greeting</button>\n      <p>{greeting.value}</p>\n      {errorMessage.value && <p role="alert">{errorMessage.value}</p>}\n    </section>\n  );\n}'
      }
    />

    <h2>Pass values as arguments, not captured variables</h2>
    <p>
      Vynn does not serialize lexical closures for server functions. A server function should
      receive the values it needs through its arguments or read trusted request data through the
      server request context. A local value from the browser module is not copied into the server
      implementation automatically.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'export async function updateProfile(userId: string, displayName: string) {\n  "use server";\n\n  if (!userId || !displayName.trim()) {\n    throw new Error("User ID and display name are required.");\n  }\n\n  // Also verify that the current caller may update this user.\n  return saveProfile(userId, displayName);\n}'
      }
    />

    <h2>Read request context on the server</h2>
    <p>
      <code>getRequestContext()</code> is available from <code>vynn/server</code> during an SSR
      request or server-function invocation. It exposes the incoming Web Request, an abort signal,
      response metadata, cookie helpers, and request-local values.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { getRequestContext } from "vynn/server";\n\nexport async function readSession() {\n  "use server";\n\n  const context = getRequestContext();\n  const sessionId = context.cookies.get("session");\n\n  if (!sessionId) return null;\n\n  return loadSession(sessionId, { signal: context.signal });\n}'
      }
    />
    <p>
      The context's <code>cookies</code> API includes <code>get()</code>, <code>set()</code>, and
      <code>delete()</code>. Cookie writes are added to the outgoing response headers. The
      <code>locals</code> map can hold values shared by middleware, SSR, and server functions for
      the same request.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { getRequestContext } from "vynn/server";\n\nexport async function saveSession(sessionId: string) {\n  "use server";\n\n  const context = getRequestContext();\n  context.cookies.set("session", sessionId, {\n    httpOnly: true,\n    secure: true,\n    sameSite: "Lax",\n    path: "/",\n  });\n\n  context.response.headers.set("cache-control", "no-store");\n  return { saved: true };\n}'
      }
    />

    <h2>Return intentional errors</h2>
    <p>
      Ordinary thrown errors are kept private in production by default. Use
      <code>ServerFunctionError</code> when the caller needs a stable error code, HTTP status, or
      structured details that are safe to expose.
    </p>
    <CodeBlock
      lang="tsx"
      code={
        'import { ServerFunctionError } from "vynn/server";\n\nexport async function getInvoice(invoiceId: string) {\n  "use server";\n\n  const invoice = await findInvoice(invoiceId);\n  if (!invoice) {\n    throw new ServerFunctionError("Invoice not found.", {\n      code: "INVOICE_NOT_FOUND",\n      status: 404,\n    });\n  }\n\n  return invoice;\n}'
      }
    />
    <p>
      Error codes use uppercase letters, numbers, and underscores. Status codes must be between 400
      and 599. Only include structured details that are safe for the browser to receive.
    </p>

    <h2>Understand the build and runtime</h2>
    <ul>
      <li>
        During <code>vite dev</code>, the plugin registers the server-function endpoint as Vite
        middleware.
      </li>
      <li>
        In a client-only production build, the plugin emits a separate server-function handler under{" "}
        <code>dist/server/</code>. Vite preview mounts it automatically.
      </li>
      <li>
        With the integrated SSR app, server-function handling is included in the application server
        build.
      </li>
    </ul>

    <h2>Security checklist</h2>
    <ul>
      <li>Validate every argument. TypeScript types do not validate data received over HTTP.</li>
      <li>
        Authenticate the caller and authorize each requested operation inside the server function.
      </li>
      <li>
        Keep secrets, database credentials, and privileged service clients in server-only modules.
      </li>
      <li>Do not treat the function name or a hidden UI control as an authorization check.</li>
      <li>Return only data the current caller is allowed to see.</li>
      <li>Do not expose raw unexpected error messages in production.</li>
    </ul>
    <p>
      The RPC transport is not a replacement for your application's authentication or authorization
      rules. Every server function is an endpoint that should be treated as an untrusted request
      boundary. For low-level client/server references, request handlers, cancellation, custom
      serializers, and codecs, see{" "}
      <a href="/docs/reference/server-functions">Server functions API</a>.
    </p>
  </article>
);


export default ServerFunctionsPage;
