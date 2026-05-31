export type Owner = {
  parent: Owner | null;
  context: Map<string | symbol, any>;
  cleanups: (() => void)[];
};

let currentOwner: Owner | null = null;

export function getOwner() {
  return currentOwner;
}

export function createOwner(parent: Owner | null): Owner {
  return {
    parent,
    context: new Map(),
    cleanups: [],
  };
}

export function runOwnerCleanups() {
  // console.log(currentOwner);
  let root = currentOwner;
  const cleanups: (() => void)[] = [];
  while (root && root.parent) {
    cleanups.push(...root.cleanups);
    root = root.parent;
  }

  for (const cleanup of cleanups) {
    cleanup();
  }
}

export function runWithOwner<T>(owner: Owner, fn: () => T): T {
  const prev = currentOwner;
  currentOwner = owner;

  try {
    return fn();
  } finally {
    queueMicrotask(() => {
      currentOwner = prev;
    });
  }
}

export function setContext<T>(key: string | symbol, value: T) {
  const owner = currentOwner;
  if (!owner) return;

  owner.context.set(key, value);
}

export function getContext<T>(key: string | symbol): T | undefined {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key);
    }
    owner = owner.parent;
  }

  return undefined;
}
