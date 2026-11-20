/**
 * Independent string-output JSX compiler for Vynn SSR.
 *
 * This target deliberately does not reuse the client compiler's template,
 * insertion, hydration, or component-wrapper lowering. JSX host elements become
 * HTML string expressions, while JSX components remain ordinary function calls.
 */

import { parseSync } from "oxc-parser";

import type { Node } from "../ast.ts";

import {
  addSourceLocations,
  forEachChild,
  getJSXAttributeName,
  getNodeProperty,
  getVisitorKeys,
  inferLang,
  isJSXAttribute,
  isJSXElement,
  isJSXEmptyExpression,
  isJSXExpressionContainer,
  isJSXFragment,
  isJSXIdentifier,
  isJSXMemberExpression,
  isJSXSpreadAttribute,
  isJSXText,
  isIdentifier,
  isLiteralString,
  isNode,
  isType,
  normalizeJSXText,
} from "../ast.ts";

export type VynnSsrCompilerOptions = {
  /** Override parser language. Usually inferred from the file extension. */
  lang?: "js" | "jsx" | "ts" | "tsx";
  /** Source module type; Vynn modules are normally ESM. */
  sourceType?: "module" | "script" | "unambiguous";
};

export type VynnSsrTransformResult = {
  code: string;
  /** Source maps are not emitted by this source-preserving first implementation. */
  map: null;
};

type Replacement = {
  start: number;
  end: number;
  value: string;
};

type ChildSlotCursor = {
  next: number;
};

type SsrHelper =
  | "$ssrComponent"
  | "$ssrChildren"
  | "$ssrHead"
  | "$ssrHeadGroup"
  | "$ssrAttribute"
  | "$ssrJoin"
  | "$ssrJoinChildren"
  | "$ssrLogical"
  | "$ssrRaw"
  | "$ssrSpread"
  | "$ssrText";

const runtimeSource = "vynn/server/ssr";

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const booleanAttributes = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

const preservedSvgAttributeNames = new Set([
  "attributeName",
  "attributeType",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "contentScriptType",
  "contentStyleType",
  "diffuseConstant",
  "externalResourcesRequired",
  "filterRes",
  "filterUnits",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "specularConstant",
  "specularExponent",
  "stdDeviation",
  "surfaceScale",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
]);

