import { isServer } from "../context/is-server-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $renderEffect } from "../reactivity_new/effect";
import { $attr, setDOMAttributeValue, type AttributeValue } from "./$attr";

type EventBinding = {
  eventName: string;
  capture: boolean;
  handler: unknown;
  listener: EventListener;
};

const NO_REF = Symbol("vynn.spread.no-ref");

function getEventAttribute(name: string): { eventName: string; capture: boolean } | undefined {
  if (name.length <= 2 || !name.startsWith("on") || name[2] !== name[2].toUpperCase()) {
    return undefined;
  }

  const capture = name.endsWith("Capture");
  const event = name.slice(2, capture ? -7 : undefined).toLowerCase();

  if (!event) return undefined;

  return {
    eventName: event === "doubleclick" ? "dblclick" : event,
    capture,
  };
}

function setRef(ref: unknown, element: Element | null): void {
  if (typeof ref === "function") {
    (ref as (value: Element | null) => void)(element);
    return;
  }

  if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: Element | null }).current = element;
  }
}

/**
 * Reactively applies spread props without creating a new effect per property
 * on every update. Event listeners are stable and read their latest handler.
 */
export function $spread<E extends Element, P extends Record<string, any>>(
  element: E,
  props: () => P,
): void {
  if (isServer()) {
    const next = props() ?? ({} as P);

    for (const [name, value] of Object.entries(next)) {
      if (name === "key" || name === "children" || name === "ref" || getEventAttribute(name)) {
        continue;
      }

      $attr(element, name, value as AttributeValue);
    }

    return;
  }

  const owner = getOwner();
  const previousKeys = new Set<string>();
  const eventBindings = new Map<string, EventBinding>();
  let currentRef: unknown = NO_REF;

  const removeEventBinding = (name: string): void => {
    const binding = eventBindings.get(name);
    if (!binding) return;

    element.removeEventListener(binding.eventName, binding.listener, binding.capture);
    eventBindings.delete(name);
  };

  const updateEventBinding = (
    name: string,
    event: { eventName: string; capture: boolean },
    handler: unknown,
  ): void => {
    if (typeof handler !== "function") {
      removeEventBinding(name);
      return;
    }

    const existing = eventBindings.get(name);
    if (existing) {
      if (existing.eventName !== event.eventName || existing.capture !== event.capture) {
        removeEventBinding(name);
      } else {
        existing.handler = handler;
        return;
      }
    }

    const binding: EventBinding = {
      ...event,
      handler,
      listener: (() => undefined) as EventListener,
    };

    binding.listener = (eventObject: Event) => {
      if (typeof binding.handler !== "function") return;

      runWithOwner(owner, () => {
        (binding.handler as (event: Event) => void)(eventObject);
      });
    };

    eventBindings.set(name, binding);
    element.addEventListener(binding.eventName, binding.listener, binding.capture);
  };

  const clearRef = (): void => {
    if (currentRef === NO_REF) return;
    setRef(currentRef, null);
    currentRef = NO_REF;
  };

  const disposeSpread = (): void => {
    for (const name of [...eventBindings.keys()]) removeEventBinding(name);
    clearRef();
  };

  owner?.cleanups.push(disposeSpread);

  $renderEffect(() => {
    const next = props() ?? ({} as P);
    const keys = new Set(Object.keys(next));

    for (const name of previousKeys) {
      if (keys.has(name)) continue;

      if (getEventAttribute(name)) {
        removeEventBinding(name);
      } else if (name === "ref") {
        clearRef();
      } else if (name !== "key" && name !== "children") {
        setDOMAttributeValue(element, name, undefined);
      }
    }

    for (const name of keys) {
      const value = next[name];

      if (name === "key" || name === "children") continue;

      if (name === "ref") {
        if (value !== currentRef) {
          clearRef();
          if (value != null) {
            setRef(value, element);
            currentRef = value;
          }
        }
        continue;
      }

      const event = getEventAttribute(name);
      if (event) {
        updateEventBinding(name, event, value);
        continue;
      }

      // Match direct JSX attribute semantics: function-valued spread props are
      // accessors, while event handlers and refs were handled above.
      const attributeValue =
        typeof value === "function" ? (value as () => AttributeValue)() : value;
      setDOMAttributeValue(element, name, attributeValue as AttributeValue);
    }

    previousKeys.clear();
    for (const name of keys) previousKeys.add(name);
  });
}
