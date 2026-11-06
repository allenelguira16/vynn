import { describe, expect, it } from "vitest";

import { Await } from "../src/components/await";
import type { JSX } from "../src/types/jsx";
import { createOwner, disposeOwner, runWithOwner } from "../src/life-cycle/owner";
import { $async, isPending } from "../src/reactivity/$async";
import { $attr } from "../src/render/$attr";
import { $for } from "../src/render/$for";
import { $insert } from "../src/render/$insert";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";
import { renderToServer } from "../src/server/render-to-server";

type ListData = {
  results: string[];
  next: string | null;
};

function createRow(value: string): JSX.Element {
  const row = $tmpl("tr");
  const cell = $tmpl("td");
  $insert(cell, $txt(value));
  $insert(row, () => cell as unknown as JSX.Element);
  return row as unknown as JSX.Element;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

describe("SSR async boundaries inside dynamic children", () => {
  it("lets Await own a pending read raised by $for", async () => {
    let resolveData!: (value: ListData) => void;
    const pendingData = new Promise<ListData>((resolve) => {
      resolveData = resolve;
    });

    let data!: { value: ListData };

    const rendered = renderToServer(() => {
      data = $async(() => pendingData);

      const tbody = $tmpl("tbody");
      const boundary = Await({
        fallback: (() => {
          const row = $tmpl("tr");
          const cell = $tmpl("td");
          $attr(cell, "colSpan", 2);
          $insert(cell, $txt("Loading rows"));
          $insert(row, () => cell as unknown as JSX.Element);
          return row as unknown as JSX.Element;
        })(),
        get children() {
          const rows = $for(
            () => data.value.results,
            (value) => createRow(value),
          );

          const controls = $tmpl("tr");
          const cell = $tmpl("td");
          $attr(cell, "colSpan", 2);

          const button = $tmpl("button");
          $attr(button, "disabled", () => isPending(data) || !data.value.next);
          $insert(button, $txt("Next"));
          $insert(cell, () => button as unknown as JSX.Element);
          $insert(controls, () => cell as unknown as JSX.Element);

          return [rows, controls] as unknown as JSX.Element;
        },
      });

      $insert(tbody, () => boundary);
      return tbody as unknown as JSX.Element;
    }, "stream");

    const reader = rendered.body.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    expect(first.done).toBe(false);
    const initialHtml = decoder.decode(first.value, { stream: true });
    expect(initialHtml).toContain("Loading rows");

    resolveData({ results: ["Pikachu", "Eevee"], next: null });

    let finalHtml = initialHtml;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      finalHtml += decoder.decode(value, { stream: true });
    }
    finalHtml += decoder.decode();

    expect(finalHtml).toContain("Pikachu");
    expect(finalHtml).toContain("Eevee");
  });

  it("resolves dynamic list children in async mode instead of leaving them empty", async () => {
    let resolveData!: (value: ListData) => void;
    const pendingData = new Promise<ListData>((resolve) => {
      resolveData = resolve;
    });

    const rendered = renderToServer(() => {
      const data = $async(() => pendingData);
      const tbody = $tmpl("tbody");

      const boundary = Await({
        fallback: $txt("Loading rows"),
        get children() {
          return $for(
            () => data.value.results,
            (value) => createRow(value),
          );
        },
      });

      $insert(tbody, () => boundary);
      return tbody as unknown as JSX.Element;
    }, "async");

    resolveData({ results: ["Bulbasaur", "Squirtle"], next: null });

    const result = await rendered;
    expect(result.body).toContain("Bulbasaur");
    expect(result.body).toContain("Squirtle");
    expect(result.body).not.toContain("Loading rows");
  });

  it("keeps deferred SSR behavior for a dynamic list outside Await", async () => {
    let resolveData!: (value: string[]) => void;
    const pendingData = new Promise<string[]>((resolve) => {
      resolveData = resolve;
    });

    const rendered = renderToServer(() => {
      const root = $tmpl("div");
      const data = $async(() => pendingData);

      $insert(root, () =>
        $for(
          () => data.value,
          (value) => createRow(value),
        ),
      );

      return root as unknown as JSX.Element;
    }, "async");

    resolveData(["Charmander", "Squirtle"]);

    const result = await rendered;
    expect(result.body).toContain("Charmander");
    expect(result.body).toContain("Squirtle");
  });
});
