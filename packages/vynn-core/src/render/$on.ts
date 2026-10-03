import { getCurrentOwner } from "../life-cycle/owner";

/**
 * Registers an event listener on a DOM node.
 *
 * The listener is automatically removed when the current component owner
 * is disposed.
 *
 * Must be called while a component owner is active.
 *
 * @template K The event name.
 * @param element The DOM node to attach the listener to.
 * @param event The name of the event to listen for.
 * @param handler The function to call when the event is dispatched.
 */
export function $on<K extends keyof HTMLElementEventMap>(
  element: Node,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error(`Vynn: $on must be used inside component`);
  }

  function handle(e: Event) {
    handler(e as HTMLElementEventMap[K]);
  }

  element.addEventListener(event, handle);

  owner.cleanups.push(() => {
    element.removeEventListener(event, handle);
  });
}
