/**
 * Experimental standalone JSX target for Vynn's new renderer.
 *
 * Unlike index.ts, this target does not emit helpers from vynn/render. It
 * compiles a deliberately small, statically analyzable host-JSX subset into
 * DOMTemplateProgram-shaped objects consumed by vynn/render_new.
 */

import { decodeHTML } from "entities";
import { parseSync } from "oxc-parser";

import type { Node } from "./ast.ts";
import {
  forEachChild,
  getJSXAttributeName,
  getJSXIdentifierName,
  getVisitorKeys,
  inferLang,
  isExpression,
  isFunctionLike,
  isIdentifier,
  isJSXAttribute,
  isJSXElement,
  isJSXEmptyExpression,
  isJSXExpressionContainer,
  isJSXFragment,
  isJSXIdentifier,
  isJSXSpreadAttribute,
  isJSXText,
  isLiteralString,
  isNode,
  isNodeArray,
  isType,
  normalizeJSXText,
} from "./ast.ts";

export type RenderNewCompilerOptions = {
  lang?: "js" | "jsx" | "ts" | "tsx";
  sourceType?: "module" | "script" | "unambiguous";
};

export type RenderNewTransformResult = {
  code: string;
  map: null;
};

type EventAttribute = {
  event: string;
  capture: boolean;
};

type PendingBinding =
  | {
      kind: "attribute";
      name: string | { namespaceURI: string; qualifiedName: string };
      expression: Node;
    }
  | {
      kind: "property";
      name: string;
      expression: Node;
    }
  | {
      kind: "event";
      event: string;
      capture: boolean;
      expression: Node;
    };

type StaticTextNode = {
  kind: "text";
  value: string;
};

type DynamicChildNode = {
  kind: "dynamic-child";
  expression: Node | null;
  expressionSource?: string;
  placeholder: string;
};

type SerializedElement = {
  kind: "element";
  tag: string;
  markup: string;
  children: SerializedNode[];
  bindings: PendingBinding[];
};

type SerializedNode = StaticTextNode | DynamicChildNode | SerializedElement;

type TemplateReference = {
  id: number;
  kind: "element" | "text" | "anchor";
  path: number[];
};

type EmittedBinding =
  | {
      kind: "text";
      reference: number;
      read: string;
    }
  | {
      kind: "child";
      reference: number;
      read: string;
    }
  | {
      kind: "attribute";
      reference: number;
      name: string | { namespaceURI: string; qualifiedName: string };
      read: string;
    }
  | {
      kind: "property";
      reference: number;
      name: string;
      read: string;
    }
  | {
      kind: "event";
      reference: number;
      event: string;
      capture: boolean;
      read: string;
    };

type SerializedProgram = {
  markup: string;
  namespace: "html" | "svg" | "mathml";
  references: TemplateReference[];
  bindings: EmittedBinding[];
};

const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

// These parsing contexts need dedicated compiler rules. Rejecting them is
// safer than emitting reference paths that the HTML fragment parser rewrites.
const unsupportedElements = new Set([
  "body", "col", "colgroup", "head", "html", "iframe", "noembed", "noframes",
  "noscript", "optgroup", "option", "plaintext", "pre", "script", "select",
  "style", "template", "textarea", "title", "xmp", "table", "thead", "tbody",
  "tfoot", "tr", "td", "th",
]);

const booleanAttributes = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
  "default", "defer", "disabled", "formnovalidate", "hidden", "inert", "ismap",
  "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open",
  "playsinline", "readonly", "required", "reversed", "selected",
]);

// HTML boolean attributes need property assignment for dynamic values:
// setAttribute("disabled", "false") still enables the attribute.
const propertyBindings = new Set([
  ...booleanAttributes,
  "value",
  "indeterminate",
]);

const propertyAliases: Record<string, string> = {
  autofocus: "autofocus",
  autoplay: "autoplay",
  readonly: "readOnly",
  formnovalidate: "formNoValidate",
  allowfullscreen: "allowFullscreen",
  itemscope: "itemScope",
  ismap: "isMap",
  nomodule: "noModule",
  novalidate: "noValidate",
  playsinline: "playsInline",
};

const attributeAliases: Record<string, string> = {
  autoCapitalize: "autocapitalize",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  enterKeyHint: "enterkeyhint",
  htmlFor: "for",
  inputMode: "inputmode",
  rowSpan: "rowspan",
  tabIndex: "tabindex",
  xlinkActuate: "xlink:actuate",
  xlinkArcrole: "xlink:arcrole",
  xlinkHref: "xlink:href",
  xlinkRole: "xlink:role",
  xlinkShow: "xlink:show",
  xlinkTitle: "xlink:title",
  xlinkType: "xlink:type",
  xmlBase: "xml:base",
  xmlLang: "xml:lang",
  xmlSpace: "xml:space",
  xmlnsXlink: "xmlns:xlink",
};

