import { CodeBlock } from "../components/CodeBlock";

export const ServerFunctionsPage = () => (
  <div>
    <h1>Server-function runtime</h1>
    <section>
      <p>
        Vynn core provides a request/response runtime for calling server-side functions from a
        browser client. It includes client references, server-side registration and dispatch,
        request-scoped context, serialization, and typed application errors.
      </p>
      <p>
        This page documents the runtime APIs only. How source functions are discovered and
        transformed into references belongs to the separate compiler and application-integration
        documentation.
      </p>

      <h2 class="mt-6">Separate client and server entry points</h2>
      <ul>
        <li>
          <code>vynn/server</code> exposes server registration, request handling, context access,
          and error types.
        </li>
        <li>
          <code>vynn/server-functions/client</code> exposes the browser-side reference and
          invocation helpers.
        </li>
      </ul>
      <p>
        Both sides must agree on the server-function identifier. Generated references normally
        receive this identifier from the build pipeline; the manual example below shows the runtime
        contract directly.
      </p>

      <h2 class="mt-6">Register a server implementation</h2>
      <p>
        On the server, <code>createServerReference()</code> registers an implementation under a
        stable ID. IDs use the
        <code>vynn_</code> prefix followed by 20 lowercase hexadecimal characters.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import {
  createServerReference,
  createServerFunctionHandler,
} from "vynn/server";

const lookupUser = createServerReference(
  async (id: string) => {
    const response = await fetch("https://api.example.test/users/" + id);

    if (!response.ok) {
      throw new Error("User lookup failed");
    }

    return response.json() as Promise<{ id: string; name: string }>;
  },
  "vynn_0123456789abcdefabcd",
);

export const handleServerFunction = createServerFunctionHandler();
      `}
      />
      <p>
        The server-side <code>createServerReference()</code> returns the implementation function and
        registers it with the local server runtime. When no custom resolver is configured, the
        handler uses those registered implementations.
        <code>getServerFunctionImplementation(id)</code> retrieves a previously registered
        implementation by ID for custom dispatch or integration code.
      </p>

      <h2 class="mt-6">Create a client reference</h2>
      <p>
        Browser code imports <code>createServerReference()</code> from the client subpath. This
        function has a different purpose and signature: it creates a callable RPC reference for a
        known server-function ID.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { createServerReference } from "vynn/server-functions/client";

type LookupUser = (id: string) => Promise<{ id: string; name: string }>;

const lookupUser = createServerReference<LookupUser>(
  "vynn_0123456789abcdefabcd",
);

// The call sends the arguments to the configured server-function endpoint.
const user = await lookupUser("42");
      `}
      />
      <p>
        The default endpoint is <code>/__vynn/server-function</code>. Provide the{" "}
        <code>endpoint</code> option when your server exposes the handler at a different absolute
        pathname. Client references make POST requests with same-origin credentials and serialize
        their arguments before sending them.
      </p>

      <h2 class="mt-6">Captures and client reference options</h2>
      <p>
        Advanced integrations can provide lexical captures through
        <code>getCaptures</code>. The client provider is called immediately before each invocation
        and its array is serialized into the RPC request. A capture-aware server implementation
        receives the decoded captures array before its ordinary arguments. On the server,
        <code>createServerReference()</code> also accepts an optional third capture provider for
        direct in-process calls to its returned function; remote handler calls use the captures sent
        in the request. Generated references normally wire both sides automatically.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { $state } from "vynn";
import { createServerReference } from "vynn/server-functions/client";

// The capture provider is evaluated immediately before each invocation.
const activeTenantId = $state("tenant-a");

import { $state } from "vynn";
import { createServerReference } from "vynn/server-functions/client";

type LookupUser = (id: string) => Promise<{ id: string; name: string }>;

// The capture provider is evaluated immediately before each RPC call.
const activeTenantId = $state("tenant-a");

