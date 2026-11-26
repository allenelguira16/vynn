import type { DOMTemplateProgram } from "./dom/program";

const renderNewComponentBrand = Symbol.for("vynn.render_new.component");

/**
 * A deferred component invocation.
 *
 * The component body is executed only after the renderer has established its
 * owning RenderScope. This lets $state, $effect, context, and cleanup APIs
 * created by the component participate in the component lifetime.
 */
export interface RenderNewComponent {
  readonly [renderNewComponentBrand]: true;
  readonly render: () => DOMTemplateProgram;
}

/** Creates the internal deferred component descriptor emitted by the compiler. */
export function createRenderNewComponent(
  render: () => DOMTemplateProgram,
): RenderNewComponent {
  if (typeof render !== "function") {
    throw new TypeError("[vynn render_new]: A component descriptor requires a render function.");
  }

  return Object.freeze({
    [renderNewComponentBrand]: true as const,
    render,
  });
}

/** Checks whether a dynamic render value is a deferred render_new component. */
export function isRenderNewComponent(value: unknown): value is RenderNewComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RenderNewComponent>;
  return candidate[renderNewComponentBrand] === true &&
    typeof candidate.render === "function";
}
