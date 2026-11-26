import type { DOMTemplateProgram } from "../dom/program";
import type { TemplateReference } from "../template/types";
import { createDOMTemplateKeyMarkerData } from "../dom/keyed";
import { createScope, disposeScope, runWithScope } from "../lifecycle/scope";
import {
  consumePreparedRenderNewChildValue,
  consumePreparedRenderNewComponent,
  consumePreparedRenderNewRootScope,
  prepareRenderNewTree,
} from "../prepare";
import {
  isRenderNewComponent,
  resolveRenderNewComponentProgram,
  type RenderNewComponent,
} from "../component";

type SSRNodeKind = "root" | "element" | "text" | "comment";

interface SSRNode {
  readonly kind: SSRNodeKind;
  readonly children: SSRNode[];
  parent: SSRNode | null;
  tag?: string;
  data?: string;
  attributes?: Array<{ name: string; value: string }>;
}

const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

const booleanProperties = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
  "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "ismap",
  "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open",
  "playsinline", "readonly", "required", "reversed", "selected",
]);

const propertyAttributeNames: Record<string, string> = {
  allowFullscreen: "allowfullscreen",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  formNoValidate: "formnovalidate",
  itemScope: "itemscope",
  isMap: "ismap",
  noModule: "nomodule",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
};

function createNode(kind: SSRNodeKind, parent: SSRNode | null): SSRNode {
  return { kind, parent, children: [] };
}

function parseAttributes(source: string): Array<{ name: string; value: string }> {
  const attributes: Array<{ name: string; value: string }> = [];
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const name = match[1];
    if (!name) continue;
    attributes.push({
      name,
      value: match[2] ?? match[3] ?? match[4] ?? "",
    });
  }

  return attributes;
}

/**
 * Parses the deliberately constrained static markup emitted by the
 * render_new compiler. This is not a general HTML parser: parser-sensitive
 * contexts are rejected by the compiler before this stage.
 */
function parseTemplateMarkup(markup: string): SSRNode {
  if (typeof markup !== "string") {
    throw new TypeError("[vynn render_new]: Template markup must be a string.");
  }

  const root = createNode("root", null);
  const stack: SSRNode[] = [root];
  let offset = 0;

  while (offset < markup.length) {
    const parent = stack[stack.length - 1]!;

    if (markup.startsWith("<!--", offset)) {
      const end = markup.indexOf("-->", offset + 4);
      if (end === -1) {
        throw new SyntaxError("[vynn render_new]: An HTML comment in a template was not closed.");
      }
      const node = createNode("comment", parent);
      node.data = markup.slice(offset + 4, end);
      parent.children.push(node);
      offset = end + 3;
      continue;
    }

    if (markup[offset] !== "<") {
      const next = markup.indexOf("<", offset);
      const end = next === -1 ? markup.length : next;
      const node = createNode("text", parent);
      node.data = markup.slice(offset, end);
      parent.children.push(node);
      offset = end;
      continue;
    }

    if (markup.startsWith("</", offset)) {
      const end = markup.indexOf(">", offset + 2);
      if (end === -1) {
        throw new SyntaxError("[vynn render_new]: An element closing tag was not closed.");
      }
      const tag = markup.slice(offset + 2, end).trim().toLowerCase();
      if (stack.length === 1 || stack[stack.length - 1]!.tag?.toLowerCase() !== tag) {
        throw new SyntaxError("[vynn render_new]: Unexpected closing tag </" + tag + ">.");
      }
      stack.pop();
      offset = end + 1;
      continue;
    }

    if (markup.startsWith("<!", offset) || markup.startsWith("<?", offset)) {
      const end = markup.indexOf(">", offset + 2);
      if (end === -1) {
        throw new SyntaxError("[vynn render_new]: An HTML declaration was not closed.");
      }
      const node = createNode("comment", parent);
      node.data = markup.slice(offset + 2, end);
      parent.children.push(node);
      offset = end + 1;
      continue;
    }

    const end = markup.indexOf(">", offset + 1);
    if (end === -1) {
      throw new SyntaxError("[vynn render_new]: An element opening tag was not closed.");
    }

    const source = markup.slice(offset + 1, end);
    const tagMatch = /^([A-Za-z][A-Za-z0-9:._-]*)([\s\S]*)$/.exec(source);
    if (!tagMatch) {
      throw new SyntaxError("[vynn render_new]: Invalid element opening tag.");
    }

    const tag = tagMatch[1]!;
    const node = createNode("element", parent);
    node.tag = tag;
    node.attributes = parseAttributes(tagMatch[2]!.replace(/\/\s*$/, ""));
    parent.children.push(node);
    offset = end + 1;

    const isVoid = voidElements.has(tag.toLowerCase());
    if (!isVoid && !/\/\s*$/.test(tagMatch[2]!)) stack.push(node);
  }

  if (stack.length !== 1) {
    throw new SyntaxError("[vynn render_new]: A template contains unclosed elements.");
  }

  return root;
}

