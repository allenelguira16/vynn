import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { createScope, disposeScope, onScopeDispose, runWithScope } from "../src/render_new/lifecycle/scope";
import { createDOMTemplateAdapter } from "../src/render_new/dom/adapter";
import { mountTemplate, type MountedTemplate } from "../src/render_new/dom/mount";
import { createTemplateFactory } from "../src/render_new/template/factory";
import type { TemplateFactory, TemplateInstance } from "../src/render_new/template/types";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function createFactory(
  document: Document,
  markup: string,
): TemplateFactory<Node> {
  return createTemplateFactory(
    { markup, namespace: "html", references: [] },
    createDOMTemplateAdapter(document),
  );
}

function childNames(parent: ParentNode): string[] {
  return Array.from(parent.childNodes).map((node) => {
    if (node.nodeType === 1) return (node as Element).localName;
    if (node.nodeType === 3) return "#text:" + node.nodeValue;
    if (node.nodeType === 8) return "#comment:" + node.nodeValue;
    return "#other";
  });
}

describe("render_new DOM template mounting", () => {
  it("mounts every root in order and returns its template instance", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const factory = createFactory(
      document,
      "<main>content</main><!--boundary--><aside>footer</aside>",
    );

    const mounted = mountTemplate(parent, factory);

    expect(mounted.mounted).toBe(true);
    expect(mounted.scope.state).toBe("active");
    expect(mounted.instance.roots).toHaveLength(3);
    expect(childNames(parent)).toEqual([
      "main",
      "#comment:boundary",
      "aside",
    ]);
    expect(mounted.instance.roots[0].parentNode).toBe(parent);
  });

  it("mounts roots before an existing child without changing root order", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const existing = document.createElement("footer");
    const factory = createFactory(document, "<main></main><aside></aside>");

    parent.append(existing);
    const mounted = mountTemplate(parent, factory, existing);

    expect(childNames(parent)).toEqual(["main", "aside", "footer"]);
    expect(mounted.instance.roots[0].nextSibling).toBe(mounted.instance.roots[1]);
  });

  it("supports an empty template as a mounted disposable instance", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const mounted = mountTemplate(parent, createFactory(document, ""));

    expect(mounted.mounted).toBe(true);
    expect(mounted.instance.roots).toEqual([]);
    expect(parent.childNodes).toHaveLength(0);

    mounted.dispose();

    expect(mounted.mounted).toBe(false);
    expect(mounted.scope.state).toBe("disposed");
  });

  it("removes every root and disposes the render scope", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const mounted = mountTemplate(
      parent,
      createFactory(document, "<main></main>text<!--anchor--><aside></aside>"),
    );

    mounted.dispose();

    expect(parent.childNodes).toHaveLength(0);
    expect(mounted.mounted).toBe(false);
    expect(mounted.scope.state).toBe("disposed");
  });

  it("makes disposal idempotent", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const mounted = mountTemplate(parent, createFactory(document, "<p>hello</p>"));

    mounted.dispose();
    mounted.dispose();

    expect(parent.childNodes).toHaveLength(0);
    expect(mounted.scope.state).toBe("disposed");
  });

  it("inherits the current parent scope and is disposed with it", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const parentScope = createScope(null);
    let mounted!: MountedTemplate<Node>;

    runWithScope(parentScope, () => {
      mounted = mountTemplate(parent, createFactory(document, "<main></main>"));
    });

    expect(mounted.scope.parent).toBe(parentScope);
    expect(mounted.mounted).toBe(true);

    disposeScope(parentScope);

    expect(mounted.mounted).toBe(false);
    expect(mounted.scope.state).toBe("disposed");
    expect(parent.childNodes).toHaveLength(0);
  });

  it("runs factory creation inside the mounted render scope", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    let capturedScope: ReturnType<typeof import("../src/render_new/lifecycle/scope").getCurrentScope> = null;

    const factory: TemplateFactory<Node> = {
      definition: { markup: "", namespace: "html", references: [] },
      instantiate() {
        capturedScope = importScope();
        return createDOMTemplateAdapter(document)
          .parse("<main></main>", "html") as unknown as TemplateInstance<Node>;
      },
    };

    function importScope() {
      return currentScope();
    }

    function currentScope() {
      // Accessed through the public scope helper imported below.
      return getActiveScope();
    }

    const mounted = mountTemplate(parent, factory);

    expect(capturedScope).toBe(mounted.scope);
    mounted.dispose();
  });

  it("disposes resources created during instantiation", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    let cleanupCount = 0;

    const factory: TemplateFactory<Node> = {
      definition: { markup: "", namespace: "html", references: [] },
      instantiate() {
        onScopeDispose(() => cleanupCount++);
        const roots = Array.from(
          createDOMTemplateAdapter(document).parse("<main></main>", "html").childNodes,
        );
        return { roots, references: new Map() };
      },
    };

    const mounted = mountTemplate(parent, factory);

    mounted.dispose();
    mounted.dispose();

    expect(cleanupCount).toBe(1);
  });

  it("cleans up the scope when factory instantiation throws", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    let cleanupCount = 0;

    const factory: TemplateFactory<Node> = {
      definition: { markup: "", namespace: "html", references: [] },
      instantiate() {
        onScopeDispose(() => cleanupCount++);
        throw new Error("factory failed");
      },
    };

    expect(() => mountTemplate(parent, factory)).toThrow("factory failed");
    expect(cleanupCount).toBe(1);
    expect(parent.childNodes).toHaveLength(0);
  });

  it("cleans up the scope and roots when insertion fails", () => {
    const document = createDocument();
    const parent = document.createElement("section");
    const invalidReference = document.createTextNode("not a valid child anchor");
    const root = document.createElement("main");
    let cleanupCount = 0;

    const factory: TemplateFactory<Node> = {
      definition: { markup: "", namespace: "html", references: [] },
      instantiate() {
        onScopeDispose(() => cleanupCount++);
        return { roots: [root], references: new Map() };
      },
    };

    expect(() => mountTemplate(parent, factory, invalidReference))
      .toThrow("reference must be a child");
    expect(cleanupCount).toBe(1);
    expect(root.parentNode).toBeNull();
    expect(parent.childNodes).toHaveLength(0);
  });

  it("rejects an invalid factory before allocating a scope", () => {
    const document = createDocument();
    const parent = document.createElement("div");

    expect(() =>
      mountTemplate(parent, null as unknown as TemplateFactory<Node>),
    ).toThrow("expects a template factory");
  });

  it("cleans up mounted roots even when another scope cleanup throws", () => {
    const document = createDocument();
    const parent = document.createElement("div");

    const factory: TemplateFactory<Node> = {
      definition: { markup: "", namespace: "html", references: [] },
      instantiate() {
        onScopeDispose(() => {
          throw new Error("additional cleanup failed");
        });
        const roots = Array.from(
          createDOMTemplateAdapter(document).parse("<main></main>", "html").childNodes,
        );
        return { roots, references: new Map() };
      },
    };

    const mounted = mountTemplate(parent, factory);

    expect(() => mounted.dispose()).toThrow("additional cleanup failed");
    expect(parent.childNodes).toHaveLength(0);
    expect(mounted.mounted).toBe(false);
    expect(mounted.scope.state).toBe("disposed");
  });
});
