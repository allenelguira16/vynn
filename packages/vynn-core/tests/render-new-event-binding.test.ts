import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import { $effect } from "../src/reactivity/effect";
import { $state } from "../src/reactivity/state";
import {
  createScope,
  disposeScope,
  onScopeDispose,
  runWithScope,
} from "../src/render_new/lifecycle/scope";
import {
  bindEvent,
  type EventHandlerValue,
} from "../src/render_new/binding/event";

function createDocument(): Document {
  return new JSDOM("<!doctype html><html><body></body></html>").window.document;
}

function createEvent(document: Document, type = "click", bubbles = false): Event {
  const EventConstructor = document.defaultView?.Event;

  if (!EventConstructor) {
    throw new Error("Expected the test document to have a Window.");
  }

  return new EventConstructor(type, { bubbles });
}

describe("render_new event binding", () => {
  it("registers the initial handler synchronously", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();

    const binding = bindEvent(scope, button, "click", () => handler);

    button.dispatchEvent(createEvent(document));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(binding.target).toBe(button);
    expect(binding.type).toBe("click");

    binding.dispose();
    disposeScope(scope);
  });

  it("replaces the previous listener when the reactive handler changes", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const first = vi.fn();
    const second = vi.fn();
    const handler = $state<EventHandlerValue>(first);

    bindEvent(scope, button, "click", () => handler.value);

    button.dispatchEvent(createEvent(document));
    handler.value = second;
    button.dispatchEvent(createEvent(document));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    disposeScope(scope);
  });

  it("removes the listener when the accessor returns null or undefined", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();
    const current = $state<EventHandlerValue>(handler);

    bindEvent(scope, button, "click", () => current.value);

    button.dispatchEvent(createEvent(document));
    current.value = null;
    button.dispatchEvent(createEvent(document));
    current.value = undefined;
    button.dispatchEvent(createEvent(document));

    expect(handler).toHaveBeenCalledTimes(1);

    disposeScope(scope);
  });

  it("does not re-register the same handler when another dependency changes", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();
    const revision = $state(0);
    const add = vi.spyOn(button, "addEventListener");
    const remove = vi.spyOn(button, "removeEventListener");

    bindEvent(scope, button, "click", () => {
      revision.value;
      return handler;
    });

    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();

    revision.value += 1;

    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();

    disposeScope(scope);
  });

  it("tracks conditional handler dependencies", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const first = vi.fn();
    const second = vi.fn();
    const useFirst = $state(true);
    const firstHandler = $state<EventHandlerValue>(first);
    const secondHandler = $state<EventHandlerValue>(second);

    bindEvent(scope, button, "click", () =>
      useFirst.value ? firstHandler.value : secondHandler.value,
    );

    button.dispatchEvent(createEvent(document));
    useFirst.value = false;
    button.dispatchEvent(createEvent(document));

    firstHandler.value = vi.fn();
    button.dispatchEvent(createEvent(document));

    secondHandler.value = vi.fn();
    button.dispatchEvent(createEvent(document));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    disposeScope(scope);
  });

  it("updates the listener before ordinary effects run", async () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const first = vi.fn();
    const second = vi.fn();
    const handler = $state<EventHandlerValue>(first);
    const observed: string[] = [];

    bindEvent(scope, button, "click", () => handler.value);

    $effect(() => {
      handler.value;
      button.dispatchEvent(createEvent(document));
      observed.push(second.mock.calls.length > 0 ? "second" : "first");
    });

    expect(observed).toEqual(["first"]);

    handler.value = second;

    // The new listener is installed synchronously by the render-priority
    // effect. The ordinary effect itself remains queued.
    button.dispatchEvent(createEvent(document));
    expect(second).toHaveBeenCalledTimes(1);
    expect(observed).toEqual(["first"]);

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(observed).toEqual(["first", "second"]);

    disposeScope(scope);
  });

  it("supports listener objects with handleEvent()", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const listener = { handleEvent: vi.fn() };

    bindEvent(scope, button, "click", () => listener);
    button.dispatchEvent(createEvent(document));

    expect(listener.handleEvent).toHaveBeenCalledTimes(1);

    disposeScope(scope);
  });

  it("supports native once and capture options", () => {
    const document = createDocument();
    const parent = document.createElement("div");
    const child = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();

    parent.append(child);
    bindEvent(scope, parent, "click", () => handler, {
      capture: true,
      once: true,
    });

    child.dispatchEvent(createEvent(document, "click", true));
    child.dispatchEvent(createEvent(document, "click", true));

    expect(handler).toHaveBeenCalledTimes(1);

    disposeScope(scope);
  });

  it("uses the snapshotted capture option when removing the listener", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();
    const options = { capture: true };
    const remove = vi.spyOn(button, "removeEventListener");

    const binding = bindEvent(scope, button, "click", () => handler, options);
    options.capture = false;
    binding.dispose();

    expect(remove).toHaveBeenCalledWith("click", handler, true);

    disposeScope(scope);
  });

  it("stops receiving events after explicit binding disposal", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();
    const binding = bindEvent(scope, button, "click", () => handler);

    binding.dispose();
    button.dispatchEvent(createEvent(document));

    expect(handler).not.toHaveBeenCalled();
    expect(scope.state).toBe("active");

    disposeScope(scope);
  });

  it("removes the listener when the owning render scope is disposed", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);
    const handler = vi.fn();

    bindEvent(scope, button, "click", () => handler);
    disposeScope(scope);
    button.dispatchEvent(createEvent(document));

    expect(handler).not.toHaveBeenCalled();
    expect(scope.state).toBe("disposed");
  });

  it("supports unregistering a scope cleanup before scope disposal", () => {
    const scope = createScope(null);
    const cleanup = vi.fn();
    let unregister = () => {};

    runWithScope(scope, () => {
      unregister = onScopeDispose(cleanup);
    });

    unregister();
    unregister();
    disposeScope(scope);

    expect(cleanup).not.toHaveBeenCalled();
  });

  it("rejects invalid targets, event types, handlers, and options", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);

    expect(() =>
      bindEvent(
        scope,
        {} as EventTarget,
        "click",
        () => null,
      ),
    ).toThrow("expects a DOM EventTarget");

    expect(() =>
      bindEvent(scope, button, "", () => null),
    ).toThrow("expects a non-empty event type");

    expect(() =>
      bindEvent(
        scope,
        button,
        "click",
        null as unknown as () => EventHandlerValue,
      ),
    ).toThrow("expects a handler accessor");

    expect(() =>
      bindEvent(scope, button, "click", () => 42 as unknown as EventHandlerValue),
    ).toThrow("expects an event handler function");

    expect(() =>
      bindEvent(
        scope,
        button,
        "click",
        () => null,
        null as unknown as AddEventListenerOptions,
      ),
    ).toThrow("received invalid event options");

    disposeScope(scope);
  });

  it("rejects binding creation in a disposed scope", () => {
    const document = createDocument();
    const button = document.createElement("button");
    const scope = createScope(null);

    disposeScope(scope);

    expect(() =>
      bindEvent(scope, button, "click", () => null),
    ).toThrow("Cannot enter a render scope that is disposed");
  });
});
