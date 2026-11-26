import type { TemplateInstance } from "../template/types";
import { bindAttribute, type AttributeName } from "./attribute";
import { bindChild } from "./child";
import type { DOMTemplateAdapter } from "../dom/adapter";
import { bindEvent, type EventHandlerValue } from "./event";
import { bindProperty } from "./property";
import { bindText } from "./text";
import { createStateValue } from "../../reactivity/state";
import { batch } from "../../reactivity/effect";
import type { Accessor, Disposable, RenderScope } from "../types";

/** A text-node instruction emitted by the render_new compiler target. */
export interface TextBindingInstruction {
  readonly kind: "text";
  readonly reference: number;
  readonly read: Accessor<unknown>;
}

/** An element-attribute instruction emitted by the render_new compiler target. */
export interface AttributeBindingInstruction {
  readonly kind: "attribute";
  readonly reference: number;
  readonly name: AttributeName;
  readonly read: Accessor<unknown>;
}

/** A DOM-property instruction emitted by the render_new compiler target. */
export interface PropertyBindingInstruction {
  readonly kind: "property";
  readonly reference: number;
  readonly name: string;
  readonly read: Accessor<unknown>;
}

/** An event-listener instruction emitted by the render_new compiler target. */
export interface EventBindingInstruction {
  readonly kind: "event";
  readonly reference: number;
  readonly event: string;
  readonly read: Accessor<EventHandlerValue>;
  readonly options?: boolean | AddEventListenerOptions;
}

/** A dynamic child insertion instruction targeting a comment anchor. */
export interface ChildBindingInstruction {
  readonly kind: "child";
  readonly reference: number;
  readonly read: Accessor<unknown>;
}

/** The complete set of reactive operations that can be attached to a template. */
export type TemplateBindingInstruction =
  | TextBindingInstruction
  | AttributeBindingInstruction
  | PropertyBindingInstruction
  | EventBindingInstruction
  | ChildBindingInstruction;

/** A set of binding instructions applied to one template instance. */
export interface TemplateBindingOptions {
  /** Adopt compatible dynamic content already present in server-rendered markup. */
  readonly hydrate?: boolean;
}

export interface TemplateBindingSet extends Disposable {
  readonly size: number;
  /** Replace accessors while retaining compatible DOM nodes and effects. */
  update(instructions: readonly TemplateBindingInstruction[]): void;
}

interface PreparedInstruction {
  readonly instruction: TemplateBindingInstruction;
  readonly target: Node;
}

function assertInstructionList(
  instructions: readonly TemplateBindingInstruction[],
): void {
  if (!Array.isArray(instructions)) {
    throw new TypeError("[vynn]: Template bindings must be an instruction array.");
  }
}

function assertReferenceID(reference: number): void {
  if (!Number.isSafeInteger(reference) || reference < 0) {
    throw new TypeError(
      "[vynn]: A template binding reference must be a non-negative safe integer.",
    );
  }
}

function assertAccessor(read: unknown): asserts read is Accessor<unknown> {
  if (typeof read !== "function") {
    throw new TypeError("[vynn]: A template binding must provide a value accessor.");
  }
}

function assertElementTarget(node: Node, kind: string): asserts node is Element {
  if (!node || typeof node !== "object" || node.nodeType !== 1) {
    throw new TypeError(
      "[vynn]: A " + kind + " binding must target an element reference.",
    );
  }
}

function prepareInstructions(
  instance: TemplateInstance<Node>,
  instructions: readonly TemplateBindingInstruction[],
): readonly PreparedInstruction[] {
  if (
    !instance ||
    typeof instance !== "object" ||
    !instance.references ||
    typeof instance.references.get !== "function"
  ) {
    throw new TypeError("[vynn]: Applying template bindings expects a template instance.");
  }

  assertInstructionList(instructions);

  const prepared: PreparedInstruction[] = [];

  for (const instruction of instructions) {
    if (!instruction || typeof instruction !== "object") {
      throw new TypeError("[vynn]: A template binding instruction must be an object.");
    }

    assertReferenceID(instruction.reference);
    assertAccessor(instruction.read);

    const target = instance.references.get(instruction.reference);

    if (!target) {
      throw new Error(
        "[vynn]: Template binding references missing node " +
          instruction.reference +
          ".",
      );
    }

    switch (instruction.kind) {
      case "text":
        if (target.nodeType !== 3) {
          throw new TypeError(
            "[vynn]: A text binding must target a text reference.",
          );
        }
        break;

      case "attribute":
        assertElementTarget(target, "attribute");
        break;

      case "property":
        assertElementTarget(target, "property");
        if (
          typeof instruction.name !== "string" ||
          instruction.name.length === 0 ||
          instruction.name.trim() !== instruction.name
        ) {
          throw new TypeError(
            "[vynn]: A property binding instruction requires a non-empty property name.",
          );
        }
        break;

      case "child":
        if (target.nodeType !== 8) {
          throw new TypeError("[vynn]: A child binding must target a comment anchor reference.");
        }
        break;

      case "event":
        if (
          typeof target.addEventListener !== "function" ||
          typeof target.removeEventListener !== "function"
        ) {
          throw new TypeError(
            "[vynn]: An event binding must target an EventTarget reference.",
          );
        }
        if (
          typeof instruction.event !== "string" ||
          instruction.event.length === 0 ||
          instruction.event.trim() !== instruction.event
        ) {
          throw new TypeError(
            "[vynn]: An event binding instruction requires a non-empty event type.",
          );
        }
        break;

      default:
        throw new TypeError("[vynn]: A template binding has an unsupported instruction kind.");
    }

    prepared.push({ instruction, target });
  }

  return prepared;
}

