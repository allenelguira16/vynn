import { describe, expect, it } from "vitest";

import {
  commitOwnerIdentityTransaction,
  createOwner,
  createOwnerIdentityTransaction,
  disposeOwner,
  getOwnerIdentityPath,
  hasOwnerIdentityTransaction,
  rollbackOwnerIdentityTransaction,
} from "../src/life-cycle/owner";

describe("numeric owner identity paths", () => {
  it("allocates numeric child indexes and derives nested paths", () => {
    const root = createOwner(null);

    try {
      const children = Array.from({ length: 12 }, () => createOwner(root));
      const nested = createOwner(children[10]!);

      expect(root.identityIndex).toBe(0);
      expect(children.map((owner) => owner.identityIndex)).toEqual(
        Array.from({ length: 12 }, (_, index) => index),
      );
      expect(nested.identityIndex).toBe(0);
      expect(getOwnerIdentityPath(nested)).toEqual([0, 10, 0]);
      expect(new Set(children.map((owner) => owner.identityIndex)).size).toBe(children.length);
    } finally {
      disposeOwner(root);
    }
  });

  it("commits a tentative numeric index only when requested", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);

      expect(staged.identityIndex).toBeUndefined();
      expect(getOwnerIdentityPath(staged)).toEqual([0, 0]);
      expect(root.nodeCount).toBe(0);
      expect(hasOwnerIdentityTransaction(staged)).toBe(true);

      expect(commitOwnerIdentityTransaction(staged)).toBe(0);
      expect(staged.identityIndex).toBe(0);
      expect(getOwnerIdentityPath(staged)).toEqual([0, 0]);
      expect(root.nodeCount).toBe(1);
      expect(hasOwnerIdentityTransaction(staged)).toBe(false);
      expect(createOwner(root).identityIndex).toBe(1);
    } finally {
      disposeOwner(root);
    }
  });

  it("rolls back an unused candidate without consuming the parent index", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);

      expect(staged.identityIndex).toBeUndefined();
      expect(getOwnerIdentityPath(staged)).toEqual([0, 0]);

      rollbackOwnerIdentityTransaction(staged);

      expect(staged.identityIndex).toBeUndefined();
      expect(staged.identityOwner).toBe(root);
      expect(root.nodeCount).toBe(0);
      expect(hasOwnerIdentityTransaction(staged)).toBe(false);

      disposeOwner(staged);

      expect(createOwner(root).identityIndex).toBe(0);
    } finally {
      disposeOwner(root);
    }
  });

  it("preserves descendant paths when the parent transaction commits", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);
      const child = createOwner(staged);

      expect(staged.identityIndex).toBeUndefined();
      expect(getOwnerIdentityPath(staged)).toEqual([0, 0]);
      expect(child.identityIndex).toBe(0);
      expect(getOwnerIdentityPath(child)).toEqual([0, 0, 0]);
      expect(root.nodeCount).toBe(0);
      expect(staged.nodeCount).toBe(1);

      commitOwnerIdentityTransaction(staged);

      expect(staged.identityIndex).toBe(0);
      expect(root.nodeCount).toBe(1);
      expect(getOwnerIdentityPath(child)).toEqual([0, 0, 0]);
      expect(createOwner(root).identityIndex).toBe(1);
    } finally {
      disposeOwner(root);
    }
  });
});
