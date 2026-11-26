import { $renderEffect } from "../../reactivity/effect";
import { runWithScope, onScopeDispose } from "../lifecycle/scope";
import type { Accessor, Disposable, RenderScope } from "../types";
import type { DOMTemplateAdapter } from "../dom/adapter";
import { consumePreparedRenderNewChildValue } from "../prepare";
import {
  mountTemplateProgram,
  type DOMTemplateProgram,
  type DOMTemplateKey,
  type MountedTemplateProgram,
} from "../dom/program";
import { hydrateTemplateProgramInRange } from "../dom/hydrate";
import { isRenderNewComponent, type RenderNewComponent } from "../component";
import { mountRenderNewComponent, type MountedRenderNewComponent } from "../dom/component";
import {
  insertDOMRange,
  moveDOMRange,
  removeDOMRange,
  type DOMNodeRange,
} from "../dom/range";
import {
  createDOMTemplateKeyMarkerData,
  readDOMTemplateKeyMarker,
} from "../dom/keyed";

export interface ChildBinding extends Disposable {
  readonly anchor: Comment;
}

export interface ChildBindingOptions {
  /** Reuse compatible server-rendered content on the first evaluation. */
  readonly hydrate?: boolean;
}

interface KeyedTemplateMount {
  readonly kind: "template";
  readonly key: DOMTemplateKey;
  readonly range: DOMNodeRange;
  value: DOMTemplateProgram;
  mounted: MountedTemplateProgram;
}

interface KeyedComponentMount {
  readonly kind: "component";
  readonly key: DOMTemplateKey;
  readonly range: DOMNodeRange;
  value: RenderNewComponent;
  mounted: MountedRenderNewComponent;
}

type KeyedChildMount = KeyedTemplateMount | KeyedComponentMount;
type KeyedChildValue = DOMTemplateProgram | RenderNewComponent;

function isTemplateProgram(value: unknown): value is DOMTemplateProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DOMTemplateProgram>;
  return !!candidate.template && typeof candidate.template === "object" &&
    Array.isArray(candidate.bindings);
}

function hasOwnKey(value: unknown): boolean {
  return !!value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "key");
}

function isKeyedChildValue(value: unknown): value is KeyedChildValue {
  return (isTemplateProgram(value) || isRenderNewComponent(value)) && hasOwnKey(value);
}

function getKeyedChildKey(value: KeyedChildValue): DOMTemplateKey {
  const key = value.key;
  if (!isDOMTemplateKey(key)) {
    throw new TypeError(
      "[vynn]: Every keyed child item requires a string, number, or bigint key.",
    );
  }
  return key;
}

function isDOMNode(value: unknown): value is Node {
  return !!value && typeof value === "object" &&
    typeof (value as Node).nodeType === "number" &&
    typeof (value as Node).cloneNode === "function";
}

function isDOMTemplateKey(value: unknown): value is DOMTemplateKey {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint";
}

function sameDOMTemplateKey(left: DOMTemplateKey, right: DOMTemplateKey): boolean {
  return left === right || Object.is(left, right);
}

function canUpdateTemplateProgram(
  current: DOMTemplateProgram,
  next: DOMTemplateProgram,
): boolean {
  if (current.template !== next.template || current.bindings.length !== next.bindings.length) {
    return false;
  }

  for (let index = 0; index < current.bindings.length; index++) {
    const left = current.bindings[index]!;
    const right = next.bindings[index]!;
    if (left.kind !== right.kind || left.reference !== right.reference) return false;

    switch (left.kind) {
      case "text":
      case "child":
        break;
      case "attribute":
        if (
          right.kind !== "attribute" ||
          (typeof left.name === "string" || typeof right.name === "string"
            ? left.name !== right.name
            : left.name.namespaceURI !== right.name.namespaceURI ||
              left.name.qualifiedName !== right.name.qualifiedName ||
              left.name.localName !== right.name.localName)
        ) return false;
        break;
      case "property":
        if (right.kind !== "property" || left.name !== right.name) return false;
        break;
      case "event":
        if (
          right.kind !== "event" ||
          left.event !== right.event ||
          left.options !== right.options
        ) return false;
        break;
    }
  }

  return true;
}

function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
}

