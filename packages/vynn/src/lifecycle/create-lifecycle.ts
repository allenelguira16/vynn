import { createStateContext, RuntimeContext } from "~/context";

/**
 * Creates a lifecycle context for managing component lifecycle events.
 *
 * @param key - The key for the lifecycle context, used to associate state with a specific component instance.
 * @returns LifecycleContext - The created lifecycle context.
 */
export function createLifeCycleContext(key?: string) {
  const context: RuntimeContext = {
    // id: window.crypto.randomUUID(),
    mount: [],
    state: createStateContext(key),
    effect: [],
    destroy: [],
  };

  return context;
}
