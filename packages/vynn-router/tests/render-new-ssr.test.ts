// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createScope,
  disposeScope,
  renderTemplateProgramToStringAsync,
  runWithScope,
  type RenderNewComponent,
} from "vynn/render_new";

import {
  createMemoryHistory,
  createRouter,
  redirect,
  Router,
  type Route,
} from "../src/render-new";

const privatePage = (() => null) as Route["component"];

describe("render_new router SSR", () => {
  it("returns a server redirect Response from an async route guard", async () => {
    const scope = createScope(null);
    const router = runWithScope(
      scope,
      () => createRouter({
        routes: [{
          path: "/private",
          component: privatePage,
          beforeLoad: async () => {
            await Promise.resolve();
            redirect("/login");
          },
        }],
        history: createMemoryHistory({ initialEntries: ["/private"] }),
      }),
    );
    const app = runWithScope(
      scope,
      () => Router({ router }) as unknown as RenderNewComponent,
    );

    let thrown: unknown;
    try {
      await renderTemplateProgramToStringAsync(app);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("location")).toBe("/login");

    router.dispose();
    disposeScope(scope);
  });
});
