import type { JSX } from "../jsx-runtime";

import { isHydrating } from "../client/hydration";
import { isServer } from "../context/is-server-context";
import { $renderEffect } from "../reactivity_new/effect";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import { untrack } from "../reactivity_new/effect";
import { markParked, unmarkParked } from "./$cmpnt.util";
import { getCurrentDOMNamespace, withDOMNamespace } from "./namespace";
import { resolveNode, resolveSSRChild } from "./resolve-node";

type IfBranch = {
  start: Comment;
  end: Comment;
  fragment: DocumentFragment;
  nodes: Node[];
  shortCircuitText?: Text;
};

export type IfBranchRenderer = (active: boolean, render: () => Node[]) => Node[];

export function $if(
  condition: () => unknown,
  consequent: () => JSX.Element,
  alternate?: () => JSX.Element,
  renderBranch?: IfBranchRenderer,
): JSX.Element {
  const namespace = getCurrentDOMNamespace();
  const renderInNamespace = <T>(callback: () => T): T => withDOMNamespace(namespace, callback);

  if (isServer()) {
    return resolveSSRChild(() =>
      renderInNamespace(() => {
        const value = condition();

        if (value) return consequent();
        if (alternate) return alternate();

        // An omitted alternate represents the short-circuit result of an && expression.
        // Boolean results render no content, while falsy values such as 0
        // remain visible as ordinary JSX children.
        return (typeof value === "boolean" ? undefined : value) as JSX.Element;
      }),
    ) as unknown as JSX.Element;
  }

  const marker = document.createTextNode("");
  const branches = new Map<boolean, IfBranch>();

  function isShortCircuitText(value: unknown): value is string | number {
    return typeof value === "string" || typeof value === "number";
  }

  function renderShortCircuitValue(value: string | number): string {
    return String(value);
  }

  function createBranch(
    key: boolean,
    value: unknown,
    claimInitialText = false,
    parkInFragment = true,
  ): IfBranch {
    const start = document.createTextNode("");
    const end = document.createTextNode("");

    // With no alternate callback, the false branch represents the original
    // left operand of an && expression. Only strings/numbers create text.
    // Claim an SSR text node only during the initial render; later branch
    // switches create new nodes rather than consuming unrelated hydration text.
    const shortCircuitText =
      !key && !alternate && isShortCircuitText(value)
        ? claimInitialText
          ? (renderInNamespace(() => resolveNode(() => renderShortCircuitValue(value)))[0] as Text)
          : document.createTextNode(renderShortCircuitValue(value))
        : undefined;

    const renderContent = () =>
      key
        ? renderInNamespace(() => resolveNode(consequent))
        : alternate
          ? renderInNamespace(() => resolveNode(alternate))
          : shortCircuitText
            ? [shortCircuitText]
            : [];
    const content = renderBranch ? renderBranch(key, renderContent) : renderContent();

    const nodes = [start, ...content, end];
    const fragment = document.createDocumentFragment();

    // During hydration, the initial branch can contain SSR nodes that must
    // stay in their original DOM positions. A fresh CSR branch still starts
    // in a fragment, preserving the normal branch lifecycle.
    if (parkInFragment) {
      fragment.append(...nodes);
    }

    const branch: IfBranch = {
      start,
      end,
      fragment,
      nodes,
      shortCircuitText,
    };

    branches.set(key, branch);

    return branch;
  }

  function updateShortCircuitValue(branch: IfBranch, value: unknown): void {
    const shouldRenderText = isShortCircuitText(value);
    const currentText = branch.shortCircuitText;

    if (shouldRenderText) {
      const text = renderShortCircuitValue(value);

      if (currentText) {
        currentText.data = text;
      } else {
        const nextText = document.createTextNode(text);
        const endIndex = branch.nodes.indexOf(branch.end);

        branch.end.parentNode?.insertBefore(nextText, branch.end);

        if (endIndex !== -1) {
          branch.nodes.splice(endIndex, 0, nextText);
        }

        branch.shortCircuitText = nextText;
      }

      return;
    }

    if (currentText) {
      currentText.parentNode?.removeChild(currentText);

      const textIndex = branch.nodes.indexOf(currentText);
      if (textIndex !== -1) {
        branch.nodes.splice(textIndex, 1);
      }

      branch.shortCircuitText = undefined;
    }
  }

  function park(branch: IfBranch): void {
    const parent = branch.start.parentNode;

    // The branch is already parked or hasn't been inserted yet.
    if (!parent || parent === branch.fragment) {
      return;
    }

    // Walk the live range, not branch.nodes.
    // Nested $nodes may have inserted siblings after that array was created.
    let node: Node | null = branch.start;

    while (node) {
      const next: Node | null = node.nextSibling;

      markParked(node);

      branch.fragment.appendChild(node);

      if (node === branch.end) {
        break;
      }

      node = next;
    }
  }

  function activate(branch: IfBranch): void {
    const parent = marker.parentNode;

    if (!parent) {
      // The containing JSX hasn't inserted the marker yet.
      queueMicrotask(() => {
        if (activeBranch === branch) {
          activate(branch);
        }
      });

      return;
    }

    for (const node of [...branch.fragment.childNodes]) {
      unmarkParked(node);
    }

    parent.insertBefore(branch.fragment, marker);
  }

  let initialValue: unknown;

  try {
    initialValue = untrack(condition);
  } catch (error) {
    // Async conditions can suspend on their first read. Start with the false
    // branch and let the render effect retry when the resource settles.
    if (!(error instanceof NotReadyError)) {
      throw error;
    }

    initialValue = false;
  }

  const initialKey = !!initialValue;

  let activeKey = initialKey;
  // Don't detach claimed SSR nodes, but keep the original fragment behavior in CSR.
  let activeBranch = createBranch(initialKey, initialValue, true, !isHydrating());

  $renderEffect(() => {
    const nextValue = condition();
    const nextKey = !!nextValue;

    if (nextKey === activeKey) {
      if (!nextKey && !alternate) {
        updateShortCircuitValue(activeBranch, nextValue);
      }

      return;
    }

    // Resolve/create before modifying the active branch.
    // A thrown NotReadyError leaves the current branch untouched.
    const nextBranch = branches.get(nextKey) ?? createBranch(nextKey, nextValue);

    if (!nextKey && !alternate) {
      updateShortCircuitValue(nextBranch, nextValue);
    }

    park(activeBranch);

    activeKey = nextKey;
    activeBranch = nextBranch;

    activate(nextBranch);
  });

  return [...activeBranch.nodes, marker];
}