const preservedSVGAttributes = new Set([
  "attributeName", "attributeType", "baseFrequency", "baseProfile", "calcMode",
  "clipPathUnits", "contentScriptType", "contentStyleType", "diffuseConstant",
  "externalResourcesRequired", "filterRes", "filterUnits", "gradientTransform",
  "gradientUnits", "kernelMatrix", "kernelUnitLength", "keyPoints", "keySplines",
  "keyTimes", "lengthAdjust", "limitingConeAngle", "markerHeight", "markerUnits",
  "markerWidth", "numOctaves", "pathLength", "patternContentUnits",
  "patternTransform", "patternUnits", "preserveAspectRatio", "primitiveUnits",
  "refX", "refY", "specularConstant", "specularExponent", "stdDeviation",
  "surfaceScale", "targetX", "targetY", "textLength", "viewBox", "viewTarget",
  "xChannelSelector", "yChannelSelector",
]);

const namespaceURIs: Record<string, string> = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/",
};

function fail(message: string, filename: string, node?: Node): never {
  const location = node?.loc?.start;
  const suffix = location
    ? " (line " + location.line + ", column " + (location.column + 1) + ")"
    : "";
  throw new Error("[Vynn render_new compiler] " + message + suffix + " in " + filename);
}

function sourceOf(source: string, node: Node, filename: string): string {
  if (
    !Number.isSafeInteger(node.start) ||
    !Number.isSafeInteger(node.end) ||
    node.start! < 0 ||
    node.end! < node.start! ||
    node.end! > source.length
  ) {
    fail("Oxc did not provide a valid source range for an expression.", filename, node);
  }

  return source.slice(node.start!, node.end!);
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function containsJSX(node: Node): boolean {
  if (isJSXElement(node) || isJSXFragment(node)) return true;

  for (const key of getVisitorKeys(node)) {
    const value = (node as unknown as Record<string, unknown>)[key];

    if (isNodeArray(value)) {
      if (value.some((child) => child !== null && containsJSX(child))) return true;
    } else if (isNode(value) && containsJSX(value)) {
      return true;
    }
  }

  return false;
}

function eventAttribute(name: string): EventAttribute | null {
  if (!/^on[A-Z]/.test(name)) return null;

  let suffix = name.slice(2);
  const capture = suffix.endsWith("Capture");

  if (capture) suffix = suffix.slice(0, -"Capture".length);
  if (!suffix) return null;

  const normalized = suffix[0].toLowerCase() + suffix.slice(1);
  const aliases: Record<string, string> = {
    doubleClick: "dblclick",
    dblClick: "dblclick",
    mouseEnter: "mouseenter",
    mouseLeave: "mouseleave",
    pointerEnter: "pointerenter",
    pointerLeave: "pointerleave",
  };

  return {
    event: aliases[normalized] ?? normalized.toLowerCase(),
    capture,
  };
}

function serializedAttributeName(name: string, inSVG: boolean): string {
  if (attributeAliases[name]) return attributeAliases[name];

  if (inSVG) {
    return preservedSVGAttributes.has(name)
      ? name
      : name.replace(/[A-Z]/g, (character) => "-" + character.toLowerCase());
  }

  return name.toLowerCase();
}

function normalizedAttributeBindingName(
  sourceName: string,
  inSVG: boolean,
): string | { namespaceURI: string; qualifiedName: string } {
  const qualifiedName = serializedAttributeName(sourceName, inSVG);
  const separator = qualifiedName.indexOf(":");

  if (separator === -1) return qualifiedName;

  const prefix = qualifiedName.slice(0, separator);
  const namespaceURI = namespaceURIs[prefix];

  return namespaceURI
    ? { namespaceURI, qualifiedName }
    : qualifiedName;
}

function getStaticAttributeValue(
  attribute: Node,
): string | number | boolean | null | undefined | typeof DYNAMIC {
  if (!isJSXAttribute(attribute)) return undefined;
  if (attribute.value === null) return true;
  if (isLiteralString(attribute.value)) return decodeHTML(attribute.value.value);

  if (!isJSXExpressionContainer(attribute.value)) return undefined;
  const expression = attribute.value.expression;

  if (isJSXEmptyExpression(expression)) return undefined;

  if (isType(expression, "Literal")) {
    if (
      expression.value === null ||
      typeof expression.value === "string" ||
      typeof expression.value === "number" ||
      typeof expression.value === "boolean"
    ) {
      return expression.value as string | number | boolean | null;
    }
  }

  return DYNAMIC;
}

const DYNAMIC = Symbol("dynamic");

function createTextNode(value: string): StaticTextNode {
  return { kind: "text", value };
}

function appendSerialized(nodes: SerializedNode[], next: SerializedNode): void {
  const previous = nodes[nodes.length - 1];

  if (previous?.kind === "text" && next.kind === "text") {
    previous.value += next.value;
    return;
  }

  nodes.push(next);
}

type CompileNestedJSX = (node: Node) => string;
type CompileJSXExpression = (node: Node) => string;

function serializeChildren(
  children: readonly Node[],
  source: string,
  filename: string,
  inSVG: boolean,
  textIndex: { value: number },
  compileNestedJSX: CompileNestedJSX,
  compileExpression: CompileJSXExpression,
): SerializedNode[] {
  const result: SerializedNode[] = [];

  for (const child of children) {
    if (isJSXText(child)) {
      const value = normalizeJSXText(child.value);
      if (value) appendSerialized(result, createTextNode(value));
      continue;
    }

    if (isJSXFragment(child)) {
      const nested = serializeChildren(
        child.children as unknown as Node[],
        source,
        filename,
        inSVG,
        textIndex,
        compileNestedJSX,
        compileExpression,
      );
      for (const node of nested) appendSerialized(result, node);
      continue;
    }

    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) continue;

      if (isType(expression, "Literal")) {
        if (typeof expression.value === "string" || typeof expression.value === "number") {
          appendSerialized(result, createTextNode(String(expression.value)));
        }
        // Booleans and nullish literals render no text.
        continue;
      }

      if (
        !isExpression(expression) &&
        !isJSXElement(expression) &&
        !isJSXFragment(expression)
      ) {
        fail("Unsupported JSX child expression.", filename, child);
      }

      const index = textIndex.value++;
      result.push({
        kind: "dynamic-child",
        expression,
        expressionSource: compileExpression(expression),
        placeholder: "<!--__vynn_render_new_child_" + index + "_start__-->" +
          "<!--__vynn_render_new_child_" + index + "_end__-->",
      });
      continue;
    }

    if (isJSXElement(child)) {
      result.push(
        isComponentJSXElement(child)
          ? serializeComponentChild(child, source, filename, textIndex, compileNestedJSX, compileExpression)
          : serializeElement(child, source, filename, textIndex, inSVG, compileNestedJSX, compileExpression),
      );
      continue;
    }

    fail("Unsupported JSX child node in the render_new target.", filename, child);
  }

  return result;
}

