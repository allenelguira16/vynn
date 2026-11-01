import { getContext } from "../life-cycle/owner";

const SSR_MODULES = Symbol.for("vynn.ssr-modules");

/** Return the live module set collected by the active SSR request. */
export function getSsrModuleIds(): ReadonlySet<string> {
  const modules = getContext<Set<string>>(SSR_MODULES);

  if (!modules) {
    throw new Error("[vynn]: No SSR module context is active.");
  }

  return modules;
}