const lookupUser = createServerReference<LookupUser>(
  "vynn_0123456789abcdefabcd",
  {
    endpoint: "/__vynn/server-function",
    getCaptures: () => [activeTenantId.value],
  },
);
      `}
      />
      <p>
        Client captures are serialized with the arguments and are limited to 100 values per
        invocation. Treat captures as untrusted client input: they do not replace server-side
        authorization or validation.
      </p>

      <h2 class="mt-6">Handle requests</h2>
      <p>
        <code>createServerFunctionHandler()</code> creates a Fetch-compatible handler with the
        signature
        <code>(request: Request) =&gt; Promise&lt;Response | null&gt;</code>. It returns{" "}
        <code>null</code> when the request path does not match its configured endpoint, allowing
        another request handler to continue.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { createServerFunctionHandler } from "vynn/server";

const handleServerFunction = createServerFunctionHandler({
  endpoint: "/__vynn/server-function",
  maxRequestBytes: 1024 * 1024,
  development: process.env.NODE_ENV !== "production",
});

async function handleRequest(request: Request): Promise<Response> {
  const rpcResponse = await handleServerFunction(request);

  if (rpcResponse) {
    return rpcResponse;
  }

  return new Response("Not found", { status: 404 });
}
      `}
      />

      <h2 class="mt-6">Handler options and validation</h2>
      <ul>
        <li>
          <code>endpoint</code>: absolute pathname for the RPC endpoint. Defaults to{" "}
          <code>/__vynn/server-function</code>.
        </li>
        <li>
          <code>maxRequestBytes</code>: maximum request body size. Defaults to 1 MiB and cannot
          exceed 25 MiB.
        </li>
        <li>
          <code>allowedOrigins</code>: additional exact browser origins permitted to call the
          endpoint.
        </li>
        <li>
          <code>development</code> and <code>exposeErrors</code>: control whether unexpected server
          error messages may be returned to clients.
        </li>
        <li>
          <code>resolve</code>: resolve a function ID to an implementation. When supplied, this
          resolver is authoritative instead of the local registration map.
        </li>
        <li>
          <code>resolveWithCaptures</code>: marks resolver implementations as receiving a captures
          array before their ordinary arguments.
        </li>
      </ul>
      <p>
        The handler validates the HTTP method, content type, origin, request body size, function ID,
        and argument lists. It accepts POST requests with JSON bodies. Invalid methods, disallowed
        origins, unsupported content types, oversized bodies, and malformed payloads are rejected
        before a function is invoked.
      </p>
      <p>
        Do not remove your application's own authentication and authorization checks: a valid RPC
        reference is not proof that a caller is allowed to access the underlying data.
      </p>

      <h2 class="mt-6">Request-scoped context</h2>
      <p>
        During SSR with a request supplied to <code>renderToServer()</code>, or during a
        server-function invocation, call
        <code>getRequestContext()</code> from <code>vynn/server</code> to access the active request
        context.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import { getRequestContext, ServerFunctionError } from "vynn/server";

async function updateProfile(name: string) {
  const context = getRequestContext();

  const sessionId = context.cookies.get("session");
  if (!sessionId) {
    throw new ServerFunctionError("Sign in required", {
      code: "AUTH_REQUIRED",
      status: 401,
    });
  }

  context.locals.set("profileUpdated", true);
  context.response.headers.set("x-profile-updated", "true");
  context.cookies.set("profile-name", name, {
    path: "/",
    sameSite: "Lax",
    secure: true,
  });

  return { name };
}
      `}
      />
      <p>The request context exposes:</p>
      <ul>
        <li>
          <code>request</code>: the incoming Web-standard <code>Request</code>.
        </li>
        <li>
          <code>functionId</code>: the active function ID, or <code>null</code> outside a specific
          function invocation.
        </li>
        <li>
          <code>signal</code>: an <code>AbortSignal</code> for cancellation of the request.
        </li>
        <li>
          <code>response.status</code> and <code>response.headers</code>: response metadata that
          Vynn applies to the result.
        </li>
        <li>
          <code>cookies.get()</code>, <code>cookies.set()</code>, and <code>cookies.delete()</code>:
          helpers for reading incoming and writing outgoing cookies.
        </li>
        <li>
          <code>locals</code>: a request-local Map for values shared by middleware, SSR, and server
          functions within that request.
        </li>
      </ul>
      <p>
        The response status setter accepts body-bearing 2xx statuses only. Use{" "}
        <code>ServerFunctionError</code> for an expected failure response instead of setting a 4xx
        or 5xx status on the context.
      </p>

      <h2 class="mt-6">Cancellation from the client</h2>
      <p>
        Use <code>invokeServerFunction()</code> when an invocation needs a per-call{" "}
        <code>AbortSignal</code>. The signal is sent with the underlying fetch request and is
        available on the server as
        <code>getRequestContext().signal</code>.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import {
  createServerReference,
  invokeServerFunction,
} from "vynn/server-functions/client";

type LookupUser = (id: string) => Promise<{ id: string; name: string }>;
const lookupUser = createServerReference<LookupUser>("vynn_0123456789abcdefabcd");

const controller = new AbortController();

const userPromise = invokeServerFunction(
  lookupUser,
  ["42"],
  { signal: controller.signal },
);

// Cancel the in-flight request when the consuming view is disposed.
controller.abort();
      `}
      />
      <p>
        Per-call signal support requires a Vynn-generated client reference. An arbitrary function
        cannot be given transport cancellation options.
      </p>

      <h2 class="mt-6">Safe application errors</h2>
      <p>
        Throw <code>ServerFunctionError</code> when the client should receive a known message,
        status, machine-readable code, or structured details. Ordinary unexpected errors are
        intentionally kept private in production unless the handler is explicitly configured to
        expose them.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
