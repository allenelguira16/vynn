import { getRuntimeContext } from "~/context";

export type DestroyFn = () => Promise<void> | void;

/**
 * on destroy
 *
 * @param fn - The function to run on destroy.
 */
export function onDestroy(fn: DestroyFn) {
  const context = getRuntimeContext();
  if (!context) {
    throw new Error("onDestroy called outside of component");
  }

  context.destroy.push(fn);
}
