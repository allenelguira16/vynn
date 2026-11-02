import { getContext, getOwner, setContext } from "../life-cycle/owner";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

export function initializeSsrModuleContext(modules = new Set<string>()) {
  const owner = getOwner();
  if (!owner || owner.context.has(SSR_MODULES)) return;
  setContext(SSR_MODULES, modules);
}

/** Return the module set belonging to the active SSR owner. */
export function getSsrModuleContext(): ReadonlySet<string> {
  const modules = getContext<Set<string>>(SSR_MODULES);

  if (!modules) {
    throw new Error("[vynn]: getSsrModuleIds must be called within an active SSR owner.");
  }

  return modules;
}

/** Record a lazy module only when its component is reached during SSR. */
export function registerSsrModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getContext<Set<string>>(SSR_MODULES)?.add(moduleId);
}
