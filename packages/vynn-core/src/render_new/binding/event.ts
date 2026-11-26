import { $renderEffect } from "../../reactivity/effect";
import { onScopeDispose, runWithScope } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";

/** A native DOM event handler function or listener object. */
export type EventHandler = EventListenerOrEventListenerObject;

/** A nullable reactive event handler value. */
export type EventHandlerValue = EventHandler | null | undefined;

/** A reactive event listener registration owned by a render scope. */
export interface EventBinding extends Disposable {
  readonly target: EventTarget;
  readonly type: string;
}

interface NormalizedEventOptions {
  readonly capture: boolean;
  readonly addOptions: boolean | AddEventListenerOptions;
}

function assertEventTarget(target: EventTarget): void {
  if (
    !target ||
    typeof target !== "object" ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function"
  ) {
    throw new TypeError("[vynn]: bindEvent() expects a DOM EventTarget.");
  }
}

function assertEventType(type: string): void {
  if (
    typeof type !== "string" ||
    type.length === 0 ||
    type.trim() !== type
  ) {
    throw new TypeError("[vynn]: bindEvent() expects a non-empty event type.");
  }
}

function normalizeEventOptions(
  options?: boolean | AddEventListenerOptions,
): NormalizedEventOptions {
  if (options === undefined) {
    return { capture: false, addOptions: false };
  }

  if (typeof options === "boolean") {
    return { capture: options, addOptions: options };
  }

  if (typeof options !== "object" || options === null) {
    throw new TypeError("[vynn]: bindEvent() received invalid event options.");
  }

  // Snapshot the options so caller mutation cannot make removal use a
  // different capture mode from the one used when the listener was added.
  const capture = Boolean(options.capture);
  const addOptions: AddEventListenerOptions = Object.freeze({
    ...options,
    capture,
  });

  return { capture, addOptions };
}

function normalizeHandler(value: EventHandlerValue): EventHandler | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "function") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    typeof value.handleEvent === "function"
  ) {
    return value;
  }

  throw new TypeError(
    "[vynn]: bindEvent() expects an event handler function, listener object, or nullish value.",
  );
}

/**
 * Binds a DOM event listener to a reactive accessor.
 *
 * The initial handler is registered synchronously. When the accessor returns
 * a different handler, the previous registration is removed before the new
 * one is added. Returning null or undefined removes the listener.
 *
 * Event options are snapshotted at creation. A boolean or AddEventListenerOptions
 * object is passed to addEventListener(); removeEventListener() receives the
 * matching capture flag. The binding itself is removed on explicit disposal
 * or when its owning render scope is disposed.
 */
export function bindEvent(
  scope: RenderScope,
  target: EventTarget,
  type: string,
  read: Accessor<EventHandlerValue>,
  options?: boolean | AddEventListenerOptions,
): EventBinding {
  assertEventTarget(target);
  assertEventType(type);

  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindEvent() expects a handler accessor.");
  }

  const normalizedOptions = normalizeEventOptions(options);
  let currentHandler: EventHandler | null = null;
  let disposed = false;
  let stopEffect: () => void = () => {};
  let unregisterScopeCleanup: () => void = () => {};

  const removeCurrentHandler = (): void => {
    if (currentHandler === null) return;

    target.removeEventListener(
      type,
      currentHandler,
      normalizedOptions.capture,
    );
    currentHandler = null;
  };

  const dispose = (): void => {
    if (disposed) return;

    // Stop reactive replacement before removing the last registered handler.
    stopEffect();
    removeCurrentHandler();
    unregisterScopeCleanup();
    disposed = true;
  };

  stopEffect = runWithScope(scope, () =>
    $renderEffect(() => {
      const nextHandler = normalizeHandler(read());

      if (nextHandler === currentHandler) {
        return;
      }

      removeCurrentHandler();

      if (nextHandler !== null) {
        target.addEventListener(
          type,
          nextHandler,
          normalizedOptions.addOptions,
        );
        currentHandler = nextHandler;
      }
    }),
  );

  // Register after the effect so Owner teardown stops reactive updates first.
  unregisterScopeCleanup = runWithScope(scope, () =>
    onScopeDispose(dispose),
  );

  return Object.freeze({
    target,
    type,
    dispose,
  });
}
