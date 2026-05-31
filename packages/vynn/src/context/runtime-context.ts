import { MemoState } from "~/util/memo";

import { getStream, StreamContext } from "./stream-context";

const globalContextMap = new Map<
  StreamContext,
  {
    suspenseID: number;
    resourceID: number;
    lazyID: number;
    stateID: number;
    memo: Map<() => any, MemoState<any, any>>;
  }
>();

const globalContext = {
  suspenseID: 0,
  resourceID: 0,
  lazyID: 0,
  stateID: 0,
  memo: new Map(),
};

export const getRuntimeContext = () => {
  const context = getStream();

  if (!globalContextMap.has(context)) globalContextMap.set(context, globalContext);

  const value = globalContextMap.get(context);

  if (!value) throw new Error("[vynn]: GlobalContext does not exists");

  return value;
};

export const resetRuntimeContext = () => {
  const stream = getRuntimeContext();

  stream.memo.clear();
  stream.lazyID = 0;
  stream.resourceID = 0;
  stream.stateID = 0;
  stream.suspenseID = 0;
};