function isComponentJSXElement(node: Node): boolean {
  if (!isJSXElement(node) || !isJSXIdentifier(node.openingElement.name)) return false;
  const name = getJSXIdentifierName(node.openingElement.name);
  return /^[A-Z]/.test(name);
}

/**
 * Serializes a component element as a dynamic child program. Getter props keep
 * expressions live while the child component creates its own template scope.
 * Host JSX children inside a component's children prop are deferred until the
 * compiler gains a first-class nested-program expression.
 */
function serializeComponentChild(
  node: Node,
  source: string,
  filename: string,
  textIndex: { value: number },
  compileNestedJSX: CompileNestedJSX,
  compileExpression: CompileJSXExpression,
): DynamicChildNode {
  if (!isJSXElement(node) || !isJSXIdentifier(node.openingElement.name)) {
    fail("A component child must use a simple JSX identifier.", filename, node);
  }

  const name = getJSXIdentifierName(node.openingElement.name);
  const properties: string[] = [];

  for (const attribute of node.openingElement.attributes as unknown as Node[]) {
    if (isJSXSpreadAttribute(attribute)) {
      fail("JSX spread attributes are not supported by the first render_new target.", filename, attribute);
    }
    if (!isJSXAttribute(attribute)) continue;

    const propName = getJSXAttributeName(attribute.name);
    if (propName === "key") continue;

    if (attribute.value === null) {
      properties.push("get " + JSON.stringify(propName) + "() { return true; }");
      continue;
    }

    if (isLiteralString(attribute.value)) {
      properties.push(
        "get " + JSON.stringify(propName) + "() { return " +
          JSON.stringify(decodeHTML(attribute.value.value)) + "; }",
      );
      continue;
    }

    if (isJSXExpressionContainer(attribute.value)) {
      const expression = attribute.value.expression;
      if (isJSXEmptyExpression(expression)) continue;
      if (
        !isExpression(expression) &&
        !isJSXElement(expression) &&
        !isJSXFragment(expression)
      ) {
        fail("Unsupported expression in a component prop.", filename, attribute);
      }

      properties.push(
        "get " + JSON.stringify(propName) + "() { return (" +
          compileExpression(expression) + "); }",
      );
      continue;
    }

    fail("Unsupported component prop value.", filename, attribute);
  }

  const childValues: string[] = [];
  for (const child of node.children as unknown as Node[]) {
    if (isJSXText(child)) {
      const value = normalizeJSXText(child.value);
      if (value) childValues.push(JSON.stringify(value));
      continue;
    }

    if (isJSXExpressionContainer(child)) {
      const expression = child.expression;
      if (isJSXEmptyExpression(expression)) continue;
      if (
        !isExpression(expression) &&
        !isJSXElement(expression) &&
        !isJSXFragment(expression)
      ) {
        fail("Unsupported expression in component children.", filename, child);
      }
      childValues.push("(" + compileExpression(expression) + ")");
      continue;
    }

    if (isJSXElement(child) || isJSXFragment(child)) {
      childValues.push(compileNestedJSX(child));
    }
  }

  if (childValues.length > 0) {
    properties.push(
      "get \"children\"() { return [" + childValues.join(", ") + "]; }",
    );
  }

  const index = textIndex.value++;
  return {
    kind: "dynamic-child",
    expression: null,
    expressionSource: name + "({ " + properties.join(", ") + " })",
    placeholder: "<!--__vynn_render_new_child_" + index + "_start__-->" +
      "<!--__vynn_render_new_child_" + index + "_end__-->",
  };
}

