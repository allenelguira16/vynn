import { describe, expect, it } from "vitest";

import {
  commitOwnerIdentityTransaction,
  createOwner,
  createOwnerIdentityTransaction,
  disposeOwner,
  getOwnerIdentityID,
  hasOwnerIdentityTransaction,
  rollbackOwnerIdentityTransaction,
} from "../src/life-cycle/owner";

describe("owner identity allocation transactions", () => {
  it("commits the candidate ID only when the transaction is committed", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);

      expect(staged.id).toBeUndefined();
      expect(getOwnerIdentityID(staged)).toBe("00");
      expect(root.nodeCount).toBe(0);
      expect(hasOwnerIdentityTransaction(staged)).toBe(true);

      expect(commitOwnerIdentityTransaction(staged)).toBe("00");
      expect(staged.id).toBe("00");

      expect(root.nodeCount).toBe(1);
      expect(hasOwnerIdentityTransaction(staged)).toBe(false);
      expect(createOwner(root).id).toBe("01");
    } finally {
      disposeOwner(root);
    }
  });

  it("rolls back an unused candidate without consuming the parent slot", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);

      expect(staged.id).toBeUndefined();
      expect(getOwnerIdentityID(staged)).toBe("00");

      rollbackOwnerIdentityTransaction(staged);

      expect(getOwnerIdentityID(staged)).toBeUndefined();
      expect(staged.identityOwner).toBe(root);
      expect(root.nodeCount).toBe(0);
      expect(hasOwnerIdentityTransaction(staged)).toBe(false);

      disposeOwner(staged);

      expect(createOwner(root).id).toBe("00");
    } finally {
      disposeOwner(root);
    }
  });

  it("preserves descendant identities when the parent transaction commits", () => {
    const root = createOwner(null);

    try {
      const staged = createOwnerIdentityTransaction(root);
      const child = createOwner(staged);

      expect(staged.id).toBeUndefined();
      expect(getOwnerIdentityID(staged)).toBe("00");
      expect(child.id).toBe("000");
      expect(root.nodeCount).toBe(0);
      expect(staged.nodeCount).toBe(1);

      commitOwnerIdentityTransaction(staged);

      expect(staged.id).toBe("00");
      expect(root.nodeCount).toBe(1);
      expect(child.id).toBe("000");
      expect(createOwner(root).id).toBe("01");
    } finally {
      disposeOwner(root);
    }
  });
});
