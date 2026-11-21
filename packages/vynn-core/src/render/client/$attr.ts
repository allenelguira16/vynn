import { claimHydrationText, isHydrationClaimActive } from "../../client/hydration";
import { diagnoseHydrationAttribute } from "../../client/hydration-diagnostics";
import { $renderEffect } from "../../reactivity/effect";
import { assertSafeAttributeName } from "../attribute-name";
import { booleanAttributes, getAttributeName, serializeStyleValue, type AttributeValue } from "../shared/attribute";
import { HTML_NAMESPACE } from "../namespace";

const rawHTMLContentElements = new WeakSet<Element>();
export function hasRawHTMLContent(element: Element): boolean { return rawHTMLContentElements.has(element); }

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



export function setDOMAttributeValue<E extends Element>(element: E, name: string, next: AttributeValue): void {
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

  if (
    isHtmlElement &&
    booleanAttributes.has(attributeName.toLowerCase()) &&
    typeof next === "boolean"
  ) {
    (element as HTMLElement).toggleAttribute(attributeName, next);
    return;
  }

  setDOMAttribute(element, attributeName, String(next));
}

export function $attr<E extends Element>(element: E, name: string, value: AttributeValue | (() => AttributeValue)): void {
  const hydrating = isHydrationClaimActive();
  let initial = true;

  $renderEffect(() => {
    const next = typeof value === "function" ? value() : value;

    if (initial) {
      initial = false;

      if (hydrating && name !== "html") {
        const isHtmlElement =
          element.namespaceURI === HTML_NAMESPACE && element instanceof HTMLElement;
        const attributeName = getAttributeName(element.namespaceURI, name);
        const isHtmlBooleanAttribute =
          isHtmlElement && booleanAttributes.has(attributeName.toLowerCase());
        const expectedValue =
          next == null
            ? null
            : isHtmlBooleanAttribute && typeof next === "boolean"
              ? next
                ? ""
                : null
              : name === "style"
                ? serializeStyleValue(next)
                : String(next);

        diagnoseHydrationAttribute(element, attributeName, expectedValue);
      }
    }

    setDOMAttributeValue(element, name, next);
  });
}