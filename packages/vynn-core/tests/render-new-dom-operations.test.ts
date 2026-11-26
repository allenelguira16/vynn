import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import {
  createDOMComment,
  createDOMElement,
  createDOMFragment,
  createDOMText,
} from "../src/render_new/dom/create";
import {
  insertDOMNode,
  insertDOMNodes,
} from "../src/render_new/dom/insert";
import { moveDOMNode, moveDOMNodes } from "../src/render_new/dom/move";
import { removeDOMNode, removeDOMNodes } from "../src/render_new/dom/remove";
import {
  createDOMRange,
  getDOMRangeContentNodes,
  getDOMRangeNodes,
  insertDOMRange,
  isDOMRangeAttached,
  moveDOMRange,
  removeDOMRange,
} from "../src/render_new/dom/range";

const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
const MATHML_NAMESPACE_URI = "http://www.w3.org/1998/Math/MathML";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function elementNames(parent: ParentNode): string[] {
  return Array.from(parent.children).map((element) => element.localName);
}

describe("render_new DOM node creation", () => {
  it("creates HTML, SVG, and MathML elements in the requested namespace", () => {
    const document = createDocument();

    const html = createDOMElement(document, "main");
    const svg = createDOMElement(document, "svg", "svg");
    const math = createDOMElement(document, "math", "mathml");

    expect(html.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(svg.namespaceURI).toBe(SVG_NAMESPACE_URI);
    expect(math.namespaceURI).toBe(MATHML_NAMESPACE_URI);
  });

  it("creates text, comment, and document fragment nodes", () => {
    const document = createDocument();

    expect(createDOMText(document, "<not markup>").nodeValue).toBe("<not markup>");
    expect(createDOMComment(document, "branch").data).toBe("branch");
    expect(createDOMFragment(document).nodeType).toBe(11);
  });

  it("rejects invalid documents, tag names, namespaces, and text values", () => {
    expect(() => createDOMText(null as unknown as Document, "x"))
      .toThrow("expects a DOM Document");

    const document = createDocument();

    expect(() => createDOMElement(document, ""))
      .toThrow("non-empty tag name");
    expect(() => createDOMElement(document, "div", "__proto__" as "html"))
      .toThrow("unsupported namespace");
    expect(() => createDOMText(document, 42 as unknown as string))
      .toThrow("content must be a string");
    expect(() => createDOMComment(document, 42 as unknown as string))
      .toThrow("content must be a string");
  });
});

describe("render_new DOM insertion and movement", () => {
  it("inserts a single node before an anchor and appends when omitted", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const anchor = document.createElement("i");
    const first = document.createElement("b");
    const last = document.createElement("em");

    parent.append(anchor);
    insertDOMNode(parent, first, anchor);
    insertDOMNode(parent, last);

    expect(elementNames(parent)).toEqual(["b", "i", "em"]);
  });

  it("treats insertion of a node before itself as a no-op", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const child = document.createElement("span");

    parent.append(child);

    expect(insertDOMNode(parent, child, child)).toBe(child);
    expect(parent.firstChild).toBe(child);
    expect(parent.childNodes).toHaveLength(1);
  });

  it("inserts DocumentFragment children and returns the nodes actually inserted", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const fragment = document.createDocumentFragment();
    const first = document.createElement("a");
    const second = document.createElement("b");

    fragment.append(first, second);
    const inserted = insertDOMNodes(parent, [fragment]);

    expect(inserted).toEqual([first, second]);
    expect(fragment.childNodes).toHaveLength(0);
    expect(elementNames(parent)).toEqual(["a", "b"]);
  });

  it("inserts an ordered group without reversing existing or detached nodes", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const first = document.createElement("a");
    const second = document.createElement("b");
    const third = document.createElement("c");
    const anchor = document.createElement("i");

    parent.append(first, second, anchor);
    insertDOMNodes(parent, [first, second, third], anchor);

    expect(elementNames(parent)).toEqual(["a", "b", "c", "i"]);
  });

  it("moves an ordered group across parents without recreating nodes", () => {
    const document = createDocument();
    const source = document.createElement("section");
    const target = document.createElement("main");
    const first = document.createElement("a");
    const second = document.createElement("b");
    const anchor = document.createElement("i");

    source.append(first, second);
    target.append(anchor);

    moveDOMNodes([first, second], target, anchor);

    expect(source.childNodes).toHaveLength(0);
    expect(elementNames(target)).toEqual(["a", "b", "i"]);
    expect(target.firstChild).toBe(first);
    expect(first.parentNode).toBe(target);
  });

  it("moves a single node within its parent", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const first = document.createElement("a");
    const second = document.createElement("b");
    const third = document.createElement("c");

    parent.append(first, second, third);
    moveDOMNode(third, parent, first);

    expect(elementNames(parent)).toEqual(["c", "a", "b"]);
  });

  it("rejects hierarchy cycles without detaching the original node", () => {
    const document = createDocument();
    const outer = document.createElement("div");
    const inner = document.createElement("section");

    outer.append(inner);

    expect(() => insertDOMNode(inner, outer))
      .toThrow("cannot be inserted into itself or one of its descendants");
    expect(inner.parentNode).toBe(outer);
    expect(outer.firstChild).toBe(inner);
  });

  it("restores source nodes when the destination rejects the insertion", () => {
    const document = createDocument();
    const source = document.createElement("section");
    const secondRoot = document.createElement("main");

    source.append(secondRoot);

    expect(() => insertDOMNode(document, secondRoot))
      .toThrow();
    expect(secondRoot.parentNode).toBe(source);
    expect(source.firstChild).toBe(secondRoot);
  });

  it("rejects invalid parents, references, and duplicate node groups", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const other = document.createElement("section");
    const node = document.createElement("p");

    expect(() => insertDOMNode(document.createTextNode("text"), node))
      .toThrow("Element, Document, or DocumentFragment parent");
    expect(() => insertDOMNode(parent, node, other))
      .toThrow("reference must be a child");
    expect(() => insertDOMNodes(parent, [node, node]))
      .toThrow("more than once");
    expect(() => insertDOMNodes(parent, [node], node))
      .toThrow("cannot be part of the inserted node group");
  });

  it("supports Document and DocumentFragment parents", () => {
    const document = createDocument();
    const fragment = createDOMFragment(document);
    const section = document.createElement("section");
    const topLevelComment = document.createComment("before-document-element");

    insertDOMNode(fragment, section);
    insertDOMNode(document, topLevelComment, document.documentElement);

    expect(fragment.firstChild).toBe(section);
    expect(topLevelComment.parentNode).toBe(document);
    expect(topLevelComment.nextSibling).toBe(document.documentElement);
  });
});

