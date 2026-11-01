import {
  getContext,
  getOwner,
  type Owner,
} from "../life-cycle/owner";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

export function initializeSsrModuleContext(modules: Set<string>): void {
  let owner: Owner | null = getOwner();

  if (!owner) {
    throw new Error(
      "[vynn]: SSR module context requires an active render owner.",
    );
  }

  while (owner.parent) {
    owner = owner.parent;
  }

  owner.context.set(SSR_MODULES, modules);
}

/** Record a lazy module only when its component is reached during SSR. */
export function registerSsrModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getContext<Set<string>>(SSR_MODULES)?.add(moduleId);
}
