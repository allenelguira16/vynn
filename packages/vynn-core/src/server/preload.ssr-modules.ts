import { getSsrRequestModuleIds } from "./ssr-request-context";

/** Return the live module set collected by the active SSR request. */
export function getSsrModuleIds(): ReadonlySet<string> {
  return getSsrRequestModuleIds();
}
