// import { getRuntimeContext } from "~/context/runtime-context";

// import { getContext } from "~/lifecycle/owner";
import { getContext, setContext } from "~/lifecycle/owner";

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
  let state = getContext<{ states: State<any>[]; index: number }>("state");
  if (!state) {
    state = { states: [], index: 0 };
    setContext<{ states: State<any>[]; index: number }>("state", state);
  }
  if (state) {
    const { states, index } = state;
    if (states.length <= index) {
      // Create new state if it doesn't exist
      const s = createState(initialValue);
      states.push(s);
    }
    // Return existing state and increment index
    return states[state.index++];
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