function findEndAnchor(start: Comment): Comment {
  const match = /^__vynn_render_new_child_(\d+)_start__$/.exec(start.data);
  if (!match) {
    throw new Error("[vynn]: A dynamic child binding must target a paired range start marker.");
  }

  const expectedEnd = "__vynn_render_new_child_" + match[1] + "_end__";
  const nested: string[] = [];
  let current = start.nextSibling;

  while (current) {
    if (current.nodeType === 8) {
      const data = (current as Comment).data;
      const nestedStart = /^__vynn_render_new_child_(\d+)_start__$/.exec(data);
      if (nestedStart) {
        nested.push(nestedStart[1]!);
      } else {
        const nestedEnd = /^__vynn_render_new_child_(\d+)_end__$/.exec(data);
        if (nestedEnd) {
          if (nested.length > 0) {
            if (nested[nested.length - 1] !== nestedEnd[1]) {
              throw new Error("[vynn]: Dynamic child range markers are incorrectly nested.");
            }
            nested.pop();
          } else if (data === expectedEnd) {
            return current as Comment;
          }
        }
      }
    }
    current = current.nextSibling;
  }

  throw new Error("[vynn]: A dynamic child anchor is missing its paired end marker.");
}

function getRangeNodes(start: Comment, end: Comment): Node[] {
  const nodes: Node[] = [];
  let current = start.nextSibling;
  while (current && current !== end) {
    nodes.push(current);
    current = current.nextSibling;
  }
  if (current !== end) {
    throw new Error("[vynn]: A dynamic child range is not properly ordered.");
  }
  return nodes;
}

function isPrimitive(value: unknown): value is string | number | bigint {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint";
}

function clearRange(start: Comment, end: Comment): void {
  removeNodes(getRangeNodes(start, end));
}

function createKeyedRange(document: Document, key: DOMTemplateKey): DOMNodeRange {
  return Object.freeze({
    start: document.createComment(createDOMTemplateKeyMarkerData(key, "start")),
    end: document.createComment(createDOMTemplateKeyMarkerData(key, "end")),
  });
}

function collectKeyedRanges(
  start: Comment,
  end: Comment,
): Map<DOMTemplateKey, DOMNodeRange> | null {
  const ranges = new Map<DOMTemplateKey, DOMNodeRange>();
  const stack: Array<{ key: DOMTemplateKey; start: Comment }> = [];
  let current = start.nextSibling;

  while (current && current !== end) {
    const marker = readDOMTemplateKeyMarker(current);
    if (!marker) {
      if (stack.length === 0) return null;
      current = current.nextSibling;
      continue;
    }

    if (marker.edge === "start") {
      stack.push({ key: marker.key, start: current as Comment });
    } else {
      const opening = stack.pop();
      if (!opening || !sameDOMTemplateKey(opening.key, marker.key)) return null;

      if (stack.length === 0) {
        if (ranges.has(opening.key)) return null;
        ranges.set(opening.key, {
          start: opening.start,
          end: current as Comment,
        });
      }
    }

    current = current.nextSibling;
  }

  if (current !== end || stack.length > 0) return null;
  return ranges;
}

function clearKeyedRangeContent(range: DOMNodeRange): void {
  const nodes: Node[] = [];
  let current = range.start.nextSibling;

  while (current && current !== range.end) {
    nodes.push(current);
    current = current.nextSibling;
  }

  if (current !== range.end) {
    throw new Error("[vynn]: A keyed item range is not properly ordered.");
  }
  removeNodes(nodes);
}

function appendNode(parent: Node, node: Node, before: Node): () => void {
  if (node.nodeType === 11 && !("host" in node)) {
    const children = Array.from(node.childNodes);
    parent.insertBefore(node, before);
    return () => removeNodes(children);
  }

  parent.insertBefore(node, before);
  return () => removeNodes([node]);
}

/**
 * Binds a dynamic child range to reactive render values.
 *
 * Arrays of DOMTemplatePrograms with explicit `key` metadata use stable
 * per-item comment ranges. Compatible items update their binding accessors
 * in place and are moved as complete ranges when their order changes.
 */
