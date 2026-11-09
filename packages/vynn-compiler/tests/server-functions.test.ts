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

    expect(result?.code).toContain(
      'from "virtual:vynn/server-functions/client-runtime"',
    );
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
