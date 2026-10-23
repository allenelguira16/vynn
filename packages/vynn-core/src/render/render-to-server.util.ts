import { escapeHtml } from "../utils/escape-html";
import { SSR_ELEMENT } from "./resolve-node";

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

export function renderNode(props: {
  type: string;
  attributes: SSR_ELEMENT["attributes"];
  children: string;
}) {
  let attributes = Object.entries(props.attributes)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
  attributes = attributes ? ` ${attributes}` : "";

  if (voidElements.has(props.type)) {
    if (props.children.length > 0) {
      console.warn(
        `[vynn]: <${props.type}> is a void element and cannot have children therefore it will ignore the children`,
      );
    }

    return `<${props.type}${attributes}>`;
  } else {
    return `<${props.type}${attributes}>${props.children}</${props.type}>`;
  }
}

export function joinHTMLElements(html: string[]): string {
  const result: string[] = [];

  for (let i = 0; i < html.length; i++) {
    const current = html[i];
    const next = html[i + 1];

    result.push(current);

    if (current && next && hasNoHTMLTags(current) && hasNoHTMLTags(next)) {
      result.push("<!--vynn:separator-->");
    }
  }

  return result.join("");
}

export function hasNoHTMLTags(str: string) {
  // Matches anything inside <...>
  const htmlTagRegex = /<[^>]+>/g;
  return !htmlTagRegex.test(str);
}
