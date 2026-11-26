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

const privatePage: Route["component"] = () => ({
  template: {
    namespace: "html",
    markup: "<main>Private content</main>",
    references: [],
  },
  bindings: [],
}) as never;

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

    await expect(renderTemplateProgramToStringAsync(app)).rejects.toMatchObject({
      status: 302,
    });
    await expect(renderTemplateProgramToStringAsync(app)).rejects.toBeDefined();

    router.dispose();
    disposeScope(scope);
  });
});