export function bindChild(
  scope: RenderScope,
  anchor: Comment,
  adapter: DOMTemplateAdapter,
  read: Accessor<unknown>,
  options: ChildBindingOptions = {},
): ChildBinding {
  if (!anchor || anchor.nodeType !== 8) {
    throw new TypeError("[vynn]: bindChild() expects a DOM comment anchor.");
  }
  if (!adapter || typeof adapter !== "object" || typeof adapter.parse !== "function") {
    throw new TypeError("[vynn]: bindChild() expects a DOM template adapter.");
  }
  if (typeof read !== "function") {
    throw new TypeError("[vynn]: bindChild() expects a value accessor.");
  }

  let firstEvaluation = true;
  let disposed = false;
  const shouldHydrate = options.hydrate === true;
  let endAnchor: Comment | undefined;
  let ordinaryCleanups: Array<() => void> = [];
  let keyedItems = new Map<DOMTemplateKey, KeyedChildMount>();
  let keyedMode = false;

  const disposeKeyedItems = (): void => {
    const errors: unknown[] = [];
    for (const item of [...keyedItems.values()].reverse()) {
      try {
        item.mounted.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        removeDOMRange(item.range);
      } catch (error) {
        errors.push(error);
      }
    }
    keyedItems.clear();

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[vynn]: Multiple keyed child items failed to dispose.");
    }
  };

  const disposeOrdinaryChildren = (): void => {
    const cleanups = ordinaryCleanups;
    ordinaryCleanups = [];
    const errors: unknown[] = [];

    for (const cleanup of cleanups.reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[vynn]: Multiple dynamic child values failed to dispose.");
    }
  };

  const disposeCurrent = (): void => {
    const errors: unknown[] = [];
    try {
      disposeKeyedItems();
    } catch (error) {
      errors.push(error);
    }
    try {
      disposeOrdinaryChildren();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "[vynn]: Dynamic child cleanup failed.");
    }
  };

  const append = (parent: Node, before: Node, value: unknown, hydrate: boolean): void => {
    if (value === null || value === undefined || typeof value === "boolean") {
      if (hydrate && endAnchor) clearRange(anchor, endAnchor);
      return;
    }

    if (isPrimitive(value)) {
      const text = String(value);
      if (hydrate && endAnchor) {
        const existing = getRangeNodes(anchor, endAnchor);
        if (existing.length === 1 && existing[0]!.nodeType === 3) {
          (existing[0] as Text).data = text;
          ordinaryCleanups.push(() => removeNodes([existing[0]!]));
          return;
        }
        clearRange(anchor, endAnchor);
      }
      if (text.length > 0) {
        const textNode = anchor.ownerDocument!.createTextNode(text);
        parent.insertBefore(textNode, before);
        ordinaryCleanups.push(() => removeNodes([textNode]));
      }
      return;
    }

    if (Array.isArray(value)) {
      if (hydrate && endAnchor) clearRange(anchor, endAnchor);
      for (const item of value) append(parent, before, item, false);
      return;
    }

    if (isRenderNewComponent(value)) {
      const mounted = mountRenderNewComponent(parent, value, adapter, before);
      ordinaryCleanups.push(() => mounted.dispose());
      return;
    }

    if (isTemplateProgram(value)) {
      if (hydrate && endAnchor) {
        const adopted = hydrateTemplateProgramInRange(anchor, endAnchor, value, adapter);
        if (adopted) {
          ordinaryCleanups.push(() => adopted.dispose());
          return;
        }
        clearRange(anchor, endAnchor);
      }
      const mounted = mountTemplateProgram(parent, value, adapter, before);
      ordinaryCleanups.push(() => mounted.dispose());
      return;
    }

    if (isDOMNode(value)) {
      if (hydrate && endAnchor) clearRange(anchor, endAnchor);
      ordinaryCleanups.push(appendNode(parent, value, before));
      return;
    }

    throw new TypeError(
      "[vynn]: Dynamic children must be renderable primitives, DOM Nodes, arrays, or component template programs.",
    );
  };

  const mountKeyedChild = (
    parent: Node,
    range: DOMNodeRange,
    value: KeyedChildValue,
  ): KeyedChildMount => {
    const key = getKeyedChildKey(value);

    if (isRenderNewComponent(value)) {
      const mounted = mountRenderNewComponent(parent, value, adapter, range.end);
      return { kind: "component", key, range, value, mounted };
    }

    const mounted = mountTemplateProgram(parent, value, adapter, range.end);
    return { kind: "template", key, range, value, mounted };
  };

  const hydrateKeyedChildren = (
    parent: Node,
    before: Comment,
    start: Comment,
    end: Comment,
    values: readonly KeyedChildValue[],
  ): void => {
    const nextKeys = new Set<DOMTemplateKey>();
    const nextItems: Array<{ key: DOMTemplateKey; value: KeyedChildValue }> = [];

    for (const value of values) {
      if (!isKeyedChildValue(value)) {
        throw new TypeError(
          "[vynn]: A keyed child list must contain only keyed template programs or component descriptors.",
        );
      }
      const key = getKeyedChildKey(value);
      if (nextKeys.has(key)) {
        throw new TypeError("[vynn]: Duplicate key in a render_new child list.");
      }
      nextKeys.add(key);
      nextItems.push({ key, value });
    }

    // A missing or malformed marker sequence is a list-level hydration
    // mismatch. Clear only this child slot and recover by mounting its items.
    const serverRanges = collectKeyedRanges(start, end);
    if (!serverRanges) clearRange(start, end);

    const availableRanges = serverRanges ?? new Map<DOMTemplateKey, DOMNodeRange>();

    for (const [key, range] of availableRanges) {
      if (!nextKeys.has(key)) removeDOMRange(range);
    }

    for (const { key, value } of nextItems) {
      let range = availableRanges.get(key);

      if (!range) {
        range = createKeyedRange(anchor.ownerDocument!, key);
        insertDOMRange(parent, range, before);
        try {
          keyedItems.set(key, mountKeyedChild(parent, range, value));
        } catch (error) {
          removeDOMRange(range);
          throw error;
        }
        continue;
      }

      if (isRenderNewComponent(value)) {
        try {
          const mounted = mountRenderNewComponent(
            parent,
            value,
            adapter,
            range.end,
            { start: range.start, end: range.end },
          );
          keyedItems.set(key, {
            kind: "component",
            key,
            range,
            value,
            mounted,
          });
        } catch (error) {
          try {
            removeDOMRange(range);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "[vynn]: A keyed component failed to hydrate and its range could not be removed.",
            );
          }
          throw error;
        }
        continue;
      }

      try {
        let mounted = hydrateTemplateProgramInRange(
          range.start,
          range.end,
          value,
          adapter,
        );
        if (!mounted) {
          clearKeyedRangeContent(range);
          mounted = mountTemplateProgram(parent, value, adapter, range.end);
        }
        keyedItems.set(key, {
          kind: "template",
          key,
          range,
          value,
          mounted,
        });
      } catch (error) {
        try {
          removeDOMRange(range);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "[vynn]: A keyed item failed to hydrate and its range could not be removed.",
          );
        }
        throw error;
      }
    }

    let cursor: Node = before;
    for (let index = nextItems.length - 1; index >= 0; index--) {
      const item = keyedItems.get(nextItems[index]!.key)!;
      moveDOMRange(item.range, parent, cursor);
      cursor = item.range.start;
    }
  };

  const replaceKeyedChild = (
    parent: Node,
    existing: KeyedChildMount,
    value: KeyedChildValue,
  ): KeyedChildMount => {
    const errors: unknown[] = [];

    try {
      existing.mounted.dispose();
    } catch (error) {
      errors.push(error);
    }

    try {
      clearKeyedRangeContent(existing.range);
    } catch (error) {
      errors.push(error);
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        "[vynn]: A keyed child could not be replaced cleanly.",
      );
    }

    return mountKeyedChild(parent, existing.range, value);
  };

  const reconcileKeyedChildren = (
    parent: Node,
    before: Comment,
    values: readonly KeyedChildValue[],
  ): void => {
    const nextKeys = new Set<DOMTemplateKey>();
    const nextItems: Array<{ key: DOMTemplateKey; value: KeyedChildValue }> = [];

    // Validate the whole list before disposing or moving any current item.
    for (const value of values) {
      if (!isKeyedChildValue(value)) {
        throw new TypeError(
          "[vynn]: A keyed child list must contain only keyed template programs or component descriptors.",
        );
      }
      const key = getKeyedChildKey(value);
      if (nextKeys.has(key)) {
        throw new TypeError("[vynn]: Duplicate key in a render_new child list.");
      }
      nextKeys.add(key);
      nextItems.push({ key, value });
    }

    // Remove stale items before reusing any surviving ranges. Every cleanup is
    // attempted even if an earlier component cleanup throws.
    const removalErrors: unknown[] = [];
    for (const [key, item] of [...keyedItems]) {
      if (nextKeys.has(key)) continue;

      keyedItems.delete(key);

      try {
        item.mounted.dispose();
      } catch (error) {
        removalErrors.push(error);
      }

      try {
        removeDOMRange(item.range);
      } catch (error) {
        removalErrors.push(error);
      }
    }

    if (removalErrors.length === 1) throw removalErrors[0];
    if (removalErrors.length > 1) {
      throw new AggregateError(
        removalErrors,
        "[vynn]: Multiple keyed child items failed to dispose.",
      );
    }

    for (const { key, value } of nextItems) {
      const existing = keyedItems.get(key);

      if (!existing) {
        const range = createKeyedRange(anchor.ownerDocument!, key);
        insertDOMRange(parent, range, before);
        try {
          keyedItems.set(key, mountKeyedChild(parent, range, value));
        } catch (error) {
          removeDOMRange(range);
          throw error;
        }
        continue;
      }

      if (existing.kind === "template" && isTemplateProgram(value)) {
        if (canUpdateTemplateProgram(existing.value, value)) {
          existing.mounted.update(value);
          existing.value = value;
          continue;
        }
      } else if (existing.kind === "component" && isRenderNewComponent(value)) {
        if (existing.mounted.update(value)) {
          // Keep the original descriptor: it owns the state cells that the
          // mounted component's accessors close over.
          continue;
        }
      }

      const replacement = replaceKeyedChild(parent, existing, value);
      keyedItems.set(key, replacement);
    }

    // Move from the end toward the beginning so each item can be placed
    // immediately before the already-positioned next item.
    let cursor: Node = before;
    for (let index = nextItems.length - 1; index >= 0; index--) {
      const item = keyedItems.get(nextItems[index]!.key)!;
      moveDOMRange(item.range, parent, cursor);
      cursor = item.range.start;
    }
  };

  const updateValue = (value: unknown, hydrate: boolean): void => {
    const parent = anchor.parentNode;
    if (!parent) {
      throw new Error("[vynn]: A dynamic child anchor must belong to a parent node.");
    }

    const end = endAnchor!;
    const before = end;
    const hasKeyedEntries = Array.isArray(value) && value.some(hasOwnKey);
    const isEmptyKeyedUpdate = Array.isArray(value) &&
      value.length === 0 &&
      keyedMode;
    const shouldUseKeyedMode = hasKeyedEntries || isEmptyKeyedUpdate;

    if (shouldUseKeyedMode) {
      if (!Array.isArray(value) || !value.every(isKeyedChildValue)) {
        throw new TypeError(
          "[vynn]: A keyed child list must contain only keyed template programs or component descriptors.",
        );
      }

      keyedMode = true;
      if (hydrate) {
        disposeCurrent();
        hydrateKeyedChildren(
          parent,
          before as Comment,
          anchor,
          end,
          value as KeyedChildValue[],
        );
      } else {
        disposeOrdinaryChildren();
        reconcileKeyedChildren(parent, before as Comment, value as KeyedChildValue[]);
      }
      return;
    }

    keyedMode = false;
    if (keyedItems.size > 0) disposeKeyedItems();
    disposeOrdinaryChildren();
    append(parent, before, value, hydrate);
  };

  let stopEffect: () => void;
  try {
    stopEffect = runWithScope(scope, () =>
      $renderEffect(() => {
        if (!anchor.parentNode) {
          throw new Error("[vynn]: A dynamic child anchor must belong to a parent node.");
        }

        endAnchor ??= findEndAnchor(anchor);
        const hydrateThisRun = shouldHydrate && firstEvaluation;
        const value = firstEvaluation
          ? consumePreparedRenderNewChildValue(read)
          : read();
        updateValue(value, hydrateThisRun);
        firstEvaluation = false;
      }),
    );
  } catch (error) {
    try {
      disposeCurrent();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "[vynn]: Initial dynamic child rendering failed and its partial output could not be disposed.",
      );
    }
    throw error;
  }

  const unregisterCleanup = runWithScope(scope, () =>
    onScopeDispose(disposeCurrent),
  );

  return Object.freeze({
    anchor,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEffect();
      try {
        disposeCurrent();
      } finally {
        unregisterCleanup();
      }
    },
  });
}