function resolvePath(root: SSRNode, path: readonly number[], reference: TemplateReference): SSRNode {
  let node: SSRNode | undefined;

  for (let index = 0; index < path.length; index++) {
    const parent = index === 0 ? root : node;
    node = parent?.children[path[index]!];
    if (!node) {
      throw new Error(
        "[vynn render_new]: Template reference " + reference.id +
        " points to a missing node at [" + path.join(", ") + "].",
      );
    }
  }

  return node!;
}

function assertReferenceKind(node: SSRNode, reference: TemplateReference): void {
  const valid =
    (reference.kind === "element" && node.kind === "element") ||
    (reference.kind === "text" && node.kind === "text") ||
    (reference.kind === "anchor" && node.kind === "comment");

  if (!valid) {
    throw new TypeError(
      "[vynn render_new]: Template reference " + reference.id +
      " expected " + reference.kind + " but resolved to " + node.kind + ".",
    );
  }
}

function setAttribute(node: SSRNode, name: string, value: unknown): void {
  if (node.kind !== "element" || !node.attributes) {
    throw new TypeError("[vynn render_new]: An attribute binding must target an element.");
  }

  const existing = node.attributes.find((attribute) => attribute.name === name);
  if (value === null || value === undefined) {
    if (existing) node.attributes.splice(node.attributes.indexOf(existing), 1);
    return;
  }

  const text = String(value);
  if (existing) existing.value = text;
  else node.attributes.push({ name, value: text });
}

function renderKeyedProgramArray(value: readonly unknown[]): string | null {
  const hasKeyedEntry = value.some((item) =>
    !!item &&
    typeof item === "object" &&
    Object.prototype.hasOwnProperty.call(item, "key"),
  );
  if (!hasKeyedEntry) return null;

  const keys = new Set<unknown>();
  const keyedChildren: Array<{
    key: string | number | bigint;
    value: DOMTemplateProgram | RenderNewComponent;
  }> = [];

  // Validate the full list before evaluating any component or template. A
  // duplicate or malformed key must not partially render earlier entries.
  for (const item of value) {
    const isProgram = isTemplateProgram(item);
    const isComponent = isRenderNewComponent(item);
    if (
      (!isProgram && !isComponent) ||
      !Object.prototype.hasOwnProperty.call(item, "key")
    ) {
      throw new TypeError(
        "[vynn render_new]: A keyed server child list must contain only keyed template programs or component descriptors.",
      );
    }

    const key = (item as DOMTemplateProgram | RenderNewComponent).key;
    if (
      typeof key !== "string" &&
      typeof key !== "number" &&
      typeof key !== "bigint"
    ) {
      throw new TypeError(
        "[vynn render_new]: Every keyed server child requires a string, number, or bigint key.",
      );
    }
    if (keys.has(key)) {
      throw new TypeError("[vynn render_new]: Duplicate key in a render_new server child list.");
    }
    keys.add(key);
    keyedChildren.push({ key, value: item as DOMTemplateProgram | RenderNewComponent });
  }

  return keyedChildren.map(({ key, value: child }) => {
    const start = createDOMTemplateKeyMarkerData(key, "start");
    const end = createDOMTemplateKeyMarkerData(key, "end");
    return "<!--" + start + "-->" + renderChildValue(child) + "<!--" + end + "-->";
  }).join("");
}

function renderChildValue(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return escapeText(String(value));
  }
  if (Array.isArray(value)) {
    const keyed = renderKeyedProgramArray(value);
    return keyed ?? value.map(renderChildValue).join("");
  }
  if (isRenderNewComponent(value)) {
    const prepared = consumePreparedRenderNewComponent(value);
    const scope = prepared?.scope ?? createScope();
    try {
      const program = prepared?.program ??
        runWithScope(scope, () =>
          resolveRenderNewComponentProgram(value.render()),
        );
      return runWithScope(scope, () => renderProgram(program));
    } finally {
      if (!prepared) disposeScope(scope);
    }
  }
  if (isTemplateProgram(value)) return renderProgram(value);
  throw new TypeError(
    "[vynn render_new]: Server children must be primitives, arrays, or component template programs.",
  );
}

function isTemplateProgram(value: unknown): value is DOMTemplateProgram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DOMTemplateProgram>;
  return !!candidate.template && typeof candidate.template === "object" &&
    Array.isArray(candidate.bindings);
}

function findEndMarker(start: SSRNode): SSRNode {
  const match = /^__vynn_render_new_child_(\d+)_start__$/.exec(start.data ?? "");
  if (!match || !start.parent) {
    throw new Error("[vynn render_new]: A dynamic child anchor is missing its paired range marker.");
  }

  const expected = "__vynn_render_new_child_" + match[1] + "_end__";
  const siblings = start.parent.children;
  const index = siblings.indexOf(start);
  const end = siblings[index + 1];

  if (!end || end.kind !== "comment" || end.data !== expected) {
    throw new Error("[vynn render_new]: A dynamic child range is missing its closing marker.");
  }

  return end;
}