function serializeElement(
  node: Node,
  source: string,
  filename: string,
  textIndex: { value: number },
  parentInSVG: boolean,
  compileNestedJSX: CompileNestedJSX,
  compileExpression: CompileJSXExpression,
): SerializedElement {
  if (!isJSXElement(node)) {
    fail("Expected a JSX element.", filename, node);
  }

  const tagNode = node.openingElement.name;

  if (!isJSXIdentifier(tagNode)) {
    fail("Member-expression and namespaced JSX tags are not supported by the first render_new target.", filename, tagNode);
  }

  const tag = getJSXIdentifierName(tagNode);
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(tag)) {
    fail("Invalid host element name <" + tag + ">.", filename, tagNode);
  }

  if (tag[0] !== tag[0].toLowerCase()) {
    fail(
      "Component element <" + tag + "> cannot appear inside a static host template yet.",
      filename,
      node,
    );
  }

  const lowerTag = tag.toLowerCase();

  if (unsupportedElements.has(lowerTag)) {
    fail(
      "<" + tag + "> requires dedicated parsing rules and is not supported by this target yet.",
      filename,
      node,
    );
  }

  const inSVG = parentInSVG || lowerTag === "svg";
  const childrenInSVG = inSVG && lowerTag !== "foreignobject";

  const attributes: string[] = [];
  const bindings: PendingBinding[] = [];

  for (const attribute of node.openingElement.attributes as unknown as Node[]) {
    if (isJSXSpreadAttribute(attribute)) {
      fail("JSX spread attributes are not supported by the first render_new target.", filename, attribute);
    }

    if (!isJSXAttribute(attribute)) {
      fail("Unsupported JSX attribute syntax.", filename, attribute);
    }

    const sourceName = getJSXAttributeName(attribute.name);
    if (sourceName === "key") continue;

    if (sourceName === "ref") {
      fail("JSX ref bindings are not supported by the first render_new target.", filename, attribute);
    }

    if (
      sourceName === "dangerouslySetInnerHTML" ||
      sourceName === "innerHTML" ||
      sourceName === "outerHTML"
    ) {
      fail(
        "Raw HTML property bindings are not supported by the first render_new target.",
        filename,
        attribute,
      );
    }

    if (
      sourceName.toLowerCase() === "html" ||
      sourceName.toLowerCase().startsWith("data-vynn-bind-") ||
      !/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(sourceName)
    ) {
      fail("Unsupported host attribute name " + sourceName + ".", filename, attribute);
    }

    const event = eventAttribute(sourceName);
    const staticValue = getStaticAttributeValue(attribute);

    if (event) {
      if (!isJSXExpressionContainer(attribute.value) || !isExpression(attribute.value.expression)) {
        fail("An event binding requires an expression value, for example onClick={handler}.", filename, attribute);
      }

      bindings.push({
        kind: "event",
        event: event.event,
        capture: event.capture,
        expression: attribute.value.expression,
      });
      continue;
    }

    if (staticValue === DYNAMIC) {
      if (
        !isJSXExpressionContainer(attribute.value) ||
        !isExpression(attribute.value.expression)
      ) {
        fail("A dynamic attribute requires an expression value.", filename, attribute);
      }

      if (containsJSX(attribute.value.expression)) {
        fail("JSX cannot be used as a dynamic attribute value.", filename, attribute);
      }

      if (
        attribute.value !== null &&
        !isLiteralString(attribute.value) &&
        !isJSXExpressionContainer(attribute.value)
      ) {
        fail("Unsupported JSX attribute value.", filename, attribute);
      }

      const lowerSourceName = sourceName.toLowerCase();
      const kind = propertyBindings.has(lowerSourceName) ? "property" : "attribute";
      if (sourceName === "style") {
        fail(
          "Dynamic style objects are not supported yet. Use a static style string or individual style attributes.",
          filename,
          attribute,
        );
      }

      if (kind === "property") {
        bindings.push({
          kind: "property",
          name: propertyAliases[lowerSourceName] ?? sourceName,
          expression: attribute.value.expression,
        });
      } else {
        bindings.push({
          kind: "attribute",
          name: normalizedAttributeBindingName(sourceName, inSVG),
          expression: attribute.value.expression,
        });
      }
      continue;
    }

    if (staticValue === undefined || staticValue === null) {
      if (
        attribute.value !== null &&
        !isLiteralString(attribute.value) &&
        !isJSXExpressionContainer(attribute.value)
      ) {
        fail("Unsupported JSX attribute value.", filename, attribute);
      }
      continue;
    }

    const outputName = serializedAttributeName(sourceName, inSVG);
    let outputValue: string;

    if (booleanAttributes.has(sourceName.toLowerCase())) {
      if (!staticValue) continue;
      outputValue = "";
    } else {
      outputValue = String(staticValue);
    }

    attributes.push(outputName + '="' + escapeAttribute(outputValue) + '"');
  }

  const children = voidElements.has(lowerTag)
    ? []
    : serializeChildren(
        node.children as unknown as Node[],
        source,
        filename,
        childrenInSVG,
        textIndex,
        compileNestedJSX,
        compileExpression,
      );

  if (voidElements.has(lowerTag) && node.children.length > 0) {
    const hasContent = node.children.some((child: Node) => {
      if (isJSXText(child)) return normalizeJSXText(child.value).length > 0;
      if (isJSXExpressionContainer(child)) return !isJSXEmptyExpression(child.expression);
      return true;
    });

    if (hasContent) {
      fail("Void element <" + tag + "> cannot contain children.", filename, node);
    }
  }

  const childMarkup = children.map(renderSerializedNode).join("");
  const opening = "<" + tag + (attributes.length ? " " + attributes.join(" ") : "") + ">";

  return {
    kind: "element",
    tag,
    markup: voidElements.has(lowerTag)
      ? opening
      : opening + childMarkup + "</" + tag + ">",
    children,
    bindings,
  };
}

