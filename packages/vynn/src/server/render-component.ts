import { resolveComponentProps } from "~/client/resolve-component-props";
import { createOwner, getOwner, runWithOwner } from "~/lifecycle/owner";
import { untrack } from "~/reactivity/untrack";
import { FC, PropsWithChildren } from "~/types/props";

export function renderComponent<T extends PropsWithChildren<Record<string, any>>>(
  type: FC<T>,
  props?: Omit<T, "children">,
  children?: T["children"],
) {
  resolveComponentProps(type, props);

  const parent = getOwner();
  const owner = createOwner(parent);

  // try {
  return runWithOwner(owner, () => {
    if (props && children) {
      (props as T).children = children;
    }
    return untrack(() => type(props as unknown as T));
  });
  // } finally {
  //   owner.cleanups.forEach((cleanups) => cleanups());
  // }
}
