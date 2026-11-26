import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import type { JSX } from "../src/types/jsx";
import { Await } from "../src/render_new/components/await";
import { createRenderNewComponent, type RenderNewComponent } from "../src/render_new/component";
import { mountRenderNew } from "../src/render_new/dom/client";
import { renderTemplateProgramToStringAsync } from "../src/render_new/ssr/render";
import type { DOMTemplateProgram } from "../src/render_new/dom/program";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function createValueProgram(read: () => unknown): DOMTemplateProgram {
  return {
    template: {
      namespace: "html",
      markup:
        "<strong><!--__vynn_render_new_child_0_start__-->" +
        "<!--__vynn_render_new_child_0_end__--></strong>",
      references: [{ id: 0, kind: "anchor", path: [0, 0] }],
    },
    bindings: [{ kind: "child", reference: 0, read }],
  };
}

describe("render_new Await boundary", () => {
  it("shows a browser fallback and swaps in children when a resource resolves", async () => {
    let resolveResource!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolveResource = resolve;
    });
    const resource = $state(() => promise);
    const boundary = Await({
      when: resource,
      fallback: "Loading resource",
      children: createValueProgram(() => resource.value) as unknown as JSX.Element,
    }) as unknown as RenderNewComponent;

    const document = createDocument();
    const host = document.createElement("main");
    const mounted = mountRenderNew(host, boundary);

    expect(host.textContent).toBe("Loading resource");

    resolveResource("Resolved resource");
    await promise;
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(host.textContent).toBe("Resolved resource");

    mounted.dispose();
    expect(host.textContent).toBe("");
  });

  it("waits for resources during SSR and serializes their values for hydration", async () => {
    let resolveResource!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveResource = resolve;
    });

    const app = createRenderNewComponent(() => {
      const resource = $state(async () => {
        await gate;
        return "server resource value";
      });
      const boundary = Await({
        when: resource,
        fallback: "server fallback",
        children: createValueProgram(() => resource.value) as unknown as JSX.Element,
      });

      return {
        template: {
          namespace: "html",
          markup:
            "<html><body><!--__vynn_render_new_child_0_start__-->" +
            "<!--__vynn_render_new_child_0_end__--></body></html>",
          references: [{ id: 0, kind: "anchor", path: [0, 0, 0] }],
        },
        bindings: [{
          kind: "child",
          reference: 0,
          read: () => boundary,
        }],
      };
    });

    const htmlPromise = renderTemplateProgramToStringAsync(app);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    resolveResource();
    const html = await htmlPromise;

    expect(html).toContain("server resource value");
    expect(html).not.toContain("server fallback");
    expect(html).toContain('window["$AD"]');
    expect(html).toContain("server resource value");
    expect(html.indexOf("vynn:internal:start")).toBeLessThan(html.indexOf("</body>"));
    expect(html).toContain("vynn:internal:end");
  });

  it("propagates rejected resources from server preparation", async () => {
    const app = createRenderNewComponent(() => {
      const resource = $state(async () => {
        throw new Error("resource failed");
      });
      const boundary = Await({
        when: resource,
        fallback: "not rendered",
        children: createValueProgram(() => resource.value) as unknown as JSX.Element,
      });

      return {
        template: {
          namespace: "html",
          markup:
            "<html><body><!--__vynn_render_new_child_0_start__-->" +
            "<!--__vynn_render_new_child_0_end__--></body></html>",
          references: [{ id: 0, kind: "anchor", path: [0, 0, 0] }],
        },
        bindings: [{
          kind: "child",
          reference: 0,
          read: () => boundary,
        }],
      };
    });

    await expect(renderTemplateProgramToStringAsync(app)).rejects.toThrow("resource failed");
  });
});