function renderSerializedNode(node: SerializedNode): string {
  switch (node.kind) {
    case "text":
      return escapeText(node.value);
    case "dynamic-child":
      return node.placeholder;
    case "element":
      return node.markup;
  }
}

function expressionSource(
  source: string,
  expression: Node,
  filename: string,
): string {
  return sourceOf(source, expression, filename);
}

function serializeProgram(
  root: Node,
  source: string,
  filename: string,
  compileNestedJSX: CompileNestedJSX,
  compileExpression: CompileJSXExpression,
): SerializedProgram {
  const textIndex = { value: 0 };
  const roots: SerializedNode[] = [];

  if (isJSXFragment(root)) {
    roots.push(
      ...serializeChildren(
        root.children as unknown as Node[],
        source,
        filename,
        false,
        textIndex,
        compileNestedJSX,
        compileExpression,
      ),
    );
  } else if (isJSXElement(root)) {
    roots.push(
      isComponentJSXElement(root)
        ? serializeComponentChild(root, source, filename, textIndex, compileNestedJSX, compileExpression)
        : serializeElement(root, source, filename, textIndex, false, compileNestedJSX, compileExpression),
    );
  } else {
    fail("Expected a JSX element or fragment return.", filename, root);
  }

  const namespace: SerializedProgram["namespace"] =
    roots.length === 1 && roots[0].kind === "element" && roots[0].tag.toLowerCase() === "svg"
      ? "svg"
      : roots.length === 1 && roots[0].kind === "element" && roots[0].tag.toLowerCase() === "math"
        ? "mathml"
        : "html";

  const references: TemplateReference[] = [];
  const bindings: EmittedBinding[] = [];
  let nextReference = 0;

  const addReference = (
    kind: TemplateReference["kind"],
    path: number[],
  ): number => {
    const id = nextReference++;
    references.push({ id, kind, path });
    return id;
  };

  const visit = (node: SerializedNode, path: number[]): void => {
    if (node.kind === "dynamic-child") {
      const reference = addReference("anchor", path);
      const expression = node.expressionSource ??
        expressionSource(source, node.expression!, filename);
      bindings.push({
        kind: "child",
        reference,
        read: "() => (" + expression + ")",
      });
      return;
    }

    if (node.kind !== "element") return;

    if (node.bindings.length > 0) {
      const reference = addReference("element", path);

      for (const binding of node.bindings) {
        const read = "() => (" + compileExpression(binding.expression) + ")";

        if (binding.kind === "event") {
          bindings.push({
            kind: "event",
            reference,
            event: binding.event,
            capture: binding.capture,
            read,
          });
        } else if (binding.kind === "property") {
          bindings.push({
            kind: "property",
            reference,
            name: binding.name,
            read,
          });
        } else if (binding.kind === "attribute") {
          bindings.push({
            kind: "attribute",
            reference,
            name: binding.name,
            read,
          });
        }
      }
    }

    for (let index = 0; index < node.children.length; index++) {
      visit(node.children[index], [...path, index]);
    }
  };

  for (let index = 0; index < roots.length; index++) {
    visit(roots[index], [index]);
  }

  return {
    markup: roots.map(renderSerializedNode).join(""),
    namespace,
    references,
    bindings,
  };
}

