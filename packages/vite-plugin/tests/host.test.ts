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
      // Vite 8 resolves a default environment factory for the built-in SSR
      // environment even when the project has not installed a runtime provider.
      ssr: {
        consumer: "server",
        dev: { createEnvironment: () => ({}) },
      },
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

  it("does not treat Vite's built-in client and SSR environments as an external deployment", () => {
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
            ssr: {
              consumer: "server",
              dev: { createEnvironment: () => ({}) },
            },
            worker: { consumer: "server" },
          },
        }),
      ),
    ).toBe(true);
  });

  it("does not mistake Vite's default SSR environment factory for an external runtime", () => {
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
    ).toBe(false);
  });

  it("detects a custom runtime factory on an additional server environment", () => {
    expect(
      hasExternalViteDeployment(
        makeConfig({
          environments: {
            client: {},
            ssr: {
              consumer: "server",
              dev: { createEnvironment: () => ({}) },
            },
            worker: {
              consumer: "server",
              dev: { createEnvironment: () => ({}) },
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
