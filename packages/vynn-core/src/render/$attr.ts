import type { SSR_ELEMENT } from "./resolve-node";

import { isHydrationClaimActive } from "../client/hydration";
import { diagnoseHydrationAttribute } from "../client/hydration-diagnostics";
import { isServer } from "../context/is-server-context";
import { $renderEffect } from "../reactivity/$effect";
import { HTML_NAMESPACE, SVG_NAMESPACE } from "./namespace";

export type AttributeValue = string | number | boolean | Partial<CSSStyleDeclaration> | null | undefined;

const rawHTMLContentElements = new WeakSet<Element>();

export function hasRawHTMLContent(element: Element): boolean {
  return rawHTMLContentElements.has(element);
}

const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

// DOM properties that should be assigned directly on HTML elements.
const properties = new Set([
  "value",
  "checked",
  "selected",
  "disabled",
  "multiple",
  "required",
  "readOnly",
  "muted",
  "indeterminate",
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

// SVG uses kebab-case for most presentation attributes, but a small set of
// standardized names intentionally retain internal capitals.
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

function getSVGAttributeName(name: string): string {
  const alias = svgAttributeAliases[name];
  if (alias) return alias;
  if (preservedSvgAttributeNames.has(name)) return name;

  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function getAttributeName(namespaceURI: string | null, name: string): string {
  if (namespaceURI === SVG_NAMESPACE) {
    return getSVGAttributeName(name);
  }

  if (name === "className") return "class";
  if (name === "htmlFor") return "for";

  return name.toLowerCase();
}

function getAttributeNamespace(name: string): string | null {
  if (name.startsWith("xlink:")) return XLINK_NAMESPACE;
  if (name.startsWith("xml:")) return XML_NAMESPACE;
  if (name === "xmlns" || name.startsWith("xmlns:")) return XMLNS_NAMESPACE;
  return null;
}

function setDOMAttribute(element: Element, name: string, value: string): void {
  const namespace = getAttributeNamespace(name);

  if (namespace) {
    element.setAttributeNS(namespace, name, value);
  } else {
    element.setAttribute(name, value);
  }
}

function removeDOMAttribute(element: Element, name: string): void {
  const namespace = getAttributeNamespace(name);

  if (namespace) {
    const separator = name.indexOf(":");
    element.removeAttributeNS(namespace, separator === -1 ? name : name.slice(separator + 1));
  } else {
    element.removeAttribute(name);
  }
}

/** Converts a style prop into a CSS declaration string for SSR and hydration. */
export function serializeStyleValue(value: AttributeValue): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);

  const declarations: string[] = [];

  for (const [property, rawValue] of Object.entries(value)) {
    if (rawValue == null || rawValue === "") continue;

    const name = property === "cssFloat"
      ? "float"
      : property.startsWith("--")
        ? property
        : property.replace(/[A-Z]/g, (character) => "-" + character.toLowerCase())
            .replace(/^ms-/, "-ms-");

    declarations.push(name + ":" + String(rawValue).trim());
  }

  return declarations.join(";");
}

/**
 * Applies one DOM attribute synchronously.
 *
 * This is shared by direct JSX attributes and spread props so spreads do not
 * need to create a new reactive effect for every property on every update.
 */
export function setDOMAttributeValue<E extends Element>(
  element: E,
  name: string,
  next: AttributeValue,
): void {
  if (isServer()) {
    const node = element as unknown as SSR_ELEMENT;

    if (name === "html") {
      if (next == null) {
        delete node.innerHTML;
      } else {
        if (node.children.length > 0) {
          throw new Error("[vynn]: An element cannot have both the html prop and children.");
        }

        node.innerHTML = String(next);
      }
      return;
    }

    const key = getAttributeName(node.namespaceURI, name);

    if (next == null) {
      delete node.attributes[key];
    } else if (key === "style") {
      node.attributes[key] = serializeStyleValue(next);
    } else if (node.namespaceURI === HTML_NAMESPACE && booleanAttributes.has(key.toLowerCase())) {
      if (next) {
        node.attributes[key] = "";
      } else {
        delete node.attributes[key];
      }
    } else {
      node.attributes[key] = String(next);
    }
    return;
  }

  if (name === "html") {
    if (
      next != null &&
      !rawHTMLContentElements.has(element) &&
      !isHydrationClaimActive() &&
      element.childNodes.length > 0
    ) {
      throw new Error("[vynn]: An element cannot have both the html prop and children.");
    }

    const html = next == null ? "" : String(next);
    if (element.innerHTML !== html) element.innerHTML = html;

    if (next == null) {
      rawHTMLContentElements.delete(element);
    } else {
      rawHTMLContentElements.add(element);
    }
    return;
  }

  const attributeName = getAttributeName(element.namespaceURI, name);
  const isHtmlElement = element.namespaceURI === HTML_NAMESPACE && element instanceof HTMLElement;

  if (name === "style") {
    const styleValue = serializeStyleValue(next);
    const style = "style" in element ? (element as HTMLElement | SVGElement).style : undefined;

    if (style) style.cssText = styleValue;
    if (next == null) {
      removeDOMAttribute(element, attributeName);
    } else {
      setDOMAttribute(element, attributeName, styleValue);
    }
    return;
  }

  if (isHtmlElement && properties.has(name) && !booleanAttributes.has(name.toLowerCase())) {
    Reflect.set(element, name, next);

    if (next == null) {
      removeDOMAttribute(element, attributeName);
    } else {
      setDOMAttribute(element, attributeName, String(next));
    }
    return;
  }

  if (next == null) {
    removeDOMAttribute(element, attributeName);
    return;
  }

  if (isHtmlElement && typeof next === "boolean") {
    (element as HTMLElement).toggleAttribute(attributeName, next);
    return;
  }

  setDOMAttribute(element, attributeName, String(next));
}


/**
 * Sets a reactive DOM attribute or property.
 *
 * Attribute updates run in the render phase so DOM state is synchronized with
 * the reactive transaction that produced it.
 */
export function $attr<E extends Element>(
  element: E,
  name: string,
  value: AttributeValue | (() => AttributeValue),
): void {
  if (isServer()) {
    const next = typeof value === "function" ? value() : value;
    setDOMAttributeValue(element, name, next);
    return;
  }

  const hydrating = isHydrationClaimActive();
  let initial = true;

  $renderEffect(() => {
    const next = typeof value === "function" ? value() : value;

    if (initial) {
      initial = false;

      if (hydrating && name !== "html") {
        const isHtmlElement =
          element.namespaceURI === HTML_NAMESPACE && element instanceof HTMLElement;
        const expectedValue =
          next == null || (isHtmlElement && typeof next === "boolean")
            ? next == null || !next
              ? null
              : ""
            : name === "style"
              ? serializeStyleValue(next)
              : String(next);

        diagnoseHydrationAttribute(element, getAttributeName(element.namespaceURI, name), expectedValue);
      }
    }

    setDOMAttributeValue(element, name, next);
  });
}
