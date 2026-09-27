import { JSX } from "../jsx";

export interface Owner {
  Component?: () => JSX.Element;
  parent: Owner | null;
  children: Owner[];
  cleanups: (() => void)[];
  boundary?: (promise: Promise<void>) => void;
  disposed?: boolean;
  context: Map<string | symbol, any>;
}

let currentOwner: Owner | null = null;

export function getCurrentOwner(): Owner | null {
  return currentOwner;
}

export function createOwner(parent = currentOwner): Owner {
  const owner: Owner = {
    parent,
    children: [],
    cleanups: [],
    context: new Map(),
  };

  parent?.children.push(owner);

  return owner;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previousOwner = currentOwner;

  currentOwner = owner;

  try {
    return fn();
  } finally {
    queueMicrotask(() => {
      currentOwner = previousOwner;
    });
  }
}

export function dispose(owner: Owner): void {
  if (owner.disposed) {
    return;
  }

  owner.disposed = true;

  for (const child of [...owner.children]) {
    dispose(child);
  }

  owner.children.length = 0;

  for (const cleanup of owner.cleanups.splice(0)) {
    cleanup();
  }

  if (owner.parent) {
    const index = owner.parent.children.indexOf(owner);

    if (index !== -1) {
      owner.parent.children.splice(index, 1);
    }
  }

  owner.parent = null;
}

export function setOwnerContext<T>(key: string | symbol, value: T) {
  const owner = currentOwner;
  if (!owner) return;

  owner.context.set(key, value);
}

export function getOwnerContext<T>(key: string | symbol): T | undefined {
  let owner = currentOwner;
  // console.log(owner);

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key);
    }
    owner = owner.parent;
  }

  return undefined;
}
