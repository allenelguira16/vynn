import { onMount, $state } from "vynn";
import runtimeSource from "virtual:vynn-playground-runtime";

import { highlightCode } from "./CodeBlock";

const initialSource = `import { $state } from "vynn";
import { renderToDOM } from "vynn/client";

function App() {
  const count = $state(0);

  return (
    <main>
      <h1>Hello, Vynn!</h1>
      <p>Edit this component, then run it again.</p>
      <button onClick={() => count.value++}>
        Clicked {count.value} times
      </button>
    </main>
  );
}

renderToDOM(App, "#app");
`;

export const Playground = () => {
  const source = $state(initialSource);
  const previewDocument = $state("");
  const compileError = $state("");
  const isRunning = $state(false);

  let highlightedCode: HTMLDivElement | undefined;

  const run = async (nextSource = source.value) => {
    source.value = nextSource;
    isRunning.value = true;
    compileError.value = "";

    try {
      const [compiler, transformer] = await Promise.all([
        import("vynn-compiler"),
        import("@oxc-transform/binding-wasm32-wasip1"),
      ]);

      const transformed = compiler.transformVynnOxc(nextSource, "playground.tsx");
      const output = transformer.transformSync("playground.tsx", transformed, {
        lang: "tsx",
        jsx: "preserve",
        target: "es2022",
      });

      const errors = output.errors.filter((error) => error.severity === "Error");

      if (errors.length > 0) {
        throw new Error(
          errors.map((error) => error.codeframe ?? error.message).join("\n\n"),
        );
      }

      previewDocument.value = createPreviewDocument(runtimeSource, output.code);
    } catch (error) {
      compileError.value = error instanceof Error ? error.message : String(error);
    } finally {
      isRunning.value = false;
    }
  };

  const reset = () => {
    void run(initialSource);
  };

  onMount(() => {
    void run();
  });

  return (
    <section class="not-prose overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
        <div>
          <p class="font-semibold">Vynn Playground</p>
          <p class="text-xs text-base-content/60">Edit the TSX and run it in the preview.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm btn-ghost" type="button" onClick={reset} disabled={isRunning.value}>
            Reset
          </button>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            onClick={() => void run()}
            disabled={isRunning.value}
          >
            {isRunning.value ? "Running..." : "Run"}
          </button>
        </div>
      </header>

      <div class="grid min-w-0 grid-cols-1 lg:grid-cols-2">
        <div class="min-w-0 border-b border-base-300 lg:border-b-0 lg:border-r">
          <div class="border-b border-base-300 px-4 py-2 text-xs font-medium text-base-content/70">
            App.tsx
          </div>
          <div class="playground-editor">
            <div
              class="playground-highlight"
              ref={(element) => {
                highlightedCode = element;
              }}
              html={highlightCode(source.value)}
              aria-hidden="true"
            ></div>
            <textarea
              class="playground-input"
              aria-label="Vynn playground source editor"
              autoComplete="off"
              rows={20}
              value={source.value}
              onInput={(event) => {
                source.value = event.currentTarget.value;
              }}
              onScroll={(event) => {
                if (!highlightedCode) return;
                highlightedCode.scrollTop = event.currentTarget.scrollTop;
                highlightedCode.scrollLeft = event.currentTarget.scrollLeft;
              }}
            ></textarea>
          </div>
          {compileError.value ? (
            <pre class="playground-compile-error" role="alert">{compileError.value}</pre>
          ) : null}
        </div>

        <div class="min-w-0">
          <div class="border-b border-base-300 px-4 py-2 text-xs font-medium text-base-content/70">
            Preview
          </div>
          <div class="playground-preview">
            {previewDocument.value ? (
              <iframe
                title="Vynn playground preview"
                class="playground-frame"
                sandbox="allow-scripts"
                srcDoc={previewDocument.value}
              />
            ) : (
              <div class="flex min-h-96 items-center justify-center px-6 text-center text-sm text-base-content/60">
                The preview will appear here after the first run.
              </div>
            )}
          </div>
        </div>
      </div>

      <footer class="border-t border-base-300 px-4 py-3 text-xs text-base-content/60">
        Runs in an isolated browser frame. SSR, server functions, and external package imports are not available here.
      </footer>
    </section>
  );
};

function createPreviewDocument(runtime: string, source: string): string {
  const encode = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }

    return btoa(binary);
  };

  const runtimeData = encode(runtime);
  const sourceData = encode(source);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none';"
    />
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; color: #1f2937; }
      body { margin: 0; padding: 1.5rem; }
      button { border: 0; border-radius: .5rem; padding: .6rem .9rem; background: #2563eb; color: white; cursor: pointer; }
      button:hover { background: #1d4ed8; }
      #vynn-playground-error { margin-top: 1rem; padding: .75rem; overflow: auto; border: 1px solid #fecaca; border-radius: .5rem; background: #fef2f2; color: #991b1b; white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; }
      #vynn-playground-error[hidden] { display: none; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <pre id="vynn-playground-error" role="alert" hidden></pre>
    <script type="module">
      const decode = (encoded) => {
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      };

      const showError = (error) => {
        const panel = document.getElementById("vynn-playground-error");
        panel.hidden = false;
        panel.textContent =
          error instanceof Error ? error.stack || error.message : String(error);
      };

      window.addEventListener("error", (event) => showError(event.error || event.message));
      window.addEventListener("unhandledrejection", (event) => showError(event.reason));

      try {
        const runtimeSource = decode("${runtimeData}");
        const sourceCode = decode("${sourceData}");
        const runtimeUrl = URL.createObjectURL(
          new Blob([runtimeSource], { type: "text/javascript" }),
        );

        let executable = sourceCode;
        const modules = ["vynn", "vynn/client", "vynn/render"];

        for (const moduleName of modules) {
          for (const quote of ['"', "'"]) {
            const specifier = quote + moduleName + quote;
            const replacement = JSON.stringify(runtimeUrl);
            executable = executable.split("from " + specifier).join("from " + replacement);
            executable = executable.split("import " + specifier).join("import " + replacement);
            executable = executable
              .split("import(" + specifier + ")")
              .join("import(" + replacement + ")");
          }
        }

        const sourceUrl = URL.createObjectURL(
          new Blob([executable], { type: "text/javascript" }),
        );
        await import(sourceUrl);
      } catch (error) {
        showError(error);
      }
    </script>
  </body>
</html>`;
}