function sameAttributeName(left: AttributeName, right: AttributeName): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  return left.namespaceURI === right.namespaceURI &&
    left.qualifiedName === right.qualifiedName &&
    left.localName === right.localName;
}

function sameInstructionShape(
  left: TemplateBindingInstruction,
  right: TemplateBindingInstruction,
): boolean {
  if (left.kind !== right.kind || left.reference !== right.reference) return false;

  switch (left.kind) {
    case "text":
    case "child":
      return true;
    case "attribute":
      return right.kind === "attribute" && sameAttributeName(left.name, right.name);
    case "property":
      return right.kind === "property" && left.name === right.name;
    case "event":
      return right.kind === "event" &&
        left.event === right.event &&
        left.options === right.options;
  }

  return false;
}

function disposeBindings(bindings: readonly Disposable[]): void {
  const errors: unknown[] = [];

  for (const binding of [...bindings].reverse()) {
    try {
      binding.dispose();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "[vynn]: Multiple template bindings failed to dispose.");
  }
}

/**
 * Applies compiler-emitted binding instructions to a cloned template instance.
 *
 * All reference IDs, target kinds, and accessor shapes are validated before
 * the first reactive effect is installed. If an instruction fails while being
 * applied, earlier bindings are disposed in reverse order before the error is
 * rethrown. Each binding is also independently owned by the supplied scope.
 *
 * Binding accessors are retained as functions so their dependencies remain
 * reactive; the instruction objects and reference table are metadata, not a
 * second JSX representation.
 */
export function applyTemplateBindings(
  scope: RenderScope,
  instance: TemplateInstance<Node>,
  instructions: readonly TemplateBindingInstruction[],
  adapter?: DOMTemplateAdapter,
  options: TemplateBindingOptions = {},
): TemplateBindingSet {
  const prepared = prepareInstructions(instance, instructions);
  const bindings: Disposable[] = [];
  const readers = prepared.map(({ instruction }) =>
    createStateValue<Accessor<unknown>>(instruction.read as Accessor<unknown>),
  );

  try {
    for (let index = 0; index < prepared.length; index++) {
      const { instruction, target } = prepared[index]!;
      const read = () => readers[index]!.value();

      switch (instruction.kind) {
        case "text":
          bindings.push(bindText(scope, target as Text, read));
          break;

        case "attribute":
          bindings.push(
            bindAttribute(
              scope,
              target as Element,
              instruction.name,
              read,
            ),
          );
          break;

        case "property":
          bindings.push(
            bindProperty(
              scope,
              target as Element,
              instruction.name,
              read,
            ),
          );
          break;

        case "child":
          if (!adapter) {
            throw new TypeError("[vynn]: A dynamic child binding requires a DOM template adapter.");
          }
          bindings.push(bindChild(scope, target as Comment, adapter, read, options));
          break;

        case "event":
          bindings.push(
            bindEvent(
              scope,
              target,
              instruction.event,
              read,
              instruction.options,
            ),
          );
          break;
      }
    }
  } catch (error) {
    try {
      disposeBindings(bindings);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[vynn]: Applying template bindings failed and earlier bindings could not all be disposed.",
      );
    }

    throw error;
  }

  let disposed = false;

  return Object.freeze({
    size: bindings.length,
    update(nextInstructions: readonly TemplateBindingInstruction[]) {
      if (disposed) {
        throw new Error("[vynn]: Cannot update a disposed template binding set.");
      }

      const next = prepareInstructions(instance, nextInstructions);
      if (next.length !== prepared.length) {
        throw new TypeError("[vynn]: Updating a template requires the same binding instruction count.");
      }

      for (let index = 0; index < prepared.length; index++) {
        if (!sameInstructionShape(prepared[index]!.instruction, next[index]!.instruction)) {
          throw new TypeError("[vynn]: Updating a template requires compatible binding instruction metadata.");
        }
      }

      batch(() => {
        for (let index = 0; index < next.length; index++) {
          readers[index]!.value = next[index]!.instruction.read as Accessor<unknown>;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeBindings(bindings);
    },
  });
}
