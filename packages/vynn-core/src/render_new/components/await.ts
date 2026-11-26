import { getPendingPromise, isPendingInternal } from "../../reactivity/async/pending";
import type { JSX } from "../../types/jsx";
import { createRenderNewComponent } from "../component";
import type { DOMTemplateProgram } from "../dom/program";

export type RenderNewAwaitProps = {
  /** One async state, computed value, or store; an array waits for all entries. */
  when?: object | readonly object[];
  /** Content shown while any resource is pending. */
  fallback?: JSX.Element;
  children: JSX.Element;
};

const awaitTemplate = Object.freeze({
  namespace: "html" as const,
  markup:
    "<!--__vynn_render_new_child_0_start__-->" +
    "<!--__vynn_render_new_child_0_end__-->",
  references: Object.freeze([
    Object.freeze({
      id: 0,
      kind: "anchor" as const,
      path: Object.freeze([0]),
    }),
  ]),
});

function getResources(value: unknown): object[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(
    (entry): entry is object => entry !== null && typeof entry === "object",
  );
}

async function waitForResources(resources: readonly object[]): Promise<void> {
  while (true) {
    const pending = resources.filter(isPendingInternal);
    if (pending.length === 0) return;

    const promises = pending.map((resource) => {
      const promise = getPendingPromise(resource);
      if (!promise) {
        throw new Error(
          "[vynn render_new]: A pending Await resource did not expose its settlement promise.",
        );
      }
      return promise;
    });

    await Promise.all(promises);
  }
}

/**
 * Renderer-native async boundary for resources created with $state, $computed,
 * or $store. SSR waits for the supplied resources before rendering the
 * children; the browser renders the fallback and swaps in the children once
 * every resource settles.
 */
export function Await(props: RenderNewAwaitProps): JSX.Element {
  return createRenderNewComponent(
    () => {
      const program: DOMTemplateProgram = {
        template: awaitTemplate,
        bindings: [{
          kind: "child",
          reference: 0,
          read: () => {
            const pending = getResources(props.when).some(isPendingInternal);
            return pending ? props.fallback ?? null : props.children;
          },
        }],
      };
      return program;
    },
    props,
    Await,
    async () => {
      if (!import.meta.env.SSR) return false;
      await waitForResources(getResources(props.when));
      return false;
    },
  ) as unknown as JSX.Element;
}