function renderTemplateDefinition(
  program: SerializedProgram,
  useConstAssertions: boolean,
): string {
  const references = program.references.map((reference) => (
    "{ id: " + reference.id +
    ', kind: "' + reference.kind +
    '", path: [' + reference.path.join(", ") + "] }"
  ));

  return "{ markup: " + JSON.stringify(program.markup) +
    ', namespace: "' + program.namespace +
    '", references: [' + references.join(", ") + "] }" +
    (useConstAssertions ? " as const" : "");
}

function renderProgramExpression(
  program: SerializedProgram,
  templateName: string,
  useConstAssertions: boolean,
): string {
  const bindings = program.bindings.map((binding) => {
    if (binding.kind === "text") {
      return "{ kind: \"text\", reference: " + binding.reference +
        ", read: " + binding.read + " }";
    }

    if (binding.kind === "child") {
      return "{ kind: \"child\", reference: " + binding.reference +
        ", read: " + binding.read + " }";
    }

    if (binding.kind === "attribute") {
      return "{ kind: \"attribute\", reference: " + binding.reference +
        ", name: " + JSON.stringify(binding.name) +
        ", read: " + binding.read + " }";
    }

    if (binding.kind === "property") {
      return "{ kind: \"property\", reference: " + binding.reference +
        ", name: " + JSON.stringify(binding.name) +
        ", read: " + binding.read + " }";
    }

    return "{ kind: \"event\", reference: " + binding.reference +
      ", event: " + JSON.stringify(binding.event) +
      ", options: " + (binding.capture ? "true" : "false") +
      ", read: " + binding.read + " }";
  });

  return "({ template: " + templateName +
    ", bindings: [" + bindings.join(", ") + "]" +
    (useConstAssertions ? " } as const)" : " })");
}

function getTemplateInsertionOffset(program: Node, source: string): number {
  const body = (program as unknown as { body: Node[] }).body;
  let offset = source.startsWith("#!")
    ? Math.max(0, source.indexOf("\n") + 1)
    : 0;

  for (const statement of body) {
    const isDirective =
      isType(statement, "ExpressionStatement") &&
      isLiteralString(statement.expression);
    const isImport = isType(statement, "ImportDeclaration");

    if (!isDirective && !isImport) break;

    if (Number.isSafeInteger(statement.end)) {
      offset = Math.max(offset, statement.end!);
    }
  }

  return offset;
}

function isComponentFunction(node: Node): boolean {
  if (isType(node, "FunctionDeclaration") || isType(node, "FunctionExpression")) {
    const id = node.id;
    return !!id && /^[A-Z]/.test(id.name);
  }

  return false;
}

function collectJSXReturns(
  node: Node,
  roots: Node[],
  rootFunction: Node,
): void {
  if (node !== rootFunction && isFunctionLike(node)) return;

  if (isType(node, "ReturnStatement")) {
    const argument = node.argument;
    if (argument && (isJSXElement(argument) || isJSXFragment(argument))) {
      roots.push(argument);
      return;
    }
  }

  forEachChild(node, (child) => collectJSXReturns(child, roots, rootFunction));
}

type SourceReplacement = {
  start: number;
  end: number;
  value: string;
};

