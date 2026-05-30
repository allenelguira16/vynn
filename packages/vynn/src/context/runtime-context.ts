import { DestroyFn } from "~/lifecycle/on-destroy";
import { MountFn } from "~/lifecycle/on-mount";
import { EffectFn } from "~/reactivity/effect";
import { State } from "~/reactivity/state";
import { MemoState } from "~/util/memo";

export interface RuntimeContext {
  // id: string;
  mount: MountFn[];
  effect: EffectFn[];
  state: {
    states: State<any>[];
    index: number;
  };
  destroy: DestroyFn[];
  memo: Map<() => any, MemoState<any, any>>;
}

let runtimeContext: RuntimeContext | null = null;

export function setRuntimeContext(ctx: RuntimeContext | null) {
  runtimeContext = ctx;
}

export function getRuntimeContext(): RuntimeContext | null {
  return runtimeContext;
}
