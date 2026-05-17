import { createStateContext } from "~/context/create-state-context";
import { RuntimeContext } from "~/context/runtime-context";

/**
 * Creates a lifecycle context for managing component lifecycle events.
 *
 * @param key - The key for the lifecycle context, used to associate state with a specific component instance.
 * @returns LifecycleContext - The created lifecycle context.
 */
export function createLifeCycleContext(key?: string) {
  const context: RuntimeContext = {
    mount: [],
    state: createStateContext(key),
    effect: [],
    destroy: [],
  };

  return context;
}
