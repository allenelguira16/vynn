import { $renderEffect } from "../reactivity/$effect";
import type { SSR_ELEMENT } from "./resolve-node";
import { isServer } from "../context/is-server-context";
import { HTML_NAMESPACE, SVG_NAMESPACE } from "./namespace";

type AttributeValue = string | number | boolean | null | undefined;

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

function getAttributeName(namespaceURI: string, name: string): string {
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
    element.removeAttributeNS(
      namespace,
      separator === -1 ? name : name.slice(separator + 1),
    );
  } else {
    element.removeAttribute(name);
  }
}

/**
 * Sets a reactive DOM attribute or property.
 *
 * HTML form-control properties retain their property behavior. SVG elements
 * receive namespace-aware attribute names, including presentation attributes
 * such as strokeWidth -> stroke-width and namespaced xlink/xml attributes.
 */
export function $attr<E extends Element>(
  element: E,
  name: string,
  value: AttributeValue | (() => AttributeValue),
): void {
  if (isServer()) {
    const node = element as unknown as SSR_ELEMENT;
    const key = getAttributeName(node.namespaceURI, name);
    const next = typeof value === "function" ? value() : value;

    if (next == null) {
      delete node.attributes[key];
    } else if (
      node.namespaceURI === HTML_NAMESPACE &&
      booleanAttributes.has(key.toLowerCase())
    ) {
      if (next) {
        node.attributes[key] = "";
      } else {
        delete node.attributes[key];
      }
    } else {
      // Preserve SVG's case-sensitive names and serialize non-HTML booleans
      // as values instead of treating them as HTML boolean attributes.
      node.attributes[key] = String(next);
    }
    return;
  }

  const attributeName = getAttributeName(element.namespaceURI, name);
  const isHtmlElement =
    element.namespaceURI === HTML_NAMESPACE &&
    element instanceof HTMLElement;

  $renderEffect(() => {
    const next = typeof value === "function" ? value() : value;

    if (
      isHtmlElement &&
      properties.has(name) &&
      !booleanAttributes.has(name.toLowerCase())
    ) {
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
  });
}
