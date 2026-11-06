import type { Owner } from "../life-cycle/owner";
import type { JSX } from "../types/jsx";
import type { SSR_ELEMENT, SSR_NODE } from "../render/resolve-node";

import { getContext, getOwner, runWithOwner, setContext } from "../life-cycle/owner";
import { getChildDOMNamespace, withDOMNamespace } from "../render/namespace";
import { resolveSSRChild } from "../render/resolve-node";

export type PortalMount = Element | string;

type SsrPortalEntry = {
  mount: PortalMount;
  owner: Owner | null;
  children: () => JSX.Element;
};

type SsrPortalContext = {
  entries: SsrPortalEntry[];
  nextEntry: number;
};

export interface SsrPortalPatch {
  readonly selector: string;
  readonly nodes: SSR_NODE[];
}

const SSR_PORTAL_CONTEXT = Symbol.for("vynn.ssr-portal-context");

/** Creates an isolated portal registry for one server render. */
export function initializeSsrPortalContext(): SsrPortalContext {
  const context: SsrPortalContext = {
    entries: [],
    nextEntry: 0,
  };

  setContext(SSR_PORTAL_CONTEXT, context);
  return context;
}

/** Registers portal content against the current SSR render. */
export function registerSsrPortal(mount: PortalMount, children: () => JSX.Element): void {
  const context = getContext<SsrPortalContext>(SSR_PORTAL_CONTEXT);

  if (!context) {
    throw new Error("[vynn]: Portal was rendered on the server without an active SSR portal context.");
  }

  context.entries.push({
    mount,
    owner: getOwner(),
    children,
  });
}

/**
 * Moves registered portal content into its SSR target nodes.
 *
 * String targets intentionally support only an ID selector or a tag selector.
 * Resolving arbitrary CSS selectors would require implementing a CSS selector
 * engine over Vynn's lightweight SSR tree.
 */
export function flushSsrPortals(
  root: SSR_NODE[],
  localRoot?: SSR_NODE[],
): SsrPortalPatch[] {
  const context = getContext<SsrPortalContext>(SSR_PORTAL_CONTEXT);
  if (!context) return [];

  const patches: SsrPortalPatch[] = [];

  while (context.nextEntry < context.entries.length) {
    const entry = context.entries[context.nextEntry++];
    const localTarget = localRoot ? resolvePortalTarget(localRoot, entry.mount) : null;
    const target = localTarget ?? resolvePortalTarget(root, entry.mount);

    if (!target) {
      throw new Error(
        `[vynn]: SSR Portal target "${String(entry.mount)}" was not found in the rendered application.`,
      );
    }

    const childNamespace = getChildDOMNamespace(target.namespaceURI, target.type);
    const nodes = runWithOwner(entry.owner, () =>
      resolveSSRChild(() => withDOMNamespace(childNamespace, entry.children)),
    );

    for (const node of nodes) {
      target.appendChild(node);
    }

    // A target created within the boundary will be included in that boundary's
    // HTML patch. Targets outside the boundary need their own streamed patch.
    if (localRoot && !localTarget) {
      patches.push({
        selector: getPortalPatchSelector(entry.mount, target),
        nodes,
      });
    }
  }

  return patches;
}

function resolvePortalTarget(root: SSR_NODE[], mount: PortalMount): SSR_ELEMENT | null {
  if (typeof mount !== "string") {
    return isSsrElement(mount)
      ? findSsrElement(root, (element) => element === mount)
      : null;
  }

  const selector = mount.trim();
  let matches: (element: SSR_ELEMENT) => boolean;

  if (selector.startsWith("#") && selector.length > 1) {
    const id = selector.slice(1);
    matches = (element) => element.attributes.id === id;
  } else if (/^[a-z][a-z0-9-]*$/i.test(selector)) {
    const tagName = selector.toLowerCase();
    matches = (element) => element.type.toLowerCase() === tagName;
  } else {
    throw new Error(
      `[vynn]: SSR Portal target "${selector}" is unsupported. Use an SSR element, an ID selector, or a tag selector.`,
    );
  }

  return findSsrElement(root, matches);
}

function findSsrElement(
  nodes: SSR_NODE[],
  matches: (element: SSR_ELEMENT) => boolean,
): SSR_ELEMENT | null {
  for (const node of nodes) {
    if (!isSsrElement(node)) continue;

    if (matches(node)) return node;

    const nested = findSsrElement(node.children, matches);
    if (nested) return nested;
  }

  return null;
}

function isSsrElement(value: unknown): value is SSR_ELEMENT {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "children" in value &&
    Array.isArray(value.children) &&
    "attributes" in value &&
    "namespaceURI" in value &&
    "appendChild" in value
  );
}
