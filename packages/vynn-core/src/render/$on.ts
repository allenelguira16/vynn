import { bindRuntimeContext } from "../runtime/context";

import { getOwner, runWithOwner } from "../life-cycle/owner";

type VynnEvent<E extends Element, K extends keyof HTMLElementEventMap> = HTMLElementEventMap[K] & {
  readonly currentTarget: E;
};

/**
 * Registers an event listener on a DOM node.
 *
 * The listener is automatically removed when the current component owner
 * is disposed.
 *
 * Must be called while a component owner is active.
 *
 * @template E The element type.
 * @template K The event name.
 * @param element The DOM element to attach the listener to.
 * @param event The name of the event to listen for.
 * @param handler The function to call when the event is dispatched.
 */
export function $on<E extends Element, K extends keyof HTMLElementEventMap>(
  element: E,
  event: K,
  handler: (event: VynnEvent<E, K>) => void,
  capture = false,
): void {
  if (import.meta.env.SSR) return;


  const owner = getOwner();

  if (!owner) {
    throw new Error(`[vynn]: $on must be used inside component`);
  }

  const invoke = bindRuntimeContext((event: Event) => {
    runWithOwner(owner, () => {
      handler(event as VynnEvent<E, K>);
    });
  });

  function handle(event: Event) {
    invoke(event);
  }

  element.addEventListener(event, handle, capture);

  owner.cleanups.push(() => {
    element.removeEventListener(event, handle, capture);
  });
}
