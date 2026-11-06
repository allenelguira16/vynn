import { isInsideAwaitBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { registerSsrPortal, type PortalMount } from "../context/ssr-portal-context";
import { onMount } from "../life-cycle/on-mount";
import { $cmpnt, $insert } from "../render";
import { JSX } from "../types/jsx";
import { PropsWithChildren } from "../types/props";

/**
 * Renders its children into a specified mount node.
 *
 * On the server, `mount` may be an SSR element reference, an ID selector,
 * or a tag selector that resolves to an element in the rendered application.
 * In the browser, selector strings are resolved with `document.querySelector`.
 *
 * @param props The portal mount target and child content to render.
 * @returns `null` because the portal does not render at its original location.
 */
export const Portal = $cmpnt(function Portal(
  props: PropsWithChildren<{ mount: PortalMount }>,
): JSX.Element {
  if (isServer()) {
    // Evaluate children under an active Await so pending $async reads reach
    // that boundary. Otherwise defer evaluation until the target namespace is
    // known during portal relocation.
    const hasAwaitBoundary = isInsideAwaitBoundary();
    const children = hasAwaitBoundary ? props.children : undefined;
    registerSsrPortal(props.mount, () =>
      hasAwaitBoundary ? children! : props.children,
    );
    return null;
  }

  onMount(() => {
    const mount =
      typeof props.mount === "string" ? document.querySelector(props.mount) : props.mount;

    if (mount instanceof Node) {
      $insert(mount, () => props.children);
    }
  });

  return null;
});
