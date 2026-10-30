const SSR_RESULT_MODULES = Symbol.for("vynn.ssr-module-ids");

/** Associate the collected modules with a result, across bundled runtime copies. */
export function attachSsrModules<T extends object>(
  result: T,
  modules: Set<string>,
): T {
  Object.defineProperty(result, SSR_RESULT_MODULES, {
    configurable: false,
    enumerable: false,
    value: modules,
    writable: false,
  });
  return result;
}

/** Return the live set, so streaming SSR can see lazy modules discovered later. */
export function getSsrModuleIds(result: unknown): ReadonlySet<string> {
  if (
    (typeof result !== "object" && typeof result !== "function") ||
    result === null
  ) {
    return new Set<string>();
  }

  const modules = (result as { [key: symbol]: unknown })[SSR_RESULT_MODULES];
  if (
    modules &&
    typeof modules === "object" &&
    typeof (modules as ReadonlySet<string>).has === "function" &&
    typeof (modules as ReadonlySet<string>)[Symbol.iterator] === "function"
  ) {
    return modules as ReadonlySet<string>;
  }

  return new Set<string>();
}
