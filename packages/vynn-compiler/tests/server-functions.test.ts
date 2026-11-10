import { describe, expect, it } from "vitest";

import { transformServerFunctions } from "../src/server-functions/index.ts";

describe("Vynn server-function compiler", () => {
  it("emits client references and stable function metadata", () => {
    const source = `export const loadUser = async (id: string) => {
      "use server";
      return await getUser(id);
    };`;

    const first = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });
    const second = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });

    expect(first?.code).toContain('from "vynn/server-functions/client"');
    expect(first?.code).toContain("__vynnCreateServerReference");
    expect(first?.code).not.toContain('"use server"');
    expect(first?.functions).toHaveLength(1);
    expect(first?.functions[0].id).toMatch(/^vynn_[a-f0-9]{20}$/);
    expect(first?.functions[0].id).toBe(second?.functions[0].id);
    expect(first?.functions[0].moduleId).toBe("/project/actions.ts");
  });

  it("extracts server implementations and registers them with the runtime", () => {
    const source = `export const loadUser = async (id: string) => {
      "use server";
      return await getUser(id);
    };`;

    const result = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "server",
    });

    expect(result?.code).toContain('from "vynn/server-functions/server"');
    expect(result?.code).toContain("__vynnCreateServerReference(");
    expect(result?.code).toContain("export async function __vynn_server_fn_");
    expect(result?.code).toContain("return await getUser(id)");
    expect(result?.code).not.toContain('"use server"');
  });

  it("captures values from the enclosing lexical scope", () => {
    const source = `export const makeAction = (tenantId: string) => async (userId: string) => {
      "use server";
      return \`\${tenantId}:\${userId}\`;
    };`;

    const client = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });
    const server = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "server",
    });

    expect(client?.code).toContain("() => [tenantId]");
    expect(server?.code).toMatch(/__vynn_captures_[a-f0-9]{20}, userId: string/);
    expect(server?.code).toMatch(
      /const __VYNN_CAPTURE_[a-f0-9]{20}_0 = __vynn_captures_[a-f0-9]{20}\[0\]/,
    );
    expect(server?.code).toMatch(/return `\$\{__VYNN_CAPTURE_[a-f0-9]{20}_0\}:\$\{userId\}`/);
  });

  it("rewrites captured identifiers in object shorthand properties", () => {
    const source = `export const makeAction = (tenantId: string) => () => {
      "use server";
      return { tenantId };
    };`;

    const server = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "server",
    });

    expect(server?.code).toMatch(/return \{ tenantId: __VYNN_CAPTURE_[a-f0-9]{20}_0 \}/);
  });

  it("rewrites captured values used in parameter default expressions", () => {
    const source = `export const makeAction = (tenantId: string) => (userId = tenantId) => {
      "use server";
      return userId;
    };`;

    const client = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });
    const server = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "server",
    });

    expect(client?.code).toContain("() => [tenantId]");
    expect(server?.code).toMatch(/userId = __vynn_captures_[a-f0-9]{20}\[0\]/);
  });

  it("captures lexical values through TypeScript expression wrappers", () => {
    const source = `export const makeAction = (tenantId: string) => () => {
      "use server";
      return (tenantId as string).toUpperCase();
    };`;

    const client = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });

    expect(client?.code).toContain("() => [tenantId]");
  });

  it("does not capture a local binding declared later in the function body", () => {
    const source = `export const makeAction = (tenantId: string) => () => {
      "use server";
      console.log(tenantId);
      const tenantId = "local";
    };`;

    const client = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });

    expect(client?.code).toContain("() => []");
  });

  it("does not serialize top-level lexical this for server arrows", () => {
    const source = `export const action = () => {
      "use server";
      return this;
    };`;

    const client = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "client",
    });
    const server = transformServerFunctions(source, "/project/actions.ts", {
      root: "/project",
      target: "server",
    });

    expect(client?.code).toContain("() => []");
    expect(server?.code).toContain("return this");
  });

  it("rejects super references in extracted server functions", () => {
    const source = `export class Actions {
      create() {
        return () => {
          "use server";
          return super.toString();
        };
      }
    }`;

    expect(() =>
      transformServerFunctions(source, "/project/actions.ts", {
        root: "/project",
        target: "server",
      }),
    ).toThrow(/'super' cannot be used inside an extracted server function/);
  });

  it("rejects dynamic this and arguments in regular server functions", () => {
    const thisSource = `export const action = function () {
      "use server";
      return this.value;
    };`;
    const argumentsSource = `export const action = function (value: string) {
      "use server";
      return arguments[0];
    };`;

    expect(() =>
      transformServerFunctions(thisSource, "/project/actions.ts", {
        root: "/project",
        target: "server",
      }),
    ).toThrow(/Dynamic 'this' inside a server function is not supported/);

    expect(() =>
      transformServerFunctions(argumentsSource, "/project/actions.ts", {
        root: "/project",
        target: "server",
      }),
    ).toThrow(/'arguments' inside a server function is not supported/);
  });

  it("rejects reassignment of captured bindings in destructuring patterns", () => {
    const source = `export const makeAction = (count: number) => (value: number) => {
      "use server";
      ({ count } = { count: value });
      return count;
    };`;

    expect(() =>
      transformServerFunctions(source, "/project/actions.ts", {
        root: "/project",
        target: "server",
      }),
    ).toThrow(/Captured variable 'count' cannot be reassigned/);
  });

  it("rejects reassigning a captured binding", () => {
    const source = `export const makeAction = (count: number) => () => {
      "use server";
      count += 1;
      return count;
    };`;

    expect(() =>
      transformServerFunctions(source, "/project/actions.ts", {
        root: "/project",
        target: "server",
      }),
    ).toThrow(/Captured variable 'count' cannot be reassigned/);
  });

  it("supports a build-tool supplied runtime module", () => {
    const result = transformServerFunctions(
      `export const action = () => {
        "use server";
        return true;
      };`,
      "/project/actions.ts",
      {
        root: "/project",
        target: "client",
        runtimeModule: "virtual:vynn/server-functions/client-runtime",
      },
    );

    expect(result?.code).toContain('from "virtual:vynn/server-functions/client-runtime"');
  });

  it("ignores modules without a server directive", () => {
    expect(
      transformServerFunctions("export const value = 1;", "/project/value.ts", {
        root: "/project",
        target: "client",
      }),
    ).toBeNull();
  });

  it("rejects file-level server directives with a useful error", () => {
    expect(() =>
      transformServerFunctions(
        `"use server";
        export function load() { return true; }`,
        "/project/actions.ts",
        { root: "/project", target: "server" },
      ),
    ).toThrow(/File-level "use server" is not supported yet/);
  });

  it("rejects nested server-function boundaries", () => {
    expect(() =>
      transformServerFunctions(
        `export const outer = () => {
          "use server";
          return () => {
            "use server";
            return true;
          };
        };`,
        "/project/actions.ts",
        { root: "/project", target: "server" },
      ),
    ).toThrow(/Nested server boundaries are not supported yet/);
  });

  it("rejects generator server functions", () => {
    expect(() =>
      transformServerFunctions(
        `export function* values() {
          "use server";
          yield 1;
        }`,
        "/project/actions.ts",
        { root: "/project", target: "server" },
      ),
    ).toThrow(/Generator functions are not supported/);
  });

  it("rejects server functions outside the configured project root", () => {
    expect(() =>
      transformServerFunctions(
        `export const action = () => {
          "use server";
          return true;
        };`,
        "/other/actions.ts",
        { root: "/project", target: "server" },
      ),
    ).toThrow(/must be declared inside the project root/);
  });
});
