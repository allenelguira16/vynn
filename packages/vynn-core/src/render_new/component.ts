import type { DOMTemplateProgram } from "./dom/program";

const renderNewComponentBrand = Symbol.for("vynn.render_new.component");

/**
 * A deferred component invocation.
 *
 * The component body is executed only after the renderer has established its
 * owning RenderScope. This lets $state, $effect, context, and cleanup APIs
 * created by the component participate in the component lifetime.
 */
export type RenderNewComponentResult =
  | DOMTemplateProgram
  | null
  | undefined
  | boolean;

export interface RenderNewComponent {
  readonly [renderNewComponentBrand]: true;
  readonly render: () => RenderNewComponentResult;
}

const EMPTY_RENDER_NEW_PROGRAM: DOMTemplateProgram = Object.freeze({
  template: Object.freeze({
    namespace: "html" as const,
    markup: "",
    references: Object.freeze([]),
  }),
  bindings: Object.freeze([]),
});

/**
 * Resolves a component's root result. Nullish and boolean results represent
 * an intentionally empty render branch; other non-program values are rejected.
 */
export function resolveRenderNewComponentProgram(value: unknown): DOMTemplateProgram {
  if (value === null || value === undefined || typeof value === "boolean") {
    return EMPTY_RENDER_NEW_PROGRAM;
  }

  if (
    typeof value === "object" &&
    "template" in value &&
    "bindings" in value &&
    !!(value as DOMTemplateProgram).template &&
    Array.isArray((value as DOMTemplateProgram).bindings)
  ) {
    return value as DOMTemplateProgram;
  }

  throw new TypeError(
    "[vynn render_new]: A component render callback must return a template program, null, or a boolean.",
  );
}

/** Creates the internal deferred component descriptor emitted by the compiler. */
export function createRenderNewComponent(
  render: () => RenderNewComponentResult,
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
