import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import { onScopeDispose } from "../src/render_new/lifecycle/scope";
import { createRenderNewComponent } from "../src/render_new/internal";
import { mountRenderNew } from "../src/render_new/dom/client";
import { hydrateRenderNew } from "../src/render_new/dom/hydrate-client";
import { renderTemplateProgramToString } from "../src/render_new/ssr/render";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new deferred component scopes", () => {
  it("does not execute a component body until mounting establishes its scope", () => {
    let renderCalls = 0;
    let disposeCalls = 0;
    let update: ((value: string) => void) | undefined;

    const component = createRenderNewComponent(() => {
      renderCalls++;
      const message = $state("mounted in scope");
      update = (value) => {
        message.value = value;
      };
      onScopeDispose(() => {
        disposeCalls++;
      });

      return {
        template: {
          namespace: "html",
          markup: "<p><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></p>",
          references: [{ id: 0, kind: "anchor", path: [0, 0] }],
        },
        bindings: [{ kind: "child", reference: 0, read: () => message.value }],
      };
    });

    expect(renderCalls).toBe(0);
    expect(disposeCalls).toBe(0);

    const document = createDocument();
    const parent = document.createElement("main");
    const mounted = mountRenderNew(parent, component);

    expect(renderCalls).toBe(1);
    expect(parent.textContent).toBe("mounted in scope");

    update?.("reactive update");
    expect(parent.textContent).toBe("reactive update");

    mounted.dispose();
    expect(disposeCalls).toBe(1);
    expect(parent.childNodes).toHaveLength(0);
  });

  it("owns a nested component's state and cleanup inside its parent range", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    let disposeCalls = 0;
    let childValue = "";

    const child = createRenderNewComponent(() => {
      const value = $state("nested");
      childValue = value.value;
      onScopeDispose(() => {
        disposeCalls++;
      });
      return {
        template: {
          namespace: "html",
          markup: "<strong><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></strong>",
          references: [{ id: 0, kind: "anchor", path: [0, 0] }],
        },
        bindings: [{ kind: "child", reference: 0, read: () => value.value }],
      };
    });

    const parentComponent = createRenderNewComponent(() => ({
      template: {
        namespace: "html",
        markup: "<section><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></section>",
        references: [{ id: 0, kind: "anchor", path: [0, 0] }],
      },
      bindings: [{ kind: "child", reference: 0, read: () => child }],
    }));

    const mounted = mountRenderNew(parent, parentComponent);
    expect(parent.querySelector("strong")?.textContent).toBe("nested");
    expect(childValue).toBe("nested");

    mounted.dispose();
    expect(disposeCalls).toBe(1);
    expect(parent.childNodes).toHaveLength(0);
  });

  it("hydrates deferred components without losing their owner lifetime", () => {
    const document = createDocument();
    const parent = document.createElement("main");
    let renderCalls = 0;
    let disposeCalls = 0;

    const component = createRenderNewComponent(() => {
      renderCalls++;
      const label = $state("hydrated component");
      onScopeDispose(() => {
        disposeCalls++;
      });
      return {
        template: {
          namespace: "html",
          markup: "<article><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></article>",
          references: [{ id: 0, kind: "anchor", path: [0, 0] }],
        },
        bindings: [{ kind: "child", reference: 0, read: () => label.value }],
      };
    });

    const html = renderTemplateProgramToString(component);
    parent.innerHTML = html;
    const serverRoot = parent.firstElementChild;

    expect(disposeCalls).toBe(1);

    const mounted = hydrateRenderNew(parent, component);

    expect(renderCalls).toBe(2);
    expect(parent.firstElementChild).toBe(serverRoot);
    expect(parent.textContent).toBe("hydrated component");

    mounted.dispose();
    expect(disposeCalls).toBe(2);
    expect(parent.childNodes).toHaveLength(0);
  });

  it("executes and disposes component resources during standalone SSR", () => {
    let renderCalls = 0;
    let disposeCalls = 0;

    const component = createRenderNewComponent(() => {
      renderCalls++;
      const label = $state("server component");
      onScopeDispose(() => {
        disposeCalls++;
      });
      return {
        template: {
          namespace: "html",
          markup: "<h1><!--__vynn_render_new_child_0_start__--><!--__vynn_render_new_child_0_end__--></h1>",
          references: [{ id: 0, kind: "anchor", path: [0, 0] }],
        },
        bindings: [{ kind: "child", reference: 0, read: () => label.value }],
      };
    });

    const html = renderTemplateProgramToString(component);

    expect(renderCalls).toBe(1);
    expect(html).toContain("server component");
    expect(disposeCalls).toBe(1);
  });
});