function renderNode(node: SSRNode, childOutput: ReadonlyMap<SSRNode, string>): string {
  switch (node.kind) {
    case "root":
      return node.children.map((child) => renderNode(child, childOutput)).join("");
    case "text":
      return node.data ?? "";
    case "comment":
      return "<!--" + (node.data ?? "") + "-->" + (childOutput.get(node) ?? "");
    case "element": {
      const attributes = (node.attributes ?? [])
        .map((attribute) => " " + attribute.name + '="' + attribute.value + '"')
        .join("");
      const opening = "<" + node.tag + attributes + ">";
      if (voidElements.has(node.tag!.toLowerCase())) return opening;
      return opening + node.children.map((child) => renderNode(child, childOutput)).join("") +
        "</" + node.tag + ">";
    }
  }
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function renderProgram(program: DOMTemplateProgram): string {
  if (!isTemplateProgram(program)) {
    throw new TypeError("[vynn render_new]: Expected a DOM template program.");
  }

  const root = parseTemplateMarkup(program.template.markup);
  const referenceNodes = new Map<number, SSRNode>();

  for (const reference of program.template.references) {
    if (referenceNodes.has(reference.id)) {
      throw new TypeError("[vynn render_new]: Duplicate template reference " + reference.id + ".");
    }
    const node = resolvePath(root, reference.path, reference);
    assertReferenceKind(node, reference);
    referenceNodes.set(reference.id, node);
  }

  const childOutput = new Map<SSRNode, string>();

  for (const instruction of program.bindings) {
    const target = referenceNodes.get(instruction.reference);
    if (!target) {
      throw new Error("[vynn render_new]: Binding references missing node " + instruction.reference + ".");
    }

    if (instruction.kind === "event") {
      // Event handlers are client-only and are not evaluated during SSR.
      continue;
    }

    const value = instruction.kind === "child"
      ? consumePreparedRenderNewChildValue(instruction.read)
      : instruction.read();

    switch (instruction.kind) {
      case "text":
        if (target.kind !== "text") {
          throw new TypeError("[vynn render_new]: Text binding target is not a text node.");
        }
        target.data = value === null || value === undefined ? "" : escapeText(String(value));
        break;

      case "attribute": {
        const name = typeof instruction.name === "string"
          ? instruction.name
          : instruction.name.qualifiedName;
        setAttribute(target, name, value === null || value === undefined ? null : escapeAttribute(String(value)));
        break;
      }

      case "property": {
        if (target.kind !== "element") {
          throw new TypeError("[vynn render_new]: Property binding target is not an element.");
        }
        const attributeName = propertyAttributeNames[instruction.name] ?? instruction.name;
        if (booleanProperties.has(attributeName.toLowerCase())) {
          setAttribute(target, attributeName, value ? "" : null);
        } else if (attributeName === "value") {
          setAttribute(target, "value", value === null || value === undefined ? null : escapeAttribute(String(value)));
        }
        break;
      }

      case "child": {
        if (target.kind !== "comment") {
          throw new TypeError("[vynn render_new]: Child binding target is not a comment anchor.");
        }
        findEndMarker(target);
        childOutput.set(target, renderChildValue(value));
        break;
      }
    }
  }

  return renderNode(root, childOutput);
}

/**
 * Renders one render_new component program to an HTML string.
 *
 * The serializer is intentionally separate from the legacy Vynn SSR renderer.
 * It supports the host markup subset emitted by transformVynnRenderNewOxc and
 * keeps paired dynamic-child markers in the output for client hydration.
 */
export function renderTemplateProgramToString(
  program: DOMTemplateProgram | RenderNewComponent,
): string {
  const preparedRoot = consumePreparedRenderNewRootScope(program);
  const scope = preparedRoot ?? createScope(null);
  try {
    return runWithScope(scope, () => {
      if (!isRenderNewComponent(program)) return renderProgram(program);

      const prepared = consumePreparedRenderNewComponent(program);
      const componentScope = prepared?.scope ?? createScope(scope);
      try {
        const componentProgram = prepared?.program ??
          runWithScope(componentScope, () =>
            resolveRenderNewComponentProgram(program.render()),
          );
        return runWithScope(componentScope, () => renderProgram(componentProgram));
      } finally {
        if (!prepared) disposeScope(componentScope);
      }
    });
  } finally {
    disposeScope(scope);
  }
}


/**
 * Prepares asynchronous component boundaries (for example route modules and
 * guards) before using the synchronous serializer.
 */
export async function renderTemplateProgramToStringAsync(
  program: DOMTemplateProgram | RenderNewComponent,
): Promise<string> {
  await prepareRenderNewTree(program);
  return renderTemplateProgramToString(program);
}

export { escapeAttribute as escapeRenderNewAttribute, escapeText as escapeRenderNewText };
