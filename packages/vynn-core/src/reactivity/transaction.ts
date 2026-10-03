import type { EffectFn } from "./$effect";

export type Transaction = {
  parent?: Transaction;
  effects: Set<EffectFn>;
};

let currentTransaction: Transaction | undefined;

const effectQueue = new Set<EffectFn>();
let isFlushScheduled = false;
let isFlushing = false;

/**
 * Returns the transaction currently being executed.
 *
 * @returns The current transaction, or `undefined` when no transaction is active.
 */
export function getCurrentTransaction(): Transaction | undefined {
  return currentTransaction;
}

/**
 * Runs a callback within a reactive transaction.
 *
 * Effects scheduled during the transaction are collected and committed when
 * the outermost transaction completes. Nested transactions merge their
 * scheduled effects into their parent transaction.
 *
 * @template T The return type of the callback.
 * @param callback The function to execute within the transaction.
 * @returns The value returned by the callback.
 */
export function transaction<T>(callback: () => T): T {
  const parent = currentTransaction;

  const tx: Transaction = {
    parent,
    effects: new Set(),
  };

  currentTransaction = tx;

  try {
    return callback();
  } finally {
    currentTransaction = parent;

    if (parent) {
      // Nested transaction:
      // merge its effects into the parent.
      for (const effect of tx.effects) {
        parent.effects.add(effect);
      }
    } else {
      // Outermost transaction.
      commitTransaction(tx);
    }
  }
}

/**
 * Schedules an effect within the current transaction or queues it for
 * asynchronous flushing when no transaction is active.
 *
 * @param effect The effect to schedule.
 */
export function scheduleEffect(effect: EffectFn): void {
  if (currentTransaction) {
    currentTransaction.effects.add(effect);
    return;
  }

  queueEffect(effect);
}

/**
 * Commits the effects collected by a completed transaction.
 *
 * @param tx The transaction whose effects should be queued.
 */
function commitTransaction(tx: Transaction): void {
  for (const effect of tx.effects) {
    queueEffect(effect);
  }
}

/**
 * Adds an effect to the queue and schedules a microtask to flush it.
 *
 * Effects are not flushed while another flush is already in progress.
 *
 * @param effect The effect to queue.
 */
function queueEffect(effect: EffectFn): void {
  effectQueue.add(effect);

  if (isFlushScheduled || isFlushing) {
    return;
  }

  isFlushScheduled = true;
  queueMicrotask(flushEffects);
}

/**
 * Flushes the current effect queue.
 *
 * The queue is snapshotted before execution so effects scheduled while
 * flushing are deferred to a subsequent microtask.
 */
function flushEffects(): void {
  isFlushScheduled = false;
  isFlushing = true;

  try {
    // Snapshot the current queue.
    // Anything scheduled while flushing gets another microtask.
    const effects = [...effectQueue];

    effectQueue.clear();

    for (const effect of effects) {
      effect();
    }
  } finally {
    isFlushing = false;

    if (effectQueue.size > 0 && !isFlushScheduled) {
      isFlushScheduled = true;
      queueMicrotask(flushEffects);
    }
  }
}