const svgAttributeAliases: Record<string, string> = {
  autoCapitalize: "autocapitalize",
  className: "class",
  contentEditable: "contenteditable",
  enterKeyHint: "enterkeyhint",
  htmlFor: "for",
  inputMode: "inputmode",
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

function getNodeStart(node: Node): number {
  const start = getNodeProperty(node, "start");
  if (typeof start !== "number") throw new Error("[Vynn SSR compiler] Missing JSX source start.");
  return start;
}

function getNodeEnd(node: Node): number {
  const end = getNodeProperty(node, "end");
  if (typeof end !== "number") throw new Error("[Vynn SSR compiler] Missing JSX source end.");
  return end;
}

function getNodeArray(node: Node, key: string): Node[] {
  const value = getNodeProperty(node, key);
  if (!Array.isArray(value)) return [];
  return value.filter(isNode);
}

function getChild(node: Node, key: string): Node | null {
  const value = getNodeProperty(node, key);
  return isNode(value) ? value : null;
}

function escapeStatic(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function escapeRawTextStatic(value: string, tag: "script" | "style"): string {
  if (tag === "script") return value.replace(/<\/script/gi, "<\\/script");
  return value.replace(/</g, "\\3C ");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function propertyKey(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : quote(value);
}

function isEventAttribute(name: string): boolean {
  return (
    name.length > 2 &&
    name.startsWith("on") &&
    name[2] === name[2].toUpperCase()
  );
}

function normalizeStaticAttributeName(name: string, svg: boolean): string {
  if (svg) {
    const alias = svgAttributeAliases[name];
    if (alias) return alias;
    if (preservedSvgAttributeNames.has(name)) return name;
    return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }

  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name.toLowerCase();
}

function staticAttribute(name: string, value: string | boolean, svg: boolean): string {
  if (name === "key" || name === "children" || name === "ref" || name === "html") return "";
  if (isEventAttribute(name)) return "";
  if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name) || /^on[a-z]/i.test(name)) {
    throw new TypeError("[Vynn SSR compiler] Unsafe HTML/SVG attribute name: " + JSON.stringify(name));
  }

  const attributeName = normalizeStaticAttributeName(name, svg);
  if (!svg && booleanAttributes.has(attributeName.toLowerCase())) {
    return value ? ` ${attributeName}=""` : "";
  }

  return ` ${attributeName}="${escapeStatic(String(value))}"`;
}

function isComponentName(name: Node): boolean {
  if (isJSXMemberExpression(name)) return true;
  if (!isJSXIdentifier(name)) return false;
  return /^[A-Z]/.test(name.name);
}

function renderTagName(name: Node): string {
  if (isJSXIdentifier(name)) return name.name;
  if (isJSXMemberExpression(name)) {
    const object = getChild(name, "object");
    const property = getChild(name, "property");
    if (!object || !property || !isJSXIdentifier(property)) {
      throw new Error("[Vynn SSR compiler] Unsupported JSX member-expression tag.");
    }
    return `${renderTagName(object)}.${property.name}`;
  }
  throw new Error("[Vynn SSR compiler] Namespaced JSX tag names are not supported.");
}

class SsrTransform {
  private readonly source: string;
  private readonly helpers = new Set<SsrHelper>();
  private readonly aliases = new Map<SsrHelper, string>();
  private readonly documentHeadNodes = new WeakSet<object>();
  private readonly documentHeadContentNodes = new WeakSet<object>();
  private readonly svgDescendants = new WeakSet<object>();
  private readonly jsxReturningFunctions = new Set<string>();

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Index local functions that return compiled JSX. These helpers do not need
   * PascalCase component semantics, but calls to them must be serialized as
   * markup rather than escaped as ordinary text.
   */
  private collectJsxReturningFunctions(node: Node): void {
    if (isType(node, "FunctionDeclaration")) {
      const id = getChild(node, "id");
      const body = getChild(node, "body");
      if (id && isIdentifier(id) && body && this.containsJsx(body)) {
        this.jsxReturningFunctions.add(id.name);
      }
    }

    if (isType(node, "VariableDeclarator")) {
      const id = getChild(node, "id");
      const init = getChild(node, "init");
      if (
        id &&
        isIdentifier(id) &&
        init &&
        (isType(init, "ArrowFunctionExpression") ||
          isType(init, "FunctionExpression")) &&
        this.containsJsx(init)
      ) {
        this.jsxReturningFunctions.add(id.name);
      }
    }

    forEachChild(node, (child) => this.collectJsxReturningFunctions(child));
  }

  private collectSpecialContexts(
    node: Node,
    parentTag: string | null = null,
    insideDocumentHead = false,
    insideSvg = false,
  ): void {
    if (isJSXElement(node)) {
      const opening = getChild(node, "openingElement");
      const name = opening ? getChild(opening, "name") : null;
      const tag = name && isJSXIdentifier(name) ? name.name.toLowerCase() : "";
      const isDocumentHead = tag === "head" && parentTag === "html";
      const insideHead = insideDocumentHead || isDocumentHead;
      const isSvg = insideSvg || tag === "svg";
      const childrenInSvg = isSvg && tag !== "foreignobject";

      if (isDocumentHead) this.documentHeadNodes.add(node);
      if (insideHead) this.documentHeadContentNodes.add(node);
      if (isSvg) this.svgDescendants.add(node);

      // JSX nested inside an attribute expression is a separate render root.
      for (const attribute of getNodeArray(opening!, "attributes")) {
        forEachChild(attribute, (child) =>
          this.collectSpecialContexts(child, null, false, false),
        );
      }

      for (const child of getNodeArray(node, "children")) {
        this.collectSpecialContexts(child, tag, insideHead, childrenInSvg);
      }
      return;
    }

    forEachChild(node, (child) =>
      this.collectSpecialContexts(child, parentTag, insideDocumentHead, insideSvg),
    );
  }

  private isHoistableHeadElement(node: Node, tag: string): boolean {
    if (tag !== "title" && tag !== "meta" && tag !== "link") return false;
    if (this.svgDescendants.has(node) || this.documentHeadContentNodes.has(node)) return false;

    const opening = getChild(node, "openingElement");
    if (!opening) return false;
    return !getNodeArray(opening, "attributes").some((attribute) => {
      if (!isJSXAttribute(attribute)) return false;
      const name = getNodeProperty(attribute, "name");
      return isNode(name) && getJSXAttributeName(name).toLowerCase() === "itemprop";
    });
  }

  transform(program: Node): VynnSsrTransformResult {
    // Match the client compiler's module boundary: files without JSX are not
    // component-transformed. Wrapping PascalCase utilities in those modules
    // would introduce server-only owners and shift async hydration IDs.
    if (!this.containsJsx(program)) return { code: this.source, map: null };

    this.collectJsxReturningFunctions(program);
    this.collectSpecialContexts(program);
    const replacements: Replacement[] = [];
    this.collectReplacements(program, replacements);
    if (replacements.length === 0) return { code: this.source, map: null };

    let code = this.applyReplacements(this.source, replacements);
    if (this.helpers.size > 0) {
      const imports = this.createRuntimeImport();
      const insertion = this.getImportInsertionOffset(program);
      const prefix = insertion > 0 && code[insertion - 1] !== "\n" ? "\n" : "";
      code = code.slice(0, insertion) + prefix + imports + code.slice(insertion);
    }

    return { code, map: null };
  }

  private helper(name: SsrHelper): string {
    this.helpers.add(name);
    const existing = this.aliases.get(name);
    if (existing) return existing;

    const base = `_vynn${name.slice(1).replace(/^./, (character) => character.toUpperCase())}`;
    let alias = base;
    let suffix = 1;
    while (new RegExp(`\\b${alias}\\b`).test(this.source)) alias = `${base}${suffix++}`;

    this.aliases.set(name, alias);
    return alias;
  }

  private createRuntimeImport(): string {
    const specifiers = [...this.helpers]
      .map((name) => `${name} as ${this.aliases.get(name)}`)
      .join(", ");
    return `import { ${specifiers} } from ${quote(runtimeSource)};\n`;
  }

  private getImportInsertionOffset(program: Node): number {
    const body = getNodeArray(program, "body");
    let insertion = 0;

    for (const statement of body) {
      if (!isType(statement, "ExpressionStatement")) break;
      const expression = getChild(statement, "expression");
      if (!expression || !isLiteralString(expression)) break;
      insertion = getNodeEnd(statement);
    }

    return insertion;
  }

  private collectReplacements(node: Node, replacements: Replacement[]): void {
    if (isJSXElement(node) || isJSXFragment(node)) {
      replacements.push({
        start: getNodeStart(node),
        end: getNodeEnd(node),
        value: this.renderJsx(node, false),
      });
      return;
    }

    if (isType(node, "FunctionDeclaration")) {
      const id = getChild(node, "id");
      const body = getChild(node, "body");
      if (
        id &&
        isIdentifier(id) &&
        /^[A-Z]/.test(id.name) &&
        body
      ) {
        replacements.push({
          start: getNodeEnd(node),
          end: getNodeEnd(node),
          value: `\n${id.name} = ${this.helper("$ssrComponent")}(${id.name});\n`,
        });
      }
    }

    if (isType(node, "VariableDeclarator")) {
      const id = getChild(node, "id");
      const init = getChild(node, "init");
      if (
        id &&
        isIdentifier(id) &&
        /^[A-Z]/.test(id.name) &&
        init &&
        (isType(init, "ArrowFunctionExpression") || isType(init, "FunctionExpression"))
      ) {
        replacements.push(
          {
            start: getNodeStart(init),
            end: getNodeStart(init),
            value: `${this.helper("$ssrComponent")}(`,
          },
          {
            start: getNodeEnd(init),
            end: getNodeEnd(init),
            value: ")",
          },
        );
      }
    }

    if (isType(node, "ExportDefaultDeclaration")) {
      const declaration = getChild(node, "declaration");
      if (
        declaration &&
        (isType(declaration, "ArrowFunctionExpression") ||
          isType(declaration, "FunctionExpression") ||
          (isType(declaration, "FunctionDeclaration") &&
            !getChild(declaration, "id") &&
            !!getChild(declaration, "body")))) {
        replacements.push(
          {
            start: getNodeStart(declaration),
            end: getNodeStart(declaration),
            value: `${this.helper("$ssrComponent")}(`,
          },
          {
            start: getNodeEnd(declaration),
            end: getNodeEnd(declaration),
            value: ")",
          },
        );
      }
    }

    forEachChild(node, (child) => this.collectReplacements(child, replacements));
  }

  private applyReplacements(source: string, replacements: Replacement[]): string {
    let output = source;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      output =
        output.slice(0, replacement.start) +
        replacement.value +
        output.slice(replacement.end);
    }
    return output;
  }

  private renderExpression(node: Node): string {
    if (isJSXElement(node) || isJSXFragment(node)) return this.renderJsx(node, false);

    const replacements: Replacement[] = [];
    forEachChild(node, (child) => this.collectReplacements(child, replacements));
    if (replacements.length === 0) {
      return this.source.slice(getNodeStart(node), getNodeEnd(node));
    }

    const start = getNodeStart(node);
    const end = getNodeEnd(node);
    const original = this.source.slice(start, end);
    return this.applyReplacements(
      original,
      replacements.map((replacement) => ({
        ...replacement,
        start: replacement.start - start,
        end: replacement.end - start,
      })),
    );
  }

  private containsJsx(node: Node): boolean {
    if (isJSXElement(node) || isJSXFragment(node)) return true;
    for (const key of getVisitorKeys(node)) {
      const value = getNodeProperty(node, key);
      if (Array.isArray(value)) {
        if (value.some((child) => isNode(child) && this.containsJsx(child))) return true;
      } else if (isNode(value) && this.containsJsx(value)) {
        return true;
      }
    }
    return false;
  }

  private isChildrenProperty(node: Node): boolean {
    if (!isType(node, "MemberExpression")) return false;
    const property = getChild(node, "property");
    return (
      (!!property && isIdentifier(property) && property.name === "children") ||
      (!!property && isLiteralString(property) && property.value === "children")
    );
  }

  private isComponentCall(node: Node): boolean {
    if (!isType(node, "CallExpression")) return false;
    const callee = getChild(node, "callee");
    if (callee && isIdentifier(callee)) {
      return /^[A-Z]/.test(callee.name) || this.jsxReturningFunctions.has(callee.name);
    }
    if (callee && isType(callee, "MemberExpression")) {
      const property = getChild(callee, "property");
      return (
        !!property &&
        isIdentifier(property) &&
        (/^[A-Z]/.test(property.name) || this.jsxReturningFunctions.has(property.name))
      );
    }
    return false;
  }



  private renderChildExpression(node: Node, svg: boolean, defer = true): string {
    if (isJSXElement(node) || isJSXFragment(node)) return this.renderJsx(node, svg);

    if (isType(node, "ConditionalExpression")) {
      const test = getChild(node, "test");
      const consequent = getChild(node, "consequent");
      const alternate = getChild(node, "alternate");
      if (!test || !consequent || !alternate) {
        return this.callHelper("$ssrText", `() => ${this.renderExpression(node)}, ${defer ? "true" : "false"}`);
      }
      const expression =
        `(${this.renderExpression(test)} ? ${this.renderChildExpression(consequent, svg, defer)} : ${this.renderChildExpression(alternate, svg, defer)})`;
      return this.callHelper("$ssrJoin", `() => ${expression}, ${defer ? "true" : "false"}`);
    }

    if (isType(node, "LogicalExpression")) {
      const left = getChild(node, "left");
      const right = getChild(node, "right");
      const operator = getNodeProperty(node, "operator");
      if (
        left &&
        right &&
        (operator === "&&" || operator === "||" || operator === "??")
      ) {
        return this.callHelper(
          "$ssrLogical",
          `() => ${this.renderExpression(left)}, ${quote(operator)}, () => ${this.renderChildExpression(right, svg, defer)}, ${this.isChildrenProperty(left) ? "true" : "false"}, ${defer ? "true" : "false"}`,
        );
      }
    }

    if (this.isChildrenProperty(node) || this.isComponentCall(node)) {
      return this.callHelper("$ssrJoin", `() => ${this.renderExpression(node)}, ${defer ? "true" : "false"}`);
    }

    if (this.containsJsx(node)) {
      return this.callHelper("$ssrJoin", `() => ${this.renderExpression(node)}, ${defer ? "true" : "false"}`);
    }

    return this.callHelper("$ssrText", `() => ${this.renderExpression(node)}, ${defer ? "true" : "false"}`);
  }

  private callHelper(name: SsrHelper, argumentsSource: string): string {
    return `${this.helper(name)}(${argumentsSource})`;
  }

  private renderChildren(
    children: Node[],
    svg: boolean,
    cursor: ChildSlotCursor = { next: 0 },
    parentTag: string | null = null,
  ): string {
    const parts: string[] = [];
    const rawTextContext = parentTag === "script" || parentTag === "style";
    const textOnlyContext =
      parentTag === "title" ||
      parentTag === "textarea" ||
      rawTextContext ||
      parentTag === "noscript";
    const deferDynamicChild = !textOnlyContext;
    const needsTemplateAnchor = parentTag !== null && !textOnlyContext;

    const appendPart = (value: string, _textish: boolean): void => {
      // Adjacent static text descriptors are merged by the client compiler.
      // Let the HTML parser merge equivalent SSR text runs, too. Injecting
      // separator comments creates extra Text nodes and shifts hydration claims.
      // Dynamic children/components already emit their own $v anchors.
      parts.push(value);
    };

    const addDynamicSlot = (value: string): void => {
      appendPart(value, true);

      if (needsTemplateAnchor) {
        const slot = cursor.next++;
        // Keep the persistent client hydration anchor as its own child.
        // The join helper must see it separately so it can avoid inserting an
        // extra text separator after this dynamic slot.
        appendPart(quote("<!--$v" + slot + "-->"), false);
      }
    };

    const flattenedChildren: Node[] = [];
    const flatten = (child: Node): void => {
      if (isJSXFragment(child)) {
        for (const nested of getNodeArray(child, "children")) flatten(nested);
      } else {
        flattenedChildren.push(child);
      }
    };
    for (const child of children) flatten(child);

    for (const child of flattenedChildren) {
      if (isJSXText(child)) {
        const value = normalizeJSXText(child.value);
        if (value) {
          const serialized = rawTextContext
            ? escapeRawTextStatic(value, parentTag as "script" | "style")
            : escapeStatic(value);
          appendPart(quote(serialized), true);
        }
        continue;
      }

      if (isJSXExpressionContainer(child)) {
        const expression = getChild(child, "expression");
        if (!expression || isJSXEmptyExpression(expression)) continue;

        if (isType(expression, "Literal")) {
          if (typeof expression.value === "string" || typeof expression.value === "number") {
            const value = String(expression.value);
            if (rawTextContext) {
              appendPart(
                quote(escapeRawTextStatic(value, parentTag as "script" | "style")),
                true,
              );
            } else {
              appendPart(value === "" ? quote("<!--$0-->") : quote(escapeStatic(value)), true);
            }
            continue;
          }
        }

        if (rawTextContext) {
          if (this.containsJsx(expression) || this.isComponentCall(expression)) {
            throw new Error(
              "[Vynn SSR compiler] JSX components cannot be inserted into <" + parentTag + "> raw text.",
            );
          }
          appendPart(
            this.callHelper(
              "$ssrJoin",
              `() => ${this.renderExpression(expression)}, false, ${quote(parentTag as "script" | "style")}`,
            ),
            true,
          );
        } else {
          addDynamicSlot(
            this.renderChildExpression(expression, svg, deferDynamicChild),
          );
        }
        continue;
      }

      if (isJSXElement(child)) {
        if (rawTextContext) {
          throw new Error(
            "[Vynn SSR compiler] JSX elements cannot be nested inside <" + parentTag + "> raw text.",
          );
        }
        const opening = getChild(child, "openingElement");
        const name = opening ? getChild(opening, "name") : null;
        if (name && isComponentName(name)) {
          const component = this.renderJsx(child, svg);
          const normalized = this.callHelper(
            "$ssrJoin",
            `() => ${component}, ${deferDynamicChild ? "true" : "false"}`,
          );
          addDynamicSlot(normalized);
        } else {
          appendPart(
            this.renderJsx(child, svg, parentTag === null ? undefined : cursor),
            false,
          );
        }
      }
    }

    if (parts.length === 0) return '""';
    if (parts.length === 1) return parts[0];
    if (textOnlyContext) return `(${parts.join(" + ")})`;
    return this.callHelper("$ssrJoinChildren", `[${parts.join(", ")}]`);
  }
  private renderHeadChildren(children: Node[]): string {
    const parts: string[] = [];
    const collect = (child: Node): void => {
      if (isJSXText(child)) {
        const value = normalizeJSXText(child.value);
        if (value) parts.push(quote(value));
        return;
      }
      if (isJSXExpressionContainer(child)) {
        const expression = getChild(child, "expression");
        if (expression && !isJSXEmptyExpression(expression)) {
          parts.push(this.renderExpression(expression));
        }
        return;
      }
      if (isJSXFragment(child)) {
        for (const nested of getNodeArray(child, "children")) collect(nested);
        return;
      }
      if (isJSXElement(child)) {
        const opening = getChild(child, "openingElement");
        const name = opening ? getChild(opening, "name") : null;
        if (name && isComponentName(name)) {
          parts.push(this.renderJsx(child, false));
        } else {
          for (const nested of getNodeArray(child, "children")) collect(nested);
        }
      }
    };
    for (const child of children) collect(child);
    return "[" + parts.join(", ") + "]";
  }

  private renderHeadElement(node: Node, tag: string): string {
    const opening = getChild(node, "openingElement");
    if (!opening) throw new Error("[Vynn SSR compiler] Invalid head metadata element.");
    const properties: string[] = [];

    for (const attribute of getNodeArray(opening, "attributes")) {
      if (isJSXSpreadAttribute(attribute)) {
        const argument = getChild(attribute, "argument");
        if (argument) properties.push("..." + this.renderExpression(argument));
        continue;
      }
      if (!isJSXAttribute(attribute)) continue;
      const attributeName = getNodeProperty(attribute, "name");
      if (!isNode(attributeName)) continue;
      const key = getJSXAttributeName(attributeName);
      if (key === "ref") continue;
      const value = getChild(attribute, "value");
      if (!value) {
        properties.push("get " + propertyKey(key) + "() { return true; }");
      } else if (isLiteralString(value)) {
        properties.push("get " + propertyKey(key) + "() { return " + quote(value.value) + "; }");
      } else if (isJSXExpressionContainer(value)) {
        const expression = getChild(value, "expression");
        if (expression && !isJSXEmptyExpression(expression)) {
          properties.push("get " + propertyKey(key) + "() { return " + this.renderExpression(expression) + "; }");
        }
      }
    }

    const children = getNodeArray(node, "children");
    if (tag === "title" && children.length > 0) {
      properties.push("get children() { return " + this.renderHeadChildren(children) + "; }");
    }
    return this.callHelper("$ssrHead", quote(tag) + ", { " + properties.join(", ") + " }");
  }

  private renderHeadGroup(node: Node): string {
    const entries: string[] = [];
    const collect = (child: Node): void => {
      if (isJSXText(child)) return;
      if (isJSXFragment(child)) {
        for (const nested of getNodeArray(child, "children")) collect(nested);
        return;
      }
      if (isJSXExpressionContainer(child)) {
        const expression = getChild(child, "expression");
        if (expression && !isJSXEmptyExpression(expression)) entries.push(this.renderExpression(expression));
        return;
      }
      if (!isJSXElement(child)) return;
      const opening = getChild(child, "openingElement");
      const name = opening ? getChild(opening, "name") : null;
      if (!name) return;
      if (isComponentName(name)) {
        entries.push(this.renderJsx(child, false));
        return;
      }
      const tag = isJSXIdentifier(name) ? name.name.toLowerCase() : "";
      if (this.isHoistableHeadElement(child, tag)) {
        entries.push(this.renderHeadElement(child, tag));
        return;
      }
      throw new Error("[Vynn SSR compiler] A nested <head> group only accepts <title>, <meta>, <link>, fragments, and components. Received <" + tag + " />.");
    };
    for (const child of getNodeArray(node, "children")) collect(child);
    return this.callHelper("$ssrHeadGroup", "() => [" + entries.join(", ") + "]");
  }
  private renderComponent(node: Node): string {
    const opening = getChild(node, "openingElement");
    if (!opening) throw new Error("[Vynn SSR compiler] Invalid JSX component.");

    const name = getChild(opening, "name");
    if (!name) throw new Error("[Vynn SSR compiler] Missing JSX component name.");

    const properties: string[] = [];
    const attributes = getNodeArray(opening, "attributes");

    for (const attribute of attributes) {
      if (isJSXSpreadAttribute(attribute)) {
        const argument = getChild(attribute, "argument");
        if (argument) properties.push(`...${this.renderExpression(argument)}`);
        continue;
      }

      if (!isJSXAttribute(attribute)) continue;
      const attributeName = getNodeProperty(attribute, "name");
      if (!isNode(attributeName)) continue;
      const key = getJSXAttributeName(attributeName);
      if (key === "ref") continue;
      const value = getChild(attribute, "value");

      if (!value) {
        properties.push(`get ${propertyKey(key)}() { return true; }`);
      } else if (isLiteralString(value)) {
        const literal =
          key === "children"
            ? this.callHelper("$ssrText", quote(value.value))
            : quote(value.value);
        const child =
          key === "children"
            ? this.callHelper("$ssrChildren", `() => ${literal}`)
            : literal;
        properties.push(`get ${propertyKey(key)}() { return ${child}; }`);
      } else if (isJSXExpressionContainer(value)) {
        const expression = getChild(value, "expression");
        if (expression && !isJSXEmptyExpression(expression)) {
          const child =
            key === "children"
              ? this.callHelper(
                  "$ssrChildren",
                  `() => ${this.renderChildExpression(expression, false)}`,
                )
              : this.renderExpression(expression);
          properties.push(`get ${propertyKey(key)}() { return ${child}; }`);
        }
      }
    }

    const children = getNodeArray(node, "children");
    if (children.length > 0) {
      const child = this.callHelper(
        "$ssrChildren",
        `() => ${this.renderChildren(children, false)}`,
      );
      properties.push(`get children() { return ${child}; }`);
    }

    return `${renderTagName(name)}({ ${properties.join(", ")} })`;
  }

  private renderHostElement(node: Node, svg: boolean, parentCursor?: ChildSlotCursor): string {
    const opening = getChild(node, "openingElement");
    if (!opening) throw new Error("[Vynn SSR compiler] Invalid JSX host element.");

    const name = getChild(opening, "name");
    if (!name || !isJSXIdentifier(name)) {
      throw new Error("[Vynn SSR compiler] Intrinsic JSX tags must use simple identifiers.");
    }

    const tag = name.name;
    const tagLower = tag.toLowerCase();

    if (tagLower === "head" && !this.documentHeadNodes.has(node)) {
      return this.renderHeadGroup(node);
    }

    if (this.isHoistableHeadElement(node, tagLower)) {
      return this.renderHeadElement(node, tagLower);
    }

    const currentSvg = svg || tagLower === "svg";
    const childSvg = currentSvg && tagLower !== "foreignobject";
    const openingParts = [quote(`<${tag}`)];
    let rawHtml: string | null = null;

    for (const attribute of getNodeArray(opening, "attributes")) {
      if (isJSXSpreadAttribute(attribute)) {
        const argument = getChild(attribute, "argument");
        if (argument) {
          openingParts.push(
            this.callHelper(
              "$ssrSpread",
              `() => ${this.renderExpression(argument)}, ${currentSvg ? "true" : "false"}`,
            ),
          );
        }
        continue;
      }

      if (!isJSXAttribute(attribute)) continue;
      const attributeName = getNodeProperty(attribute, "name");
      if (!isNode(attributeName)) continue;
      const key = getJSXAttributeName(attributeName);

      if (key === "ref" || key === "key" || isEventAttribute(key)) continue;

      const value = getChild(attribute, "value");
      if (key === "html") {
        // Presence of the html prop makes this host's descendants opaque to
        // hydration, even when the expression currently resolves to null.
        rawHtml = '""';
        if (isLiteralString(value)) {
          rawHtml = this.callHelper("$ssrRaw", quote(value.value));
        } else if (isJSXExpressionContainer(value)) {
          const expression = getChild(value, "expression");
          if (expression && !isJSXEmptyExpression(expression)) {
            rawHtml = this.callHelper("$ssrRaw", `() => ${this.renderExpression(expression)}`);
          }
        }
        continue;
      }

      if (!value) {
        openingParts.push(quote(staticAttribute(key, true, currentSvg)));
      } else if (isLiteralString(value)) {
        openingParts.push(quote(staticAttribute(key, value.value, currentSvg)));
      } else if (isJSXExpressionContainer(value)) {
        const expression = getChild(value, "expression");
        if (!expression || isJSXEmptyExpression(expression)) continue;
        openingParts.push(
          this.callHelper(
            "$ssrAttribute",
            `${quote(key)}, () => ${this.renderExpression(expression)}, ${currentSvg ? "true" : "false"}`,
          ),
        );
      }
    }

    const isVoidElement = voidElements.has(tagLower);
    if (!isVoidElement && rawHtml !== null) {
      openingParts.push(quote(' data-vynn-raw-html=""'));
    }
    openingParts.push(quote(">"));
    const openingMarkup = `(${openingParts.join(" + ")})`;
    if (isVoidElement) return openingMarkup;

    const children = getNodeArray(node, "children");
    if (rawHtml !== null && children.length > 0) {
      throw new Error("[Vynn SSR compiler] An element cannot have both the html prop and JSX children.");
    }

    const cursor = parentCursor ?? { next: 0 };
    const content = rawHtml ?? this.renderChildren(children, childSvg, cursor, tagLower);
    const closingMarkup = quote(`</${tag}>`);
    return `(${openingMarkup} + ${content} + ${closingMarkup})`;
  }

  private renderJsx(node: Node, svg: boolean, cursor?: ChildSlotCursor): string {
    if (isJSXFragment(node)) {
      return this.renderChildren(getNodeArray(node, "children"), svg, cursor);
    }

    if (!isJSXElement(node)) {
      throw new Error("[Vynn SSR compiler] Expected a JSX element or fragment.");
    }

    const opening = getChild(node, "openingElement");
    const name = opening ? getChild(opening, "name") : null;
    if (!name) throw new Error("[Vynn SSR compiler] Missing JSX tag name.");

    return isComponentName(name)
      ? this.renderComponent(node)
      : this.renderHostElement(node, svg, cursor);
  }
}

/** Transform Vynn JSX into independent SSR string expressions. */
export function transformVynnSsr(
  source: string,
  filename = "module.tsx",
  options: VynnSsrCompilerOptions = {},
): string {
  return transformVynnSsrWithMap(source, filename, options).code;
}

/** Transform Vynn JSX and return generated code plus its source map, when available. */
export function transformVynnSsrWithMap(
  source: string,
  filename = "module.tsx",
  options: VynnSsrCompilerOptions = {},
): VynnSsrTransformResult {
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
    const messages = fatal.map((error) => error.message).join("\n");
    throw new Error(`Oxc failed to parse ${filename}:\n${messages}`);
  }

  const program = parsed.program as unknown as Node;
  if (!isNode(program) || program.type !== "Program") {
    throw new Error(`Oxc returned an invalid program for ${filename}.`);
  }
  addSourceLocations(program, source);
  const result = new SsrTransform(source).transform(program);

  if (options.sourceType === "script" && result.code.includes(`from "${runtimeSource}"`)) {
    throw new Error("[Vynn SSR compiler] JSX output requires an ES module because it imports SSR helpers.");
  }

  return result;
}