function collectComponentFunctions(program: Node): Node[] {
  const components: Node[] = [];

  const collectDeclaration = (declaration: Node | null | undefined): void => {
    if (!declaration) return;

    if (isComponentFunction(declaration)) {
      components.push(declaration);
      return;
    }

    if (isType(declaration, "VariableDeclaration")) {
      for (const item of declaration.declarations) {
        if (!isIdentifier(item.id) || !/^[A-Z]/.test(item.id.name)) continue;
        if (item.init && isFunctionLike(item.init)) components.push(item.init);
      }
    }
  };

  for (const statement of (program as unknown as { body: Node[] }).body) {
    if (
      isType(statement, "ExportNamedDeclaration") ||
      isType(statement, "ExportDefaultDeclaration")
    ) {
      if (isNode(statement.declaration)) collectDeclaration(statement.declaration);
    } else {
      collectDeclaration(statement);
    }
  }

  return components;
}

/**
 * Compile a limited host-JSX subset to the new renderer's program protocol.
 *
 * Supported in this first target:
 * - Named function components and named arrow/function component variables.
 * - JSX element or fragment expressions returned directly by those components.
 * - Static host elements/text, dynamic child expressions and component programs,
 *   dynamic attributes, common form-control properties, and event handlers.
 *
 * It intentionally rejects spreads, refs, JSX nested inside conditional
 * expressions, and parser-sensitive HTML contexts until those features have
 * first-class compiler rules in render_new.
 */
export function transformVynnRenderNewOxc(
  source: string,
  filename = "module.tsx",
  options: RenderNewCompilerOptions = {},
): string {
  return transformVynnRenderNewOxcWithMap(source, filename, options).code;
}

