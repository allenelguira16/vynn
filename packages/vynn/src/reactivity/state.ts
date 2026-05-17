import { getRuntimeContext } from "~/context/runtime-context";

import { track, trigger } from "./track";

export type State<T> = { value: T };

/**
 * Create a state
 *
 * @param initialValue - The initial value of the state.
 * @returns The state object.
 */
export function $state<T>(initialValue: T): State<T>;
export function $state<T = undefined>(): State<T | undefined>;
export function $state<T>(initialValue?: T): State<T | undefined> {
  const context = getRuntimeContext();
  if (context && context.state) {
    const { states, index } = context.state;
    if (states.length <= index) {
      // Create new state if it doesn't exist
      const s = createState(initialValue);
      states.push(s);
    }
    // Return existing state and increment index
    return states[context.state.index++];
  }
  // fallback: not in a component context
  return createState(initialValue);
}

function createState<T>(initialValue?: T): State<T | undefined> {
  const state = { value: initialValue };

  return new Proxy(state, {
    get(target, key, receiver) {
      track(target, key);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, newValue, receiver) {
      const oldValue = target[key as keyof typeof target];
      const result = Reflect.set(target, key, newValue, receiver);

      if (oldValue !== newValue) {
        trigger(target, key);
      }

      return result;
    },
  });
}
