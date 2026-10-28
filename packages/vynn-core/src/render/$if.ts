import type { JSX } from "../jsx-runtime";
import { isServer } from "../context/is-server-context";
import { $renderEffect } from "../reactivity/$effect";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import { isRootNode, markParked, unmarkParked } from "./$cmpnt.util";
import { untrack } from "../reactivity/untrack";

type IfBranch = {
  start: Comment;
  end: Comment;
  fragment: DocumentFragment;
  nodes: Node[];
  shortCircuitText?: Text;
};

export function $if(
  condition: () => unknown,
  consequent: () => JSX.Element,
  alternate?: () => JSX.Element,
): JSX.Element {
  if (isServer()) {
    return resolveSSRChild(() => {
      const value = condition();

      if (value) return consequent();
      if (alternate) return alternate();

      // An omitted alternate represents the short-circuit result of &&.
      // Boolean results render no content, while falsy values such as 0
      // remain visible as ordinary JSX children.
      return (typeof value === "boolean" ? undefined : value) as JSX.Element;
    }) as unknown as JSX.Element;
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
          ? (resolveNode(
              () => renderShortCircuitValue(value),
            )[0] as Text)
          : document.createTextNode(renderShortCircuitValue(value))
        : undefined;

    const content = key
      ? resolveNode(consequent)
      : alternate
        ? resolveNode(alternate)
        : shortCircuitText
          ? [shortCircuitText]
          : [];

    const nodes = [start, ...content, end];
    const fragment = document.createDocumentFragment();

    fragment.append(...nodes);

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

  function updateShortCircuitValue(
    branch: IfBranch,
    value: unknown,
  ): void {
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

      if (isRootNode(node)) {
        markParked(node);
      }

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
      if (isRootNode(node)) {
        unmarkParked(node);
      }
    }

    parent.insertBefore(branch.fragment, marker);
  }

  const initialValue = untrack(condition);
  const initialKey = !!initialValue;

  let activeKey = initialKey;
  let activeBranch = createBranch(initialKey, initialValue, true);

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
    const nextBranch =
      branches.get(nextKey) ?? createBranch(nextKey, nextValue);

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
