import { FC, PropsWithChildren } from "@/types/props";

import { renderComponent } from "./render-component";
import { renderElement } from "./render-element";

export function jsx<T extends PropsWithChildren<Record<string, any>>>(
  type: keyof HTMLElementTagNameMap | FC<T>,
  { children, ...props } = {} as T,
) {
  if (typeof type === "function") {
    const parent = getOwner();
    const owner = createOwner(parent);

    return runWithOwner(owner, () => {
      // try {
      // console.log(type);
      return renderComponent(type, props, children);
      // } catch (error) {
      //   const handler = getSuspenseBoundary();
      //   if (error instanceof Promise) {
      //     handler?.(error);
      //   } else {
      //     throw error;
      //   }
      //   // console.log();
      //   // console.log(error);
      // }
    });
  }

  return renderElement(type, props, children);
}

type Owner = {
  parent: Owner | null;
  context: Map<string, any>;
  cleanups: (() => void)[];
};

let currentOwner: Owner | null = null;

export function getOwner() {
  return currentOwner;
}

function createOwner(parent: Owner | null): Owner {
  return {
    parent,
    context: new Map(),
    cleanups: [],
  };
}

function runWithOwner<T>(owner: Owner, fn: () => T): T {
  const prev = currentOwner;
  currentOwner = owner;

  try {
    return fn();
  } finally {
    currentOwner = prev;
  }
}

export function setContext<T>(key: string, value: T) {
  const owner = currentOwner;
  if (!owner) return;

  owner.context.set(key, value);
}

export function getContext<T>(key: string): T | undefined {
  let owner = currentOwner;

  while (owner) {
    if (owner.context.has(key)) {
      return owner.context.get(key);
    }
    owner = owner.parent;
  }

  return undefined;
}
