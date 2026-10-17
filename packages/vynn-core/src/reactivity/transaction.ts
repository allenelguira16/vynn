import type { EffectFn } from "./$effect";

export type Transaction = {
  parent?: Transaction;
  effects: Set<EffectFn>;
};

let currentTransaction: Transaction | undefined;

const effectQueue = new Set<EffectFn>();
const renderEffectQueue = new Set<EffectFn>();

let isFlushScheduled = false;
let isFlushing = false;
let isFlushingRenderEffects = false;

/**
 * Returns the active transaction.
 */
export function getCurrentTransaction(): Transaction | undefined {
  return currentTransaction;
}

/**
 * Runs a callback inside a reactive transaction.
 *
 * Nested transactions merge their scheduled effects into their parent.
 * The outermost transaction commits render effects synchronously and
 * queues ordinary effects for asynchronous flushing.
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
      for (const effect of tx.effects) {
        parent.effects.add(effect);
      }
    } else {
      commitTransaction(tx);
    }
  }
}

/**
 * Schedules an effect in the current transaction.
 *
 * Render effects run synchronously when the transaction commits.
 * Ordinary effects run through the asynchronous effect queue.
 */
export function scheduleEffect(effect: EffectFn): void {
  if (effect.disposed) {
    return;
  }

  if (currentTransaction) {
    currentTransaction.effects.add(effect);
    return;
  }

  if (effect.phase === "render") {
    queueRenderEffects([effect]);
    return;
  }

  queueEffect(effect);
}

/**
 * Commits a completed transaction.
 */
function commitTransaction(tx: Transaction): void {
  const renderEffects: EffectFn[] = [];

  for (const effect of tx.effects) {
    if (effect.disposed) {
      continue;
    }

    if (effect.phase === "render") {
      renderEffects.push(effect);
    } else {
      queueEffect(effect);
    }
  }

  // Run every render effect synchronously before returning.
  queueRenderEffects(renderEffects);
}

/**
 * Adds render effects to a deduplicated queue and flushes them
 * synchronously. Nested invalidations are processed in subsequent
 * passes instead of recursively flushing the queue.
 */
function queueRenderEffects(effects: Iterable<EffectFn>): void {
  for (const effect of effects) {
    if (!effect.disposed) {
      renderEffectQueue.add(effect);
    }
  }

  if (isFlushingRenderEffects || renderEffectQueue.size === 0) {
    return;
  }

  isFlushingRenderEffects = true;

  try {
    while (renderEffectQueue.size > 0) {
      const pendingEffects = [...renderEffectQueue];

      renderEffectQueue.clear();

      for (const effect of pendingEffects) {
        if (!effect.disposed) {
          effect();
        }
      }
    }
  } finally {
    isFlushingRenderEffects = false;
  }
}

/**
 * Adds an ordinary effect to the asynchronous queue.
 */
function queueEffect(effect: EffectFn): void {
  if (effect.disposed) {
    return;
  }

  effectQueue.add(effect);

  if (isFlushScheduled || isFlushing) {
    return;
  }

  isFlushScheduled = true;
  queueMicrotask(flushEffects);
}

/**
 * Flushes ordinary effects. Effects scheduled during this flush
 * are processed in a subsequent microtask.
 */
function flushEffects(): void {
  isFlushScheduled = false;
  isFlushing = true;

  try {
    const effects = [...effectQueue];

    effectQueue.clear();

    for (const effect of effects) {
      if (!effect.disposed) {
        effect();
      }
    }
  } finally {
    isFlushing = false;

    if (effectQueue.size > 0 && !isFlushScheduled) {
      isFlushScheduled = true;
      queueMicrotask(flushEffects);
    }
  }
}