const userId = "42";

throw new ServerFunctionError("The requested user does not exist", {
  code: "USER_NOT_FOUND",
  status: 404,
  details: { userId },
});
      `}
      />
      <p>
        Error codes must use uppercase letters, digits, and underscores. Status codes must be
        integers from 400 through 599. Only put information in <code>details</code> that the caller
        is authorized to receive.
      </p>

      <h2 class="mt-6">Serialization</h2>
      <p>
        Client arguments, captures, and returned values pass through Vynn's tagged serializer.
        Built-in support includes primitives,
        <code>BigInt</code>, arrays, plain objects, <code>Date</code>,<code>URL</code>,{" "}
        <code>URLSearchParams</code>, <code>RegExp</code>,<code>Map</code>, <code>Set</code>,{" "}
        <code>Error</code>,<code>ArrayBuffer</code>, typed arrays, and <code>DataView</code>.
      </p>
      <p>
        Functions, symbols, cyclic values, symbol-keyed object properties, and arbitrary class
        instances are not serialized automatically. Register a custom codec for a custom value type,
        and register the same codec in both client and server runtimes.
      </p>
      <CodeBlock
        lang="tsx"
        code={`
import {
  registerServerFunctionCodec,
  type ServerFunctionCodec,
} from "vynn/server";

class Money {
  constructor(readonly cents: number) {}
}

const moneyCodec: ServerFunctionCodec<Money> = {
  tag: "money",
  test: (value): value is Money => value instanceof Money,
  serialize: (value) => ({ cents: value.cents }),
  deserialize: (value) => {
    const data = value as { cents: number };
    return new Money(data.cents);
  },
};

const unregisterMoneyCodec = registerServerFunctionCodec(moneyCodec);
      `}
      />
      <p>
        Register the equivalent codec from
        <code>vynn/server-functions/client</code> in browser startup code. Codec tags are part of
        the wire format, so keep them stable across deployments. The registration call returns a
        function that removes the codec from that runtime.
      </p>
      <p>
        The lower-level <code>serializeServerFunctionValue()</code> and
        <code>deserializeServerFunctionValue()</code> helpers are also exported from the server and
        client subpaths for integrations that need to handle the tagged payload format directly.
      </p>

      <h2 class="mt-6">API reference</h2>
      <ul>
        <li>
          <code>createServerReference(implementation, id, getCaptures?)</code> from{" "}
          <code>vynn/server</code> registers a server implementation.
        </li>
        <li>
          <code>getServerFunctionImplementation(id)</code> retrieves a registered server
          implementation.
        </li>
        <li>
          <code>createServerReference(id, options?)</code> from{" "}
          <code>vynn/server-functions/client</code> creates a browser RPC reference.
        </li>
        <li>
          <code>createServerFunctionHandler(options?)</code> creates the Fetch-compatible server
          handler.
        </li>
        <li>
          <code>getRequestContext()</code> reads the active SSR or invocation context.
        </li>
        <li>
          <code>invokeServerFunction(reference, args, options?)</code> invokes a client reference
          with transport options.
        </li>
        <li>
          <code>ServerFunctionError</code> represents an intentionally exposed application error.
        </li>
        <li>
          <code>registerServerFunctionCodec(codec)</code> registers a custom serializer.
        </li>
      </ul>
    </section>
  </div>
);
