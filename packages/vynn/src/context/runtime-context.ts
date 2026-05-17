import { DestroyFn } from "~/lifecycle/on-destroy";
import { MountFn } from "~/lifecycle/on-mount";
import { EffectFn } from "~/reactivity/effect";
import { State } from "~/reactivity/state";

export interface RuntimeContext {
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
