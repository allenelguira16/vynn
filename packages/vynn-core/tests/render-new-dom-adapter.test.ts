import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { createTemplateFactory } from "../src/render_new/template/factory";
import { createDOMTemplateAdapter } from "../src/render_new/dom/adapter";
import type { TemplateDefinition } from "../src/render_new/template/types";

const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
const MATHML_NAMESPACE_URI = "http://www.w3.org/1998/Math/MathML";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new DOM template adapter", () => {
  it("parses HTML markup into a reusable DocumentFragment", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const blueprint = adapter.parse(
      "<main><span>hello</span><!--slot--></main><aside>footer</aside>",
      "html",
    );

    expect(blueprint.nodeType).toBe(11);
    expect(blueprint.childNodes).toHaveLength(2);
    expect((blueprint.childNodes[0] as Element).localName).toBe("main");
    expect((blueprint.childNodes[0] as Element).namespaceURI)
      .toBe("http://www.w3.org/1999/xhtml");
    expect((blueprint.childNodes[1] as Element).localName).toBe("aside");
  });

  it("parses SVG descendants in the SVG namespace", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const blueprint = adapter.parse(
      '<g class="shape"><circle cx="4" cy="5" r="2"></circle></g>',
      "svg",
    );
    const group = blueprint.firstChild as Element;
    const circle = group.firstChild as Element;

    expect(group.localName).toBe("g");
    expect(group.namespaceURI).toBe(SVG_NAMESPACE_URI);
    expect(circle.localName).toBe("circle");
    expect(circle.namespaceURI).toBe(SVG_NAMESPACE_URI);
  });

  it("parses MathML descendants in the MathML namespace", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const blueprint = adapter.parse(
      "<mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow>",
      "mathml",
    );
    const row = blueprint.firstChild as Element;

    expect(row.localName).toBe("mrow");
    expect(row.namespaceURI).toBe(MATHML_NAMESPACE_URI);
    expect((row.firstChild as Element).namespaceURI).toBe(MATHML_NAMESPACE_URI);
  });

  it("preserves top-level text and comment nodes", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const blueprint = adapter.parse("before<!--anchor-->after", "html");

    expect(blueprint.childNodes).toHaveLength(3);
    expect(blueprint.childNodes[0].nodeType).toBe(3);
    expect(blueprint.childNodes[1].nodeType).toBe(8);
    expect(blueprint.childNodes[2].nodeType).toBe(3);
    expect(adapter.getKind(blueprint.childNodes[0])).toBe("text");
    expect(adapter.getKind(blueprint.childNodes[1])).toBe("anchor");
  });

  it("deep-clones blueprint roots into independent node trees", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const blueprint = adapter.parse("<main><span>hello</span></main>", "html");

    const first = adapter.clone(blueprint);
    const second = adapter.clone(blueprint);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0].firstChild).not.toBe(second[0].firstChild);
    expect(first[0]).not.toBe(blueprint.firstChild);
    expect((first[0] as Element).textContent).toBe("hello");
    expect((second[0] as Element).textContent).toBe("hello");
  });

  it("resolves a compiled template definition through the DOM adapter", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);
    const definition: TemplateDefinition = {
      markup: "<main><h1>Title</h1><!--children--></main>",
      namespace: "html",
      references: [
        { id: 0, kind: "element", path: [0] },
        { id: 1, kind: "element", path: [0, 0] },
        { id: 2, kind: "text", path: [0, 0, 0] },
        { id: 3, kind: "anchor", path: [0, 1] },
      ],
    };
    const factory = createTemplateFactory(definition, adapter);
    const first = factory.instantiate();
    const second = factory.instantiate();

    expect((first.references.get(0) as Element).localName).toBe("main");
    expect((first.references.get(1) as Element).localName).toBe("h1");
    expect(first.references.get(2)?.nodeValue).toBe("Title");
    expect(first.references.get(3)?.nodeType).toBe(8);
    expect(first.references.get(0)).not.toBe(second.references.get(0));
    expect(first.roots[0]).not.toBe(second.roots[0]);
  });

  it("uses the injected document rather than global document", () => {
    const firstDocument = createDocument();
    const secondDocument = createDocument();
    const adapter = createDOMTemplateAdapter(firstDocument);
    const blueprint = adapter.parse("<p>from first document</p>", "html");
    const roots = adapter.clone(blueprint);

    expect(roots[0].ownerDocument).toBe(firstDocument);
    expect(roots[0].ownerDocument).not.toBe(secondDocument);
  });

  it("rejects invalid documents and namespaces", () => {
    expect(() =>
      createDOMTemplateAdapter(null as unknown as Document),
    ).toThrow("expects a DOM Document");

    const adapter = createDOMTemplateAdapter(createDocument());

    expect(() =>
      adapter.parse("<div></div>", "xml" as "html"),
    ).toThrow("unsupported namespace");
  });

  it("rejects invalid blueprints, child indices, and unsupported node kinds", () => {
    const document = createDocument();
    const adapter = createDOMTemplateAdapter(document);

    expect(() => adapter.clone(null as unknown as DocumentFragment))
      .toThrow("must be a DocumentFragment");

    const element = document.createElement("div");
    expect(() => adapter.getChild(element, -1))
      .toThrow("child index must be a non-negative integer");

    expect(() => adapter.getKind(document.createDocumentFragment() as unknown as Node))
      .toThrow("cannot be used as a template reference");
  });
});
