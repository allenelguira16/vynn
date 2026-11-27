import { onMount } from "../life-cycle/on-mount";
import { getOwner, getOwnerIdentityID } from "../life-cycle/owner";
import { PORTAL_END_SSR_MARKER, PORTAL_START_SSR_MARKER } from "../const";
import { $cmpnt, $insert } from "../render";
import { createSSRComment, SSR_ELEMENT } from "../render/resolve-node";
import { JSX } from "../types/jsx";
import { PropsWithChildren } from "../types/props";

function getPortalID(): string {
  const id = getOwnerIdentityID(getOwner());

  if (id === undefined) {
    throw new Error("[vynn]: Portal must be rendered inside an active component owner.");
  }

  return id;
}

function getPortalMarkerValues(id: string): [string, string] {
  return [
    PORTAL_START_SSR_MARKER + ":" + id,
    PORTAL_END_SSR_MARKER + ":" + id,
  ];
}

function findPortalRange(
  mount: Element,
  id: string,
): [Comment, Comment] | undefined {
  const [startValue, endValue] = getPortalMarkerValues(id);
  let start: Comment | undefined;
  let node: Node | null = mount.firstChild;

  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const comment = node as Comment;

      if (!start && comment.data === startValue) {
        start = comment;
      } else if (start && comment.data === endValue) {
        return [start, comment];
      }
    }

    node = node.nextSibling;
  }

  if (start) {
    throw new Error("[vynn]: An SSR Portal range is missing its closing marker.");
  }

  return undefined;
}

function clearPortalContents(start: Node, end: Node): void {
  let current = start.nextSibling;

  while (current && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

/**
 * Renders its children into a specified mount node.
 *
 * The portal itself does not render anything at its original location.
 * Its children are inserted into the provided mount node after mounting.
 * During SSR, mount must be an element rendered in the same app tree.
 *
 * @param props The portal mount node and child content to render.
 * @returns null because the portal does not render at its original location.
 */
export const Portal = $cmpnt(function Portal<E extends Element>(
  props: PropsWithChildren<{ mount: E }>,
): JSX.Element {
  if (!props.mount) return null;

  const id = getPortalID();

  if (import.meta.env.SSR) {
    if (!(props.mount instanceof SSR_ELEMENT)) {
      throw new Error(
        "[vynn]: SSR Portal requires mount to reference an element rendered in the same app tree.",
      );
    }

    const [startValue, endValue] = getPortalMarkerValues(id);
    const start = createSSRComment(startValue);
    const end = createSSRComment(endValue);

    props.mount.appendChild(start);
    props.mount.appendChild(end);

    $insert(
      props.mount as unknown as Element,
      () => props.children,
      end as unknown as Node,
    );

    return null;
  }

  onMount(() => {
    const existingRange = findPortalRange(props.mount, id);
    const start = existingRange?.[0] ?? document.createComment(getPortalMarkerValues(id)[0]);
    const end = existingRange?.[1] ?? document.createComment(getPortalMarkerValues(id)[1]);

    if (existingRange) {
      // Portal nodes are rendered on the server, but remounted on the client
      // after the root hydration pass to keep hydration claims isolated.
      clearPortalContents(start, end);
    } else {
      props.mount.append(start, end);
    }

    const cleanup = $insert(props.mount, () => props.children, end);

    return () => {
      if (typeof cleanup === "function") cleanup();
      clearPortalContents(start, end);
      start.parentNode?.removeChild(start);
      end.parentNode?.removeChild(end);
    };
  });

  return null;
});
