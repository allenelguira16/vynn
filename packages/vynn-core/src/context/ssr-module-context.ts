import { getContext, setContext } from "../life-cycle/owner";
import { setSsrRequestModuleIds } from "../server/ssr-request-context";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

export function initializeSsrModuleContext(modules: Set<string>) {
  setContext(SSR_MODULES, modules);
  setSsrRequestModuleIds(modules);
}

/** Record a lazy module only when its component is reached during SSR. */
export function registerSsrModule(moduleId: string | undefined) {
  if (!moduleId) return;
  getContext<Set<string>>(SSR_MODULES)?.add(moduleId);
}
