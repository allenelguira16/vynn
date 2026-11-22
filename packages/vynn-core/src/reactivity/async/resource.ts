export type AsyncSettlement<T> = {
  promise: PromiseLike<T>;
  isCurrent: () => boolean;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
};

/** Share controller ownership between one-shot state and derived computations. */
export function createAbortControllerSlot() {
  let active: AbortController | undefined;

  return {
    start(enabled: boolean): AbortController | undefined {
      active?.abort();
      active = enabled ? new AbortController() : undefined;
      return active;
    },
    abort(): void {
      active?.abort();
      active = undefined;
    },
    abortRun(controller: AbortController | undefined): void {
      controller?.abort();
      if (active === controller) active = undefined;
    },
    finish(controller: AbortController | undefined): void {
      if (active === controller) active = undefined;
    },
  };
}

/** Use the same stale-run guard for every async graph node. */
export function settleAsync<T>({
  promise,
  isCurrent,
  resolve,
  reject,
}: AsyncSettlement<T>): Promise<void> {
  return Promise.resolve(promise).then(
    value => {
      if (isCurrent()) resolve(value);
    },
    cause => {
      if (isCurrent()) reject(cause);
    },
  );
}
