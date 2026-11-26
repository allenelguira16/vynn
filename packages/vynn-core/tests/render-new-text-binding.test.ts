import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

import { $state } from "../src/reactivity/state";
import {
  createScope,
  disposeScope,
  runWithScope,
} from "../src/render_new/lifecycle/scope";
import { bindText, type TextBinding } from "../src/render_new/binding/text";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new text binding", () => {
  it("writes the initial accessor value synchronously", () => {
    const document = createDocument();
    const node = document.createTextNode("old");
    const scope = createScope(null);
    const value = $state("hello");

    const binding = bindText(scope, node, () => value.value);

    expect(node.data).toBe("hello");
    expect(binding.node).toBe(node);

    binding.dispose();
    disposeScope(scope);
  });

  it("updates synchronously when a tracked state value changes", () => {
    const document = createDocument();
    const node = document.createTextNode("");
    const scope = createScope(null);
    const value = $state("first");

    bindText(scope, node, () => value.value);

    value.value = "second";

    expect(node.data).toBe("second");

    disposeScope(scope);
  });

  it("tracks dependencies read by the accessor", () => {
    const document = createDocument();
    const node = document.createTextNode("");
    const scope = createScope(null);
    const first = $state("one");
    const second = $state("two");
    const useFirst = $state(true);

    bindText(scope, node, () =>
      useFirst.value ? first.value : second.value,
    );

    expect(node.data).toBe("one");

    useFirst.value = false;
    expect(node.data).toBe("two");

    first.value = "stale";
    expect(node.data).toBe("two");

    second.value = "latest";
    expect(node.data).toBe("latest");

    disposeScope(scope);
  });

  it("converts nullish values to empty text and other values with String()", () => {
    const document = createDocument();
    const node = document.createTextNode("initial");
    const scope = createScope(null);
    const value = $state<unknown>(42);

    bindText(scope, node, () => value.value);
    expect(node.data).toBe("42");

    value.value = null;
    expect(node.data).toBe("");

    value.value = undefined;
    expect(node.data).toBe("");

    value.value = false;
    expect(node.data).toBe("false");

    value.value = 12n;
    expect(node.data).toBe("12");

    disposeScope(scope);
  });

  it("does not update after explicit binding disposal", () => {
    const document = createDocument();
    const node = document.createTextNode("");
    const scope = createScope(null);
    const value = $state("before");
    const binding = bindText(scope, node, () => value.value);

    binding.dispose();
    value.value = "after";

    expect(node.data).toBe("before");
    expect(scope.state).toBe("active");

    binding.dispose();
    disposeScope(scope);
  });

  it("stops updating when its owning scope is disposed", () => {
    const document = createDocument();
    const node = document.createTextNode("");
    const scope = createScope(null);
    const value = $state("before");

    bindText(scope, node, () => value.value);
    disposeScope(scope);
    value.value = "after";

    expect(node.data).toBe("before");
    expect(scope.state).toBe("disposed");
  });

  it("automatically belongs to the scope active at binding creation", () => {
    const document = createDocument();
    const node = document.createTextNode("");
    const parentScope = createScope(null);
    const value = $state("before");
    let binding!: TextBinding;

    runWithScope(parentScope, () => {
      binding = bindText(parentScope, node, () => value.value);
    });

    expect(node.data).toBe("before");

    disposeScope(parentScope);
    value.value = "after";

    expect(node.data).toBe("before");
    expect(parentScope.state).toBe("disposed");

    binding.dispose();
  });

  it("rejects invalid text nodes and accessors", () => {
    const document = createDocument();
    const scope = createScope(null);
    const element = document.createElement("div");

    expect(() =>
      bindText(scope, element as unknown as Text, () => "value"),
    ).toThrow("expects a DOM Text node");

    expect(() =>
      bindText(scope, document.createTextNode(""), null as unknown as () => unknown),
    ).toThrow("expects a value accessor");

    disposeScope(scope);
  });

  it("rejects binding creation in a disposed scope", () => {
    const document = createDocument();
    const scope = createScope(null);
    disposeScope(scope);

    expect(() =>
      bindText(scope, document.createTextNode(""), () => "value"),
    ).toThrow("Cannot enter a render scope that is disposed");
  });

  it("preserves ordinary text content without treating it as markup", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const node = document.createTextNode("");
    const scope = createScope(null);
    const value = $state("<img src=x onerror=alert(1)>");

    parent.append(node);
    bindText(scope, node, () => value.value);

    expect(parent.querySelector("img")).toBeNull();
    expect(parent.textContent).toBe("<img src=x onerror=alert(1)>");

    disposeScope(scope);
  });
});
