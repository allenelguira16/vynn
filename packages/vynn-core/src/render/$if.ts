import type { JSX } from "../jsx-runtime";
import { isServer } from "../context/is-server-context";
import { $renderEffect } from "../reactivity/$effect";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import { isRootNode, markParked, unmarkParked } from "./$cmpnt.util";

type IfBranch = {
  start: Comment;
  end: Comment;
  fragment: DocumentFragment;
  nodes: Node[];
};

export function $if(
  condition: () => unknown,
  consequent: () => JSX.Element,
  alternate: () => JSX.Element = () => undefined,
): JSX.Element {
  if (isServer()) {
    return resolveSSRChild(() =>
      condition() ? consequent() : alternate(),
    ) as unknown as JSX.Element;
  }

  const marker = document.createTextNode("");
  const branches = new Map<boolean, IfBranch>();

  function createBranch(key: boolean): IfBranch {
    const start = document.createTextNode("");
    const end = document.createTextNode("");

    const content = resolveNode(key ? consequent : alternate);
    const nodes = [start, ...content, end];
    const fragment = document.createDocumentFragment();

    fragment.append(...nodes);

    const branch = { start, end, fragment, nodes };

    branches.set(key, branch);

    return branch;
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

  const initialKey = !!condition();

  let activeKey = initialKey;
  let activeBranch = createBranch(initialKey);

  $renderEffect(() => {
    const nextKey = !!condition();

    if (nextKey === activeKey) {
      return;
    }

    // Resolve/create before modifying the active branch.
    // A thrown NotReadyError leaves the current branch untouched.
    const nextBranch = branches.get(nextKey) ?? createBranch(nextKey);

    park(activeBranch);

    activeKey = nextKey;
    activeBranch = nextBranch;

    activate(nextBranch);
  });

  return [...activeBranch.nodes, marker];
}
