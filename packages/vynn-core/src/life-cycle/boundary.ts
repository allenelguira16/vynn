import {
  createOwner,
  disposeOwner,
  getOwner,
  getOwnerBoundaryHandler,
  runWithOwner,
  setOwnerBoundaryHandler,
  type Owner,
  type OwnerBoundaryHandlers,
} from "./owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";

export type BoundaryBranch = "children" | "fallback";

export interface BoundaryOptions extends OwnerBoundaryHandlers {
  /**
   * Keep both branches alive while inactive. Useful for Await, whose children
   * remain mounted behind the fallback. Error boundaries dispose the inactive
   * branch so retry starts a fresh child subtree.
   */
  retainBranches?: boolean;
}

export interface BoundaryController {
  readonly owner: Owner;
  readonly parent: Owner | null;
  renderBranch<T>(branch: BoundaryBranch, render: () => T): T;
  setErrorHandler(handler: ((error: Error) => void) | undefined): void;
  setPendingHandler(handler: ((promise: Promise<unknown>) => void) | undefined): void;
  handleError(error: unknown, from: BoundaryBranch): boolean;
}

/**
 * Creates the runtime owner for a boundary and manages the ownership of its
 * children and fallback branches.
 *
 * The boundary owner carries its error/pending policies. Descendant effects
 * and resources discover those policies by walking their owner ancestry.
 * The fallback is deliberately owned beside the boundary, so errors and
 * pending work created by fallback content belong to the parent boundary.
 */
export function createBoundary(options: BoundaryOptions = {}): BoundaryController {
  const parent = getOwner();
  const owner = createOwner(parent);
  const retainBranches = options.retainBranches ?? false;

  owner.boundary = {
    onError: options.onError,
    onPending: options.onPending,
  };

  let activeBranch: BoundaryBranch | undefined;
  let activeOwner: Owner | undefined;
  const retainedOwners = new Map<BoundaryBranch, Owner>();

  function createBranchOwner(branch: BoundaryBranch): Owner {
    return createOwner(branch === "children" ? owner : parent);
  }

  function branchOwner(branch: BoundaryBranch): Owner {
    if (retainBranches) {
      const retained = retainedOwners.get(branch);
      if (retained) return retained;

      const created = createBranchOwner(branch);
      retainedOwners.set(branch, created);
      return created;
    }

    if (activeBranch !== branch) {
      if (activeOwner) disposeOwner(activeOwner);

      activeBranch = branch;
      activeOwner = createBranchOwner(branch);
    }

    return activeOwner!;
  }

  function handleError(error: unknown, from: BoundaryBranch): boolean {
    if (error instanceof NotReadyError) return false;
    if (!(error instanceof Error)) return false;

    const targetOwner = from === "children" ? owner : parent;
    const handler = getOwnerBoundaryHandler("onError", targetOwner);
    if (!handler) return false;

    handler(error);
    return true;
  }

  const controller: BoundaryController = {
    owner,
    parent,

    renderBranch<T>(branch, render): T {
      const current = branchOwner(branch);

      return runWithOwner(current, () => {
        try {
          return render();
        } catch (error) {
          if (!handleError(error, branch)) throw error;
          return [] as unknown as T;
        }
      });
    },

    setErrorHandler(handler) {
      setOwnerBoundaryHandler("onError", handler, owner);
    },

    setPendingHandler(handler) {
      setOwnerBoundaryHandler("onPending", handler, owner);
    },

    handleError,
  };

  // A fallback branch is a sibling of the boundary owner. Dispose it when
  // the boundary owner is torn down; content branches are already its children.
  owner.cleanups.push(() => {
    for (const branch of retainedOwners.values()) {
      if (!branch.disposed) disposeOwner(branch);
    }
    retainedOwners.clear();

    if (activeOwner && !activeOwner.disposed) disposeOwner(activeOwner);
    activeOwner = undefined;
    activeBranch = undefined;
  });

  return controller;
}
