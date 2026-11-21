import { HTML_NAMESPACE, SVG_NAMESPACE } from "../namespace";



export type AttributeValue =
  | string
  | number
  | boolean
  | Partial<CSSStyleDeclaration>
  | null
  | undefined;



export const booleanAttributes = new Set([
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

function getSVGAttributeName(name: string): string {
  const alias = svgAttributeAliases[name];
  if (alias) return alias;
  if (preservedSvgAttributeNames.has(name)) return name;

  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function getAttributeName(namespaceURI: string | null, name: string): string {
  if (namespaceURI === SVG_NAMESPACE) {
    return getSVGAttributeName(name);
  }

  if (name === "className") return "class";
  if (name === "htmlFor") return "for";

  return name.toLowerCase();
}



/** Converts a style prop into a CSS declaration string for SSR and hydration. */
export function serializeStyleValue(value: AttributeValue): string {
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