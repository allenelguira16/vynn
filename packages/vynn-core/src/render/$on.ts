import { NotReadyError } from "../components/boundary";
import { getCurrentOwner } from "../life-cycle/owner";
import { getRenderMode } from "../utils/render-mode";

type VynnEvent<
  E extends HTMLElement,
  K extends keyof HTMLElementEventMap,
> = HTMLElementEventMap[K] & {
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
export function $on<E extends HTMLElement, K extends keyof HTMLElementEventMap>(
  element: E,
  event: K,
  handler: (event: VynnEvent<E, K>) => void,
): void {
  if (getRenderMode()) return;

  const owner = getCurrentOwner();

  if (!owner) {
    throw new Error(`Vynn: $on must be used inside component`);
  }

  function handle(event: Event) {
    try {
      handler(event as VynnEvent<E, K>);
    } catch (error) {
      if (error instanceof NotReadyError) {
        // DO NOTHING
      } else {
        throw error;
      }
    }
  }

  element.addEventListener(event, handle);

  owner.cleanups.push(() => {
    element.removeEventListener(event, handle);
  });
}
