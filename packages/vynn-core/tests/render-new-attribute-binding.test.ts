import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { $effect } from "../src/reactivity/effect";
import { $state } from "../src/reactivity/state";
import {
  createScope,
  disposeScope,
} from "../src/render_new/lifecycle/scope";
import {
  bindAttribute,
  type AttributeBinding,
} from "../src/render_new/binding/attribute";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new attribute binding", () => {
  it("applies the initial attribute value synchronously", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state("first");

    const binding = bindAttribute(scope, element, "title", () => value.value);

    expect(element.getAttribute("title")).toBe("first");
    expect(binding.element).toBe(element);
    expect(binding.name).toBe("title");

    binding.dispose();
    disposeScope(scope);
  });

  it("updates synchronously when a tracked state value changes", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state("first");

    bindAttribute(scope, element, "data-value", () => value.value);
    value.value = "second";

    expect(element.getAttribute("data-value")).toBe("second");

    disposeScope(scope);
  });

  it("runs before ordinary effects", async () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state("first");
    const observed: Array<string | null> = [];

    bindAttribute(scope, element, "title", () => value.value);
    $effect(() => {
      value.value;
      observed.push(element.getAttribute("title"));
    });

    expect(observed).toEqual(["first"]);

    value.value = "second";

    expect(element.getAttribute("title")).toBe("second");
    expect(observed).toEqual(["first"]);

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(observed).toEqual(["first", "second"]);

    disposeScope(scope);
  });

  it("tracks conditional accessor dependencies", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const first = $state("one");
    const second = $state("two");
    const useFirst = $state(true);

    bindAttribute(scope, element, "data-value", () =>
      useFirst.value ? first.value : second.value,
    );

    expect(element.getAttribute("data-value")).toBe("one");

    useFirst.value = false;
    expect(element.getAttribute("data-value")).toBe("two");

    first.value = "stale";
    expect(element.getAttribute("data-value")).toBe("two");

    second.value = "latest";
    expect(element.getAttribute("data-value")).toBe("latest");

    disposeScope(scope);
  });

  it("removes attributes for nullish values and stringifies other values", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state<unknown>(42);

    bindAttribute(scope, element, "data-value", () => value.value);
    expect(element.getAttribute("data-value")).toBe("42");

    value.value = false;
    expect(element.getAttribute("data-value")).toBe("false");

    value.value = null;
    expect(element.hasAttribute("data-value")).toBe(false);

    value.value = undefined;
    expect(element.hasAttribute("data-value")).toBe(false);

    value.value = 12n;
    expect(element.getAttribute("data-value")).toBe("12");

    disposeScope(scope);
  });

  it("writes and removes namespaced SVG attributes", () => {
    const document = createDocument();
    const element = document.createElementNS(SVG_NAMESPACE, "use");
    const scope = createScope(null);
    const value = $state<unknown>("#symbol");

    bindAttribute(
      scope,
      element,
      {
        namespaceURI: XLINK_NAMESPACE,
        qualifiedName: "xlink:href",
      },
      () => value.value,
    );

    expect(element.getAttributeNS(XLINK_NAMESPACE, "href")).toBe("#symbol");
    expect(element.getAttribute("xlink:href")).toBe("#symbol");

    value.value = null;

    expect(element.getAttributeNS(XLINK_NAMESPACE, "href")).toBeNull();
    expect(element.hasAttribute("xlink:href")).toBe(false);

    disposeScope(scope);
  });

  it("uses the explicit local name and snapshots the namespace descriptor", () => {
    const document = createDocument();
    const element = document.createElementNS(SVG_NAMESPACE, "use");
    const scope = createScope(null);
    const value = $state("initial");
    const name = {
      namespaceURI: XLINK_NAMESPACE,
      qualifiedName: "xlink:href",
      localName: "href",
    };

    bindAttribute(scope, element, name, () => value.value);
    name.localName = "mutated";
    value.value = "updated";

    expect(element.getAttributeNS(XLINK_NAMESPACE, "href")).toBe("updated");
    expect(element.getAttributeNS(XLINK_NAMESPACE, "mutated")).toBeNull();

    disposeScope(scope);
  });

  it("does not write an unchanged attribute value", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const revision = $state(0);
    const setAttribute = vi.spyOn(element, "setAttribute");

    bindAttribute(scope, element, "data-value", () => {
      revision.value;
      return "same";
    });

    expect(setAttribute).toHaveBeenCalledTimes(1);

    revision.value += 1;

    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(element.getAttribute("data-value")).toBe("same");

    disposeScope(scope);
  });

  it("stops updating after explicit binding disposal", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state("before");
    const binding = bindAttribute(scope, element, "title", () => value.value);

    binding.dispose();
    value.value = "after";

    expect(element.getAttribute("title")).toBe("before");
    expect(scope.state).toBe("active");

    binding.dispose();
    disposeScope(scope);
  });

  it("stops updating when the owning render scope is disposed", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const value = $state("before");

    bindAttribute(scope, element, "title", () => value.value);
    disposeScope(scope);
    value.value = "after";

    expect(element.getAttribute("title")).toBe("before");
    expect(scope.state).toBe("disposed");
  });

  it("rejects invalid elements, names, and accessors", () => {
    const document = createDocument();
    const scope = createScope(null);
    const element = document.createElement("div");

    expect(() =>
      bindAttribute(
        scope,
        document.createTextNode("") as unknown as Element,
        "title",
        () => "value",
      ),
    ).toThrow("expects a DOM Element");

    expect(() =>
      bindAttribute(scope, element, "", () => "value"),
    ).toThrow("expects a non-empty attribute name");

    expect(() =>
      bindAttribute(
        scope,
        element,
        {
          namespaceURI: XLINK_NAMESPACE,
          qualifiedName: "xlink:href",
          localName: "wrong",
        },
        () => "value",
      ),
    ).toThrow("invalid namespaced attribute name");

    expect(() =>
      bindAttribute(
        scope,
        element,
        "title",
        null as unknown as () => unknown,
      ),
    ).toThrow("expects a value accessor");

    disposeScope(scope);
  });

  it("rejects binding creation in a disposed scope", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);

    disposeScope(scope);

    expect(() =>
      bindAttribute(scope, element, "title", () => "value"),
    ).toThrow("Cannot enter a render scope that is disposed");
  });
});
