import { untrack } from "@/reactivity/untrack";
import { FC, PropsWithChildren } from "@/types/props";

import { resolveComponentProps } from "./render-component.util";

export function renderComponent<T extends PropsWithChildren<Record<string, any>>>(
  type: FC<T>,
  props?: Omit<T, "children">,
  children?: T["children"],
) {
  resolveComponentProps(type, props);

  // const value = type({ ...props, children } as T) as () => void;

  // return value();

  return untrack(() => type({ ...props, children } as T) as () => void)();

  // } catch (error) {
  //   const handler = getSuspenseBoundary();
  //   if (error instanceof Promise) {
  //     console.log(handler(), error);
  //   } else {
  //     throw error;
  //   }
  // }
}

function resolve(item: any) {
  if (Array.isArray(item)) {
    return item.map(resolve);
  } else if (typeof item === "function") {
    return resolve(item());
  } else {
    return item;
  }
}