describe("render_new DOM removal", () => {
  it("removes attached nodes and is idempotent for detached nodes", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const first = document.createElement("a");
    const second = document.createElement("b");

    parent.append(first, second);

    expect(removeDOMNode(first)).toBe(true);
    expect(removeDOMNode(first)).toBe(false);
    expect(first.parentNode).toBeNull();
    expect(elementNames(parent)).toEqual(["b"]);
  });

  it("removes an ordered group and returns the number of attached nodes", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const first = document.createElement("a");
    const second = document.createElement("b");
    const detached = document.createElement("c");

    parent.append(first, second);

    expect(removeDOMNodes([first, second, detached])).toBe(2);
    expect(parent.childNodes).toHaveLength(0);
    expect(removeDOMNodes([])).toBe(0);
  });

  it("rejects duplicate nodes and invalid input", () => {
    const document = createDocument();
    const node = document.createElement("div");

    expect(() => removeDOMNode(null as unknown as Node)).toThrow("valid Node");
    expect(() => removeDOMNodes([node, node])).toThrow("more than once");
    expect(() => removeDOMNodes(null as unknown as Iterable<Node>))
      .toThrow("iterable of Nodes");
  });
});

describe("render_new DOM node ranges", () => {
  it("creates detached start and end comment boundaries", () => {
    const document = createDocument();
    const range = createDOMRange(document, "each");

    expect(range.start.nodeType).toBe(8);
    expect(range.end.nodeType).toBe(8);
    expect(range.start.data).toBe("each:start");
    expect(range.end.data).toBe("each:end");
    expect(Object.isFrozen(range)).toBe(true);
    expect(isDOMRangeAttached(range)).toBe(false);
    expect(getDOMRangeNodes(range)).toEqual([range.start, range.end]);
    expect(getDOMRangeContentNodes(range)).toEqual([]);
  });

  it("inserts a range and exposes nodes between its anchors", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const range = createDOMRange(document, "component");
    const first = document.createElement("span");
    const second = document.createTextNode("content");

    insertDOMRange(parent, range);
    insertDOMNodes(parent, [first, second], range.end);

    expect(isDOMRangeAttached(range)).toBe(true);
    expect(getDOMRangeNodes(range)).toEqual([
      range.start,
      first,
      second,
      range.end,
    ]);
    expect(getDOMRangeContentNodes(range)).toEqual([first, second]);
  });

  it("moves a complete range across parents without recreating its nodes", () => {
    const document = createDocument();
    const source = document.createElement("section");
    const target = document.createElement("main");
    const range = createDOMRange(document, "row");
    const content = document.createElement("article");
    const targetAnchor = document.createElement("footer");

    insertDOMRange(source, range);
    insertDOMNode(source, content, range.end);
    target.append(targetAnchor);

    const originalNodes = getDOMRangeNodes(range);
    moveDOMRange(range, target, targetAnchor);

    expect(source.childNodes).toHaveLength(0);
    expect(Array.from(target.childNodes)).toEqual([
      ...originalNodes,
      targetAnchor,
    ]);
    expect(getDOMRangeContentNodes(range)[0]).toBe(content);
  });

  it("does not move a range when the insertion point is inside itself", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const range = createDOMRange(document, "stable");
    const content = document.createElement("span");

    insertDOMRange(parent, range);
    insertDOMNode(parent, content, range.end);

    const before = getDOMRangeNodes(range);
    moveDOMRange(range, parent, content);

    expect(getDOMRangeNodes(range)).toEqual(before);
  });

  it("removes boundaries and content together", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const range = createDOMRange(document, "dispose");

    insertDOMRange(parent, range);
    insertDOMNode(parent, document.createElement("span"), range.end);
    insertDOMNode(parent, document.createElement("b"), range.end);

    expect(removeDOMRange(range)).toBe(4);
    expect(parent.childNodes).toHaveLength(0);
    expect(removeDOMRange(range)).toBe(0);
  });

  it("rejects malformed ranges and boundaries that do not share a parent", () => {
    const document = createDocument();
    const range = createDOMRange(document, "broken");
    const firstParent = document.createElement("div");
    const secondParent = document.createElement("section");

    expect(() =>
      getDOMRangeNodes({ start: range.start, end: range.start }),
    ).toThrow("distinct start and end anchors");

    firstParent.append(range.start);
    secondParent.append(range.end);

    expect(() => getDOMRangeNodes(range))
      .toThrow("must share the same parent");
    expect(() => isDOMRangeAttached(range))
      .toThrow("must share the same parent");
  });

  it("rejects a reversed range whose end is not reachable", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const range = createDOMRange(document, "reversed");

    parent.append(range.end, range.start);

    expect(() => getDOMRangeNodes(range))
      .toThrow("end anchor is not reachable");
  });
});
