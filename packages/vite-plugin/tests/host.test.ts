import { describe, expect, it } from "vitest";

import type { ResolvedConfig } from "vite";

import {
  hasExternalViteDeployment,
  isRunnableViteEnvironment,
} from "../src/host.ts";

function makeConfig(overrides: Record<string, unknown> = {}): ResolvedConfig {
  return {
    plugins: [],
    environments: {
      client: {},
      ssr: { consumer: "server" },
    },
    ...overrides,
  } as unknown as ResolvedConfig;
}

describe("Vynn Vite deployment detection", () => {
  it("recognizes runnable environments structurally", () => {
    expect(isRunnableViteEnvironment(undefined)).toBe(false);
    expect(isRunnableViteEnvironment({})).toBe(false);
    expect(isRunnableViteEnvironment({ runner: {} })).toBe(true);
  });

  it("does not treat Vite's standard client and SSR environments as an external deployment", () => {
    expect(hasExternalViteDeployment(makeConfig())).toBe(false);
  });

  it("detects a deployment plugin that participates in build orchestration", () => {
    expect(
      hasExternalViteDeployment(
        makeConfig({
          plugins: [
            {
              name: "example-deployment",
              buildApp: { handler: async () => {} },
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("detects a provider-owned runtime environment without relying on its name", () => {
    expect(
      hasExternalViteDeployment(
        makeConfig({
          environments: {
            client: {},
            ssr: { consumer: "server" },
            worker: { consumer: "server" },
          },
        }),
      ),
    ).toBe(true);
  });

  it("detects a custom runtime factory on the standard SSR environment", () => {
    expect(
      hasExternalViteDeployment(
        makeConfig({
          environments: {
            client: {},
            ssr: {
              consumer: "server",
              dev: { createEnvironment: () => ({}) },
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