/** Compile and return generated code. Source maps are not emitted by this experimental target yet. */
export function transformVynnRenderNewOxcWithMap(
  source: string,
  filename = "module.tsx",
  options: RenderNewCompilerOptions = {},
): RenderNewTransformResult {
  const lang = options.lang ?? inferLang(filename);
  const parsed = parseSync(filename, source, {
    lang,
    sourceType: options.sourceType ?? "module",
    astType: "ts",
    preserveParens: false,
    showSemanticErrors: false,
  });

  const fatal = parsed.errors.filter((error) => error.severity === "Error");
  if (fatal.length > 0) {
    fail(
      "Oxc failed to parse source: " + fatal.map((error) => error.message).join("\n"),
      filename,
    );
  }

  const program = parsed.program as unknown as Node;
  const replacements: SourceReplacement[] = [];
  const coveredRanges: Array<[number, number]> = [];
  const usedNames = new Set<string>();

  const collectUsedNames = (node: Node): void => {
    if (isIdentifier(node)) usedNames.add(node.name);
    forEachChild(node, collectUsedNames);
  };
  collectUsedNames(program);

  let templateIndex = 0;
  const templateCache = new Map<string, string>();
  const templateDeclarations: string[] = [];
  let needsComponentHelper = false;
  let componentHelperName = "_vynnCreateRenderNewComponent";
  let componentHelperIndex = 0;

  while (usedNames.has(componentHelperName)) {
    componentHelperName = "_vynnCreateRenderNewComponent" + componentHelperIndex++;
  }
  usedNames.add(componentHelperName);

  const getTemplateName = (serialized: SerializedProgram): string => {
    const signature = JSON.stringify([
      serialized.markup,
      serialized.namespace,
      serialized.references.map(({ id, kind, path }) => [id, kind, path]),
    ]);
    const cached = templateCache.get(signature);
    if (cached) return cached;

    let name: string;
    do {
      name = "_vynnTemplate" + templateIndex++;
    } while (usedNames.has(name));

    usedNames.add(name);
    const definition = renderTemplateDefinition(
      serialized,
      lang === "ts" || lang === "tsx",
    );

    templateCache.set(signature, name);
    templateDeclarations.push("const " + name + " = " + definition + ";");
    return name;
  };

  const useConstAssertions = lang === "ts" || lang === "tsx";

  const compileNestedJSX: CompileNestedJSX = (node) => {
    const serialized = serializeProgram(
      node,
      source,
      filename,
      compileNestedJSX,
      compileExpression,
    );
    const templateName = getTemplateName(serialized);
    return renderProgramExpression(serialized, templateName, useConstAssertions);
  };

  const compileExpression: CompileJSXExpression = (expression) => {
    const original = sourceOf(source, expression, filename);
    const nestedJSX: Node[] = [];

    const collectNested = (node: Node): void => {
      if (isJSXElement(node) || isJSXFragment(node)) {
        nestedJSX.push(node);
        return;
      }
      forEachChild(node, collectNested);
    };

    collectNested(expression);
    if (nestedJSX.length === 0) return original;

    const replacements = nestedJSX
      .map((node) => ({
        start: node.start!,
        end: node.end!,
        value: compileNestedJSX(node),
      }))
      .sort((left, right) => right.start - left.start);

    let compiled = original;
    const baseOffset = expression.start!;

    for (const replacement of replacements) {
      const start = replacement.start - baseOffset;
      const end = replacement.end - baseOffset;
      compiled = compiled.slice(0, start) + replacement.value + compiled.slice(end);
    }

    return compiled;
  };

  for (const component of collectComponentFunctions(program)) {
    const metadata = component as unknown as {
      async?: boolean;
      generator?: boolean;
    };

    if (metadata.async || metadata.generator) {
      fail(
        "Async and generator components are not supported by the first render_new target.",
        filename,
        component,
      );
    }

    const roots: Node[] = [];

    if (
      (isType(component, "ArrowFunctionExpression") || isType(component, "FunctionExpression")) &&
      (isJSXElement(component.body) || isJSXFragment(component.body))
    ) {
      roots.push(component.body);
    } else if (
      (isType(component, "FunctionDeclaration") ||
        isType(component, "FunctionExpression") ||
        isType(component, "ArrowFunctionExpression")) &&
      isType(component.body, "BlockStatement")
    ) {
      collectJSXReturns(component.body, roots, component);
    }

    if (roots.length > 0) {
      needsComponentHelper = true;
      const body = component.body as Node;

      if (isType(body, "BlockStatement")) {
        // Move execution of the original component body into the render callback.
        // This defers state/effect/context creation until the renderer owns a scope.
        replacements.push({
          start: body.start! + 1,
          end: body.start! + 1,
          value: "\nreturn " + componentHelperName + "(() => {\n",
        });
        replacements.push({
          start: body.end! - 1,
          end: body.end! - 1,
          value: "\n});\n",
        });
      } else {
        // Expression-bodied components need a callback around the JSX result.
        replacements.push({
          start: body.start!,
          end: body.start!,
          value: componentHelperName + "(() => (",
        });
        replacements.push({
          start: body.end!,
          end: body.end!,
          value: "))",
        });
      }
    }

    for (const root of roots) {
      const serialized = serializeProgram(root, source, filename, compileNestedJSX, compileExpression);
      const templateName = getTemplateName(serialized);

      replacements.push({
        start: root.start!,
        end: root.end!,
        value: renderProgramExpression(
          serialized,
          templateName,
          useConstAssertions,
        ),
      });
      coveredRanges.push([root.start!, root.end!]);
    }
  }

  const uncoveredJSX: Node[] = [];
  const scanForUncoveredJSX = (node: Node): void => {
    if (isJSXElement(node) || isJSXFragment(node)) {
      const start = node.start ?? -1;
      const end = node.end ?? -1;
      if (!coveredRanges.some(([rangeStart, rangeEnd]) => start >= rangeStart && end <= rangeEnd)) {
        uncoveredJSX.push(node);
      }
      return;
    }

    forEachChild(node, scanForUncoveredJSX);
  };
  scanForUncoveredJSX(program);

  if (uncoveredJSX.length > 0) {
    fail(
      "JSX must be returned directly from a named function component in this first target.",
      filename,
      uncoveredJSX[0],
    );
  }

  if (replacements.length === 0) {
    return { code: source, map: null };
  }

  replacements.sort((left, right) =>
    right.start - left.start || right.end - left.end,
  );

  let code = source;
  let previousStart = source.length + 1;

  for (const replacement of replacements) {
    if (replacement.end > previousStart) {
      fail("Overlapping JSX replacement ranges were found.", filename);
    }

    code =
      code.slice(0, replacement.start) +
      replacement.value +
      code.slice(replacement.end);
    previousStart = replacement.start;
  }

  if (templateDeclarations.length > 0 || needsComponentHelper) {
    const insertionOffset = getTemplateInsertionOffset(program, source);
    const prefix = code.slice(0, insertionOffset);
    const suffix = code.slice(insertionOffset);
    const before = prefix.length > 0 && !prefix.endsWith("\n") ? "\n" : "";
    const after = suffix.startsWith("\n") ? "" : "\n";

    code =
      prefix +
      before +
      [
        ...(needsComponentHelper
          ? [
              "import { createRenderNewComponent as " +
                componentHelperName +
                "} from \"vynn/render_new/internal\";",
            ]
          : []),
        ...templateDeclarations,
      ].join("\n") +
      after +
      suffix;
  }

  return { code, map: null };
}
