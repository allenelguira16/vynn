import { createStateContext } from "~/context/create-state-context";
import { RuntimeContext } from "~/context/runtime-context";

/**
 * Creates a lifecycle context for managing component lifecycle events.
 *
 * @param id - The key for the lifecycle context, used to associate state with a specific component instance.
 * @returns LifecycleContext - The created lifecycle context.
 */
export function createLifeCycleContext(id: string) {
  const context: RuntimeContext = {
    id,
    mount: [],
    state: createStateContext(id),
    effect: [],
    destroy: [],
  };

  return context;
}
