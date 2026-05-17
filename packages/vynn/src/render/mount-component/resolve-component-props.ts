import { Loop } from "~/component/loop";
import { Portal } from "~/component/portal";
import { Suspense } from "~/component/suspense";

const IGNORE_COMPONENT = [Suspense, Loop, Portal] as Array<(...args: any[]) => any>;

/**
 * resolve the component props
 *
 * @param type - The type of the component.
 * @param props - The properties of the component.
 */
export function resolveComponentProps(
  type: (...args: any[]) => any,
  props: Record<string, any> = {},
) {
  if (IGNORE_COMPONENT.includes(type)) return;

  for (const key in props) {
    props[key] = props[key] instanceof Function ? props[key]() : props[key];
  }
}
