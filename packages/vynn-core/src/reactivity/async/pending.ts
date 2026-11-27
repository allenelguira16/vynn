import { PendingReadError } from "./pending-error";
import { node, track, notify, untrack, type Source } from "../graph";

type PendingRecord = {
  source: Source;
  value: boolean;
  getPromise?: () => Promise<unknown> | undefined;
  registerBoundary: boolean;
  refresh?: () => void;
};

const accessors = new WeakMap<object, PendingRecord>();

export function registerPending(
  value: object,
  accessor: () => boolean,
  getPromise?: () => Promise<unknown> | undefined,
  registerBoundary = true,
  refresh?: () => void,
): (notifyObservers?: boolean) => void {
  const record: PendingRecord = {
    source: node(),
    value: accessor(),
    getPromise,
    registerBoundary,
    refresh,
  };
  accessors.set(value, record);

  return (notifyObservers = true) => {
    const next = accessor();
    if (record.value === next) return;
    record.value = next;
    if (notifyObservers) notify(record.source);
  };
}

export function getPendingPromise(value: object): Promise<unknown> | undefined {
  return accessors.get(value)?.getPromise?.();
}

export function isPendingInternal(value: object): boolean {
  const record = accessors.get(value);
  if (!record) return false;
  track(record.source);
  return record.value;
}

export function isPending(value: object): boolean {
  const record = accessors.get(value);
  if (!record) return false;

  // Hydration data may only become available when an ownerless resource is
  // first consumed. Refresh before tracking/returning its cached pending state.
  if (record.refresh) untrack(record.refresh);

  track(record.source);

  if (import.meta.env.SSR && record.value) {
    const promise = record.getPromise?.();
    if (promise) throw new PendingReadError(promise, record.source, record.registerBoundary);
  }

  return record.value;
}
