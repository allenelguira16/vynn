import { DestroyFn, MountFn } from "~/lifecycle";
import { EffectFn, State } from "~/reactivity";

export interface RuntimeContext {
  id: string;
  mount: MountFn[];
  effect: EffectFn[];
  state: {
    states: State<any>[];
    index: number;
  };
  destroy: DestroyFn[];
}

let runtimeContext: RuntimeContext | null = null;

export function setRuntimeContext(ctx: RuntimeContext | null) {
  runtimeContext = ctx;
}

export function getRuntimeContext(): RuntimeContext | null {
  return runtimeContext;
}
