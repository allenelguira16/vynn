import { batch } from "../reactivity/effect";
import { createStateValue, type State } from "../reactivity/state";
import type { DOMTemplateProgram } from "./dom/program";

const renderNewComponentBrand: unique symbol = Symbol("vynn.render_new.component");

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
  /** Stable list identity supplied by the JSX key attribute. */
  readonly key?: string | number | bigint;
}

interface RenderNewComponentInternals {
  readonly props: Map<PropertyKey, State<unknown>>;
  readonly componentType: Function | undefined;
  readonly canUpdateProps: boolean;
}

const componentInternals = new WeakMap<RenderNewComponent, RenderNewComponentInternals>();

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

/**
 * Creates the internal deferred component descriptor emitted by the compiler.
 *
 * Compiler-generated components pass their props object and function identity.
 * The props object is instrumented in place with state-backed accessors. That
 * lets keyed reconciliation update the existing component's props without
 * rerunning its body or replacing its component scope.
 *
 * Passing null means the component uses a parameter shape that cannot currently
 * be updated safely (for example destructured parameters), so keyed updates
 * remount that item rather than leave stale values behind.
 */
export function createRenderNewComponent(
  render: () => RenderNewComponentResult,
  props?: object | null,
  componentType?: Function,
): RenderNewComponent {
  if (typeof render !== "function") {
    throw new TypeError("[vynn render_new]: A component descriptor requires a render function.");
  }

  const propValues = new Map<PropertyKey, State<unknown>>();
  let canUpdateProps = props !== null;

  if (props && typeof props === "object") {
    const keys = Reflect.ownKeys(props);
    const descriptors = keys.map((key) => ({
      key,
      descriptor: Object.getOwnPropertyDescriptor(props, key),
    }));

    if (descriptors.some(({ descriptor }) => !descriptor || descriptor.configurable !== true)) {
      canUpdateProps = false;
    } else {
      try {
        for (const { key, descriptor } of descriptors) {
          const value = Reflect.get(props, key);
          const state = createStateValue<unknown>(value);
          Object.defineProperty(props, key, {
            configurable: true,
            enumerable: descriptor!.enumerable,
            get() {
              return state.value;
            },
            set(next: unknown) {
              state.value = next;
            },
          });
          propValues.set(key, state);
        }
      } catch {
        canUpdateProps = false;
      }
    }
  }

  const component: RenderNewComponent = {
    [renderNewComponentBrand]: true,
    render,
  };

  componentInternals.set(component, {
    props: propValues,
    componentType,
    canUpdateProps,
  });

  return component;
}

/** Adds list identity to a compiler-created component descriptor. */
export function withRenderNewComponentKey(
  component: RenderNewComponent,
  key: string | number | bigint,
): RenderNewComponent {
  if (!isRenderNewComponent(component)) {
    throw new TypeError("[vynn render_new]: A component key can only be applied to a component descriptor.");
  }

  if (
    typeof key !== "string" &&
    typeof key !== "number" &&
    typeof key !== "bigint"
  ) {
    throw new TypeError(
      "[vynn render_new]: Keyed components require string, number, or bigint keys.",
    );
  }

  const keyed: RenderNewComponent = {
    [renderNewComponentBrand]: true,
    render: component.render,
    key,
  };

  const internals = componentInternals.get(component);
  if (internals) componentInternals.set(keyed, internals);
  return keyed;
}

/**
 * Updates the existing component's reactive props from a freshly-created
 * descriptor. Returns false when the descriptors cannot safely share a
 * component instance, in which case the caller must remount the item.
 */
export function updateRenderNewComponentProps(
  current: RenderNewComponent,
  next: RenderNewComponent,
): boolean {
  if (
    !isRenderNewComponent(current) ||
    !isRenderNewComponent(next) ||
    !(current.key === next.key || Object.is(current.key, next.key))
  ) {
    return false;
  }

  const currentState = componentInternals.get(current);
  const nextState = componentInternals.get(next);

  if (
    !currentState ||
    !nextState ||
    !currentState.canUpdateProps ||
    !nextState.canUpdateProps ||
    !currentState.componentType ||
    currentState.componentType !== nextState.componentType ||
    currentState.props.size !== nextState.props.size
  ) {
    return false;
  }

  const updates: Array<{ target: State<unknown>; value: unknown }> = [];

  for (const [key, target] of currentState.props) {
    const source = nextState.props.get(key);
    if (!source) return false;
    updates.push({ target, value: source.value });
  }

  batch(() => {
    for (const update of updates) {
      update.target.value = update.value;
    }
  });

  return true;
}

/** Checks whether a dynamic render value is a deferred render_new component. */
export function isRenderNewComponent(value: unknown): value is RenderNewComponent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RenderNewComponent>;
  return candidate[renderNewComponentBrand] === true &&
    typeof candidate.render === "function";
}
