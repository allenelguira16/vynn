import { onDestroy } from "~/lifecycle/on-destroy";
import { onMount } from "~/lifecycle/on-mount";
import { renderChildren } from "~/client/render-children";
import { PropsWithChildren } from "~/types/props";

/**
 * A portal component for rendering into different part of the dom
 *
 * @param children The children of the Portal.
 * @param target
 * @returns
 */
export function Portal({ children, target }: PropsWithChildren<{ target: Node }>) {
  let cleanup: () => void;

  onMount(() => {
    const mount: Node = (target instanceof Function ? target() : target) ?? document.body;
    cleanup = renderChildren(mount, children);
  });

  onDestroy(() => {
    cleanup();
  });

  return () => null;
}
