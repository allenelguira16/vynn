// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { finishServerRenderedLazy, withHydration } from "../src/client/hydration";
import { renderToDOM } from "../src/client/render-to-dom";
import { Await } from "../src/components/await";
import { $async } from "../src/reactivity/$async";
import { $insert } from "../src/render/$insert";
import { $nodes } from "../src/render/$nodes";
import { $tmpl } from "../src/render/$tmpl";
import { $txt } from "../src/render/$txt";
import type { JSX } from "../src/types/jsx";

function createRow(value: string): JSX.Element {
  const row = $tmpl("tr");
  const cell = $tmpl("td");

  $insert(cell, $txt(value));
  $insert(row, () => cell as unknown as JSX.Element);

  return row as unknown as JSX.Element;
}

describe("client Await after SSR hydration", () => {
  it("uses CSR branch parking while an unrelated SSR lazy boundary is still pending", async () => {
    const host = document.createElement("div");

    // Model an SSR page that still has an unhydrated lazy boundary when the
    // user navigates to a page that is mounted entirely on the client.
    host.innerHTML = "<!--l:991--><!--/l:991-->";
    withHydration(() => {}, host);

    let resolveData!: (value: string[]) => void;
    const pendingData = new Promise<string[]>((resolve) => {
      resolveData = resolve;
    });

    const unmount = renderToDOM(() => {
      const data = $async(() => pendingData);
      const body = $tmpl("tbody");
      const fallbackRow = $tmpl("tr");
      const fallbackCell = $tmpl("td");

      $insert(fallbackCell, $txt("Loading rows"));
      $insert(fallbackRow, () => fallbackCell as unknown as JSX.Element);

      const boundary = Await({
        fallback: fallbackRow as unknown as JSX.Element,
        get children() {
          return $nodes(
            () => data.value.map((value) => createRow(value)) as unknown as JSX.Element,
          );
        },
      });

      $insert(body, () => boundary);

      return body as unknown as JSX.Element;
    }, host);

    try {
      expect(host.querySelector("tbody")?.textContent).toContain("Loading rows");

      resolveData(["Pikachu"]);
      await pendingData;
      await Promise.resolve();

      expect(host.querySelector("tbody")?.textContent).toContain("Pikachu");
      expect(host.querySelector("tbody")?.textContent).not.toContain("Loading rows");
    } finally {
      unmount();
      finishServerRenderedLazy("991");
      host.remove();
    }
  });
});
