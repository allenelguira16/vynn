import { getOwner } from "../life-cycle/owner";
import { getOwnerContext, setOwnerContext } from "./owner-context";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

export function initializeSsrModuleContext(modules = new Set<string>()) {
  const owner = getOwner();
  if (!owner || getOwnerContext<Set<string>>(SSR_MODULES)) return;
  setOwnerContext(SSR_MODULES, modules);
}

/** Return the module set belonging to the active SSR owner. */
export function getSsrModuleContext(): ReadonlySet<string> {
  const modules = getOwnerContext<Set<string>>(SSR_MODULES);

  if (!modules) {
    throw new Error("[vynn]: getSsrModuleIds must be called within an active SSR owner.");
  }

  return modules;
}

/** Record a lazy module only when its component is reached during SSR. */
export function registerSsrModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getOwnerContext<Set<string>>(SSR_MODULES)?.add(moduleId);
}
