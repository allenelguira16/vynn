import { describe, expect, it } from "vitest";

import { transformVynnOxc } from "../src/index.ts";

describe("JSX keyed list reconciliation", () => {
  it("extracts the root key and makes the row item reactive", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map((user, index) => (
          <UserCard
            key={user.id}
            name={user.name}
            position={index}
          />
        ));
      }`,
      "keyed-component-list.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).toContain("index.value");
    expect(code).not.toContain("get key()");
  });

  it("does not serialize a host row key as a DOM attribute", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map(user => (
          <li key={user.id} class="user-row">{user.name}</li>
        ));
      }`,
      "keyed-host-list.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).not.toContain("key=");
    expect(code).not.toContain('"key"');
  });

  it("does not emit a key as a host attribute outside a list", () => {
    const code = transformVynnOxc(
      `const view = () => <li key="metadata">Page</li>;`,
      "standalone-host-key.tsx",
    );

    expect(code).not.toContain('"key"');
    expect(code).not.toContain("key=");
  });

  it("supports local named callbacks without changing the original callback", () => {
    const code = transformVynnOxc(
      `function renderUser(user, index) {
        return <UserCard key={user.id} name={user.name} position={index} />;
      }

      function Page() {
        return users.map(renderUser);
      }`,
      "keyed-named-callback.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).toContain("index.value");
  });

  it("rejects keys on conditional roots instead of guessing row identity", () => {
    expect(() =>
      transformVynnOxc(
        `function Page() {
          return users.map(user =>
            user.active
              ? <ActiveUser key={user.id} />
              : <InactiveUser key={user.id} />
          );
        }`,
        "keyed-conditional-root.tsx",
      ),
    ).toThrow("single JSX element directly returned");
  });

  it("keeps reference identity when no root key is provided", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map(user => <UserCard name={user.name} />);
      }`,
      "unkeyed-list.tsx",
    );

    expect(code).not.toContain("user.value.name");
    expect(code).not.toContain("user => user.id");
  });
});
