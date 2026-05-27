type EventHandlerMap = Map<string, EventListener>;

const eventRegistry = new WeakMap<HTMLElement, EventHandlerMap>();

/**
 * Add an event listener
 *
 * @param element - The element to add the event listener to.
 * @param type - The type of event to listen for.
 * @param listener - The event listener function.
 */
export function addEventListener(element: HTMLElement, type: string, listener: EventListener) {
  let handlers = eventRegistry.get(element);

  if (!handlers) {
    handlers = new Map();
    eventRegistry.set(element, handlers);
  }

  // Remove old listener if any
  if (handlers.has(type)) {
    element.removeEventListener(type, handlers.get(type)!);
  }

  element.addEventListener(type, listener);
  handlers.set(type, listener);
}

/**
 * Remove an event listener
 *
 * @param element - The element to remove the event listener from.
 * @param type - The type of event to remove.
 */
export function removeEventListener(element: HTMLElement, type: string) {
  const handlers = eventRegistry.get(element);
  if (!handlers) return;

  const listener = handlers.get(type);
  if (listener) {
    element.removeEventListener(type, listener);
    handlers.delete(type); // Remove it from the map
  }

  // Clean up if no handlers left
  if (handlers.size === 0) {
    eventRegistry.delete(element);
  }
}

/**
 * Copy event listeners from one element to another
 *
 * @param from - The element to copy the event listeners from.
 * @param to - The element to copy the event listeners to.
 */
export function copyEventListeners(from: HTMLElement, to: HTMLElement) {
  const handlers = eventRegistry.get(from);
  if (!handlers) return;

  handlers.forEach((listener, type) => {
    removeEventListener(to, type);
    addEventListener(to, type, listener);
  });
}

/**
 * Remove all event listeners from an element
 *
 * @param element - The element to remove the event listeners from.
 */
export function removeEventListeners(element: HTMLElement) {
  const handlers = eventRegistry.get(element);
  if (!handlers) return;

  handlers.forEach((listener, type) => {
    element.removeEventListener(type, listener);
  });

  eventRegistry.delete(element);
}
