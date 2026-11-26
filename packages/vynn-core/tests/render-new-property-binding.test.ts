import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { $effect } from "../src/reactivity/effect";
import { $state } from "../src/reactivity/state";
import {
  createScope,
  disposeScope,
} from "../src/render_new/lifecycle/scope";
import { bindProperty } from "../src/render_new/binding/property";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

describe("render_new property binding", () => {
  it("assigns the initial value to the DOM property synchronously", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const value = $state("hello");

    const binding = bindProperty(scope, input, "value", () => value.value);

    expect(input.value).toBe("hello");
    expect(binding.element).toBe(input);
    expect(binding.name).toBe("value");

    binding.dispose();
    disposeScope(scope);
  });

  it("preserves native property types instead of stringifying values", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const checked = $state(true);

    bindProperty(scope, input, "checked", () => checked.value);

    expect(input.checked).toBe(true);

    checked.value = false;
    expect(input.checked).toBe(false);

    disposeScope(scope);
  });

  it("creates an absent custom property when its initial value is undefined", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);

    bindProperty(scope, element, "customValue", () => undefined);

    expect(Object.prototype.hasOwnProperty.call(element, "customValue")).toBe(
      true,
    );
    expect(
      (element as unknown as { customValue: unknown }).customValue,
    ).toBeUndefined();

    disposeScope(scope);
  });

  it("assigns object and nullish values directly to custom properties", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const token = {};
    const value = $state<unknown>(token);

    bindProperty(scope, element, "customValue", () => value.value);

    expect((element as unknown as { customValue: unknown }).customValue).toBe(
      token,
    );

    value.value = null;
    expect((element as unknown as { customValue: unknown }).customValue).toBe(
      null,
    );

    value.value = undefined;
    expect(
      (element as unknown as { customValue: unknown }).customValue,
    ).toBeUndefined();

    disposeScope(scope);
  });

  it("updates synchronously when a tracked state value changes", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const value = $state("first");

    bindProperty(scope, input, "value", () => value.value);
    value.value = "second";

    expect(input.value).toBe("second");

    disposeScope(scope);
  });

  it("runs before ordinary effects", async () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const value = $state("first");
    const observed: string[] = [];

    bindProperty(scope, input, "value", () => value.value);
    $effect(() => {
      value.value;
      observed.push(input.value);
    });

    expect(observed).toEqual(["first"]);

    value.value = "second";

    expect(input.value).toBe("second");
    expect(observed).toEqual(["first"]);

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(observed).toEqual(["first", "second"]);

    disposeScope(scope);
  });

  it("tracks conditional accessor dependencies", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const first = $state<unknown>("one");
    const second = $state<unknown>("two");
    const useFirst = $state(true);

    bindProperty(scope, element, "currentValue", () =>
      useFirst.value ? first.value : second.value,
    );

    expect((element as unknown as { currentValue: unknown }).currentValue).toBe(
      "one",
    );

    useFirst.value = false;
    expect((element as unknown as { currentValue: unknown }).currentValue).toBe(
      "two",
    );

    first.value = "stale";
    expect((element as unknown as { currentValue: unknown }).currentValue).toBe(
      "two",
    );

    second.value = "latest";
    expect((element as unknown as { currentValue: unknown }).currentValue).toBe(
      "latest",
    );

    disposeScope(scope);
  });

  it("does not invoke a property setter when the value is unchanged", () => {
    const document = createDocument();
    const element = document.createElement("div");
    const scope = createScope(null);
    const revision = $state(0);
    const setter = vi.fn((_value: unknown) => {});
    let currentValue: unknown;

    Object.defineProperty(element, "customValue", {
      configurable: true,
      get: () => currentValue,
      set: (value: unknown) => {
        setter(value);
        currentValue = value;
      },
    });

    bindProperty(scope, element, "customValue", () => {
      revision.value;
      return Number.NaN;
    });

    expect(setter).toHaveBeenCalledTimes(1);
    expect(currentValue).toBeNaN();

    revision.value += 1;

    expect(setter).toHaveBeenCalledTimes(1);
    expect(currentValue).toBeNaN();

    disposeScope(scope);
  });

  it("stops updating after explicit binding disposal", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const value = $state("before");
    const binding = bindProperty(scope, input, "value", () => value.value);

    binding.dispose();
    value.value = "after";

    expect(input.value).toBe("before");
    expect(scope.state).toBe("active");

    binding.dispose();
    disposeScope(scope);
  });

  it("stops updating when the owning render scope is disposed", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);
    const value = $state("before");

    bindProperty(scope, input, "value", () => value.value);
    disposeScope(scope);
    value.value = "after";

    expect(input.value).toBe("before");
    expect(scope.state).toBe("disposed");
  });

  it("rejects invalid elements, names, and accessors", () => {
    const document = createDocument();
    const scope = createScope(null);
    const input = document.createElement("input");

    expect(() =>
      bindProperty(
        scope,
        document.createTextNode("") as unknown as Element,
        "value",
        () => "value",
      ),
    ).toThrow("expects a DOM Element");

    expect(() =>
      bindProperty(scope, input, "", () => "value"),
    ).toThrow("expects a non-empty property name");

    expect(() =>
      bindProperty(
        scope,
        input,
        "value",
        null as unknown as () => unknown,
      ),
    ).toThrow("expects a value accessor");

    disposeScope(scope);
  });

  it("rejects binding creation in a disposed scope", () => {
    const document = createDocument();
    const input = document.createElement("input");
    const scope = createScope(null);

    disposeScope(scope);

    expect(() =>
      bindProperty(scope, input, "value", () => "value"),
    ).toThrow("Cannot enter a render scope that is disposed");
  });
});
