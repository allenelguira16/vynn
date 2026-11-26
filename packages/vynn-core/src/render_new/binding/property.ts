import { $renderEffect } from "../../reactivity/effect";
import { runWithScope } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";

/** A reactive DOM property binding owned by a render scope. */
export interface PropertyBinding<
  TElement extends Element = Element,
  TName extends string = string,
> extends Disposable {
  readonly element: TElement;
  readonly name: TName;
}

function assertElement(element: Element): void {
  if (
    !element ||
    typeof element !== "object" ||
    element.nodeType !== 1
  ) {
    throw new TypeError("[vynn]: bindProperty() expects a DOM Element.");
  }
}

function assertPropertyName(name: string): void {
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.trim() !== name
  ) {
    throw new TypeError(
      "[vynn]: bindProperty() expects a non-empty property name.",
    );
  }
}

function writeProperty(
  element: Element,
  name: string,
  value: unknown,
): void {
  // Property bindings preserve the original value. The DOM property setter is
  // responsible for any platform-specific conversion.
  if (Object.is(Reflect.get(element, name), value)) {
    return;
  }

  if (!Reflect.set(element, name, value)) {
    throw new TypeError(
      `[vynn]: The DOM property "${name}" is not writable.`,
    );
  }
}

/**
 * Binds a DOM property to a reactive accessor.
 *
 * The initial value is assigned synchronously. Subsequent updates use Vynn's
 * render-priority effect and run after derived computations but before
 * ordinary effects. The effect belongs to the supplied render scope.
 *
 * Values are assigned directly without string conversion or nullish removal.
 * This intentionally follows the property's own DOM setter semantics:
 * input.checked receives booleans, input.value receives the value provided,
 * and custom element properties can receive objects.
 *
 * Attribute bindings should be used for serialized markup attributes, while
 * event bindings should be used to register event listeners.
 */
export function bindProperty<
  TElement extends Element,
  TName extends keyof TElement & string,
>(
  scope: RenderScope,
  element: TElement,
  name: TName,
  read: Accessor<TElement[TName]>,
): PropertyBinding<TElement, TName>;

export function bindProperty<TElement extends Element>(
  scope: RenderScope,
  element: TElement,
  name: string,
  read: Accessor<unknown>,
): PropertyBinding<TElement, string>;

export function bindProperty(
  scope: RenderScope,
  element: Element,
  name: string,
  read: Accessor<unknown>,
): PropertyBinding {
  assertElement(element);
  assertPropertyName(name);

  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindProperty() expects a value accessor.");
  }

  const stop = runWithScope(scope, () =>
    $renderEffect(() => {
      writeProperty(element, name, read());
    }),
  );

  return Object.freeze({
    element,
    name,
    dispose: stop,
  });
}
