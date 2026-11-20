import { $registerHead, $registerHeadGroup } from "../render/head-runtime";
import {
  createSsrChildren,
  isSsrChildren,
  renderSsrDynamicAttribute,
  renderSsrDynamicChild,
} from "../context/ssr-string-context";
import { assertSafeAttributeName } from "../render/attribute-name";
import { escapeHtml } from "../utils/escape-html";

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

function getAttributeName(name: string, svg: boolean): string {
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

function serializeStyle(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);

  const declarations: string[] = [];
  for (const [property, rawValue] of Object.entries(value)) {
    if (rawValue == null || rawValue === "") continue;
    const name =
      property === "cssFloat"
        ? "float"
        : property.startsWith("--")
          ? property
          : property
              .replace(/[A-Z]/g, (character) => "-" + character.toLowerCase())
              .replace(/^ms-/, "-ms-");
    declarations.push(name + ":" + String(rawValue).trim());
  }
  return declarations.join(";");
}

function isEventAttribute(name: string): boolean {
  return (
    name.length > 2 &&
    name.startsWith("on") &&
    name[2] === name[2].toUpperCase()
  );
}

function hasNoHtmlTags(value: string): boolean {
  // A pending child slot is replaced before its boundary patch reaches the
  // browser. Treat only those temporary markers as transparent. Persistent
  // hydration anchors such as <!--$v0--> must remain separators themselves.
  const withoutPendingSlotMarkers = value.replace(
    /<!--(?:s|\/s):\d+:\d+-->/g,
    "",
  );
  return !/<[^>]+>/.test(withoutPendingSlotMarkers);
}

/**
 * Join independently rendered JSX children while preserving adjacent text
 * nodes for the existing client hydration cursor.
 */
export function $ssrJoinChildren(parts: readonly string[]): string {
  let result = "";

  for (let index = 0; index < parts.length; index++) {
    const current = parts[index] ?? "";
    const next = parts[index + 1];

    result += current;

    if (current && next && hasNoHtmlTags(current) && hasNoHtmlTags(next)) {
      result += "<!--/-->";
    }
  }

  return result;
}

function escapeTextValue(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (isSsrChildren(value)) return joinMarkupValue(value());
  if (Array.isArray(value)) return value.map(escapeTextValue).join("");
  if (value === "") return "<!--$0-->";
  return escapeHtml(value);
}

function escapeRawText(value: string, tag: "script" | "style"): string {
  if (tag === "script") {
    return value.replace(/<\/script/gi, "<\\/script");
  }
  return value.replace(/</g, "\\3C ");
}

function joinMarkupValue(value: unknown, rawTextTag?: "script" | "style"): string {
  if (value == null || typeof value === "boolean") return "";
  if (isSsrChildren(value)) return joinMarkupValue(value(), rawTextTag);
  if (Array.isArray(value)) {
    return value.map((item) => joinMarkupValue(item, rawTextTag)).join("");
  }
  const text = String(value);
  if (rawTextTag) return escapeRawText(text, rawTextTag);
  return text === "" ? "<!--$0-->" : text;
}

/** Create lazily evaluated component children bound to their creating owner. */
export function $ssrChildren(render: () => unknown): () => unknown {
  return createSsrChildren(render);
}

/** Escape a dynamic JSX text child. A thunk becomes an independently retryable SSR slot. */
export function $ssrText(value: unknown, defer = true): string {
  if (typeof value === "function") {
    const render = () => escapeTextValue((value as () => unknown)());
    return defer ? renderSsrDynamicChild(render) : render();
  }
  return escapeTextValue(value);
}

/** Join already-compiled JSX results, or evaluate the expression in a retryable slot. */
export function $ssrJoin(
  value: unknown,
  defer = true,
  rawTextTag?: "script" | "style",
): string {
  if (typeof value === "function") {
    const render = () => joinMarkupValue((value as () => unknown)(), rawTextTag);
    return defer ? renderSsrDynamicChild(render) : render();
  }
  return joinMarkupValue(value, rawTextTag);
}

/** Preserve JavaScript short-circuit child semantics while escaping text operands. */
export function $ssrLogical(
  left: unknown,
  operator: "&&" | "||" | "??",
  right: () => unknown,
  leftIsHtml = false,
  defer = true,
): string {
  const render = () => {
    const value = typeof left === "function" ? (left as () => unknown)() : left;
    const renderLeft = () => (leftIsHtml ? joinMarkupValue(value) : escapeTextValue(value));

    if (operator === "&&") {
      return value ? joinMarkupValue(right()) : renderLeft();
    }
    if (operator === "||") {
      return value ? renderLeft() : joinMarkupValue(right());
    }
    return value == null ? joinMarkupValue(right()) : renderLeft();
  };
  return defer ? renderSsrDynamicChild(render) : render();
}

function serializeAttribute(name: string, value: unknown, svg: boolean): string {
  if (name === "key" || name === "children" || name === "ref" || name === "html") return "";
  if (isEventAttribute(name)) return "";

  assertSafeAttributeName(name);
  if (value == null) return "";

  const attributeName = getAttributeName(name, svg);
  if (!attributeName) return "";

  if (!svg && booleanAttributes.has(attributeName.toLowerCase())) {
    return value ? ` ${attributeName}=""` : "";
  }

  const serialized =
    attributeName === "style" ? serializeStyle(value) : String(value);
  return ` ${attributeName}="${escapeHtml(serialized)}"`;
}

/** Serialize one JSX attribute, including its leading space. */
export function $ssrAttribute(name: string, value: unknown, svg = false): string {
  if (typeof value === "function") {
    return renderSsrDynamicAttribute(() =>
      serializeAttribute(name, (value as () => unknown)(), svg),
    );
  }
  return serializeAttribute(name, value, svg);
}

function serializeSpread(value: unknown, svg: boolean): string {
  if (value == null || typeof value !== "object") return "";

  let result = "";
  for (const [name, rawValue] of Object.entries(value)) {
    if (
      name === "key" ||
      name === "children" ||
      name === "ref" ||
      name === "html" ||
      isEventAttribute(name)
    ) {
      continue;
    }
    const next = typeof rawValue === "function" ? rawValue() : rawValue;
    result += serializeAttribute(name, next, svg);
  }
  return result;
}

/** Serialize host attributes supplied through a JSX spread. */
export function $ssrSpread(value: unknown, svg = false): string {
  return renderSsrDynamicAttribute(() =>
    serializeSpread(typeof value === "function" ? (value as () => unknown)() : value, svg),
  );
}

/** Insert explicitly authored raw HTML. The caller is responsible for sanitizing it. */
export function $ssrRaw(value: unknown): string {
  if (typeof value === "function") {
    return renderSsrDynamicChild(() => {
      const html = (value as () => unknown)();
      return html == null ? "" : String(html);
    });
  }
  return value == null ? "" : String(value);
}

/** Whether an intrinsic HTML tag is a void element. */
export function isSsrVoidElement(tag: string): boolean {
  return voidElements.has(tag.toLowerCase());
}


/** Register document metadata without emitting it into the body string. */
export function $ssrHead(
  tag: "title" | "meta" | "link",
  props: Record<string, unknown>,
): null {
  $registerHead(tag, props);
  return null;
}

/** Register a nested head metadata group without emitting body markup. */
export function $ssrHeadGroup(render: () => unknown): null {
  $registerHeadGroup(render);
  return null;
}
