import { EMPTY_TEXT_SSR_MARKER } from "../const";
import {
  claimHydrationElement,
  claimHydrationText,
  isHydrationClaimActive,
} from "../client/hydration";
import {
  isHydrationElementCompatible,
  synchronizeHydrationText,
} from "../client/hydration-diagnostics";
import { isServer } from "../context/is-server-context";
import {
  getChildDOMNamespace,
  getElementNamespace,
  HTML_NAMESPACE,
  SVG_NAMESPACE,
  withDOMNamespace,
} from "./namespace";
import {
  createSSRComment,
  createSSRNode,
  createSSRText,
  SSR_COMMENT,
  SSR_ELEMENT,
  type SSR_NODE,
} from "./resolve-node";

type TemplateElementDescriptor = {
  kind: "element";
  tag: string;
  attributes: Array<[string, string]>;
  children: TemplateNodeDescriptor[];
};

type TemplateTextDescriptor = {
  kind: "text";
  value: string;
};

type TemplateAnchorDescriptor = {
  kind: "anchor";
  id: string;
};

type TemplateNodeDescriptor =
  | TemplateElementDescriptor
  | TemplateTextDescriptor
  | TemplateAnchorDescriptor;

type TemplateRuntimeNode = Node | SSR_NODE;

type TemplateBlueprint = {
  readonly steps: TemplateNodeDescriptor[];
  readonly indices: Map<TemplateNodeDescriptor, number>;
  readonly parents: Map<TemplateNodeDescriptor, TemplateElementDescriptor>;
};

type TemplateInstance = TemplateBlueprint & {
  readonly nodes: Map<TemplateNodeDescriptor, TemplateRuntimeNode>;
  readonly descriptors: WeakMap<object, TemplateNodeDescriptor>;
  cursor: number;
  hydrating: boolean;
};

type TemplateData = {
  descriptor: TemplateElementDescriptor;
  blueprint: TemplateBlueprint;
  template?: HTMLTemplateElement;
  documentRoot?: Element;
  simpleTag?: string;
};

const templateInstances = new WeakMap<object, TemplateInstance>();
const templateDataCache = new Map<string, TemplateData>();

function getTemplateAnchorMarker(id: string): string {
  return id.startsWith("start-")
    ? "$vs" + id.slice("start-".length)
    : "$v" + id;
}

function getTemplateAnchorId(value: string): string | undefined {
  const compact = /^\$v(s?)([A-Za-z0-9_-]+)$/.exec(value);
  if (compact) return (compact[1] ? "start-" : "") + compact[2];

  const legacy = /^vynn:slot:(start-)?([A-Za-z0-9_-]+)$/.exec(value);
  return legacy ? (legacy[1] ?? "") + legacy[2] : undefined;
}

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
  "param",
  "source",
  "track",
  "wbr",
]);

function normalizeTemplateTextAnchors(root: Node): void {
  const ownerDocument = root.ownerDocument ?? document;
  const walker = ownerDocument.createTreeWalker(root, 4);
  const textNodes: Text[] = [];
  let current: Node | null;

  while ((current = walker.nextNode())) {
    if (current.nodeType === 3) textNodes.push(current as Text);
  }

  const marker = /<!--(\$vs?[A-Za-z0-9_-]+|vynn:slot:(?:start-)?[A-Za-z0-9_-]+)-->/g;

  for (const text of textNodes) {
    const value = text.data;
    marker.lastIndex = 0;

    let match: RegExpExecArray | null;
    let offset = 0;
    let found = false;
    const replacement = ownerDocument.createDocumentFragment();

    while ((match = marker.exec(value))) {
      found = true;

      if (match.index > offset) {
        replacement.appendChild(
          ownerDocument.createTextNode(value.slice(offset, match.index)),
        );
      }

      replacement.appendChild(ownerDocument.createComment(match[1]));
      offset = match.index + match[0].length;
    }

    if (!found) continue;

    if (offset < value.length) {
      replacement.appendChild(ownerDocument.createTextNode(value.slice(offset)));
    }

    text.parentNode?.replaceChild(replacement, text);
  }
}

function getHeadDescriptorAttribute(
  descriptor: TemplateElementDescriptor,
  name: string,
): string | undefined {
  return descriptor.attributes.find(([attribute]) => attribute.toLowerCase() === name)?.[1];
}

function matchesHydrationHeadElement(
  descriptor: TemplateElementDescriptor,
  element: Element,
): boolean {
  if (descriptor.tag === "title") return element.localName === "title";
  if (element.localName !== descriptor.tag.toLowerCase()) return false;

  if (descriptor.tag === "meta") {
    for (const name of ["charset", "name", "property", "http-equiv"]) {
      const expected = getHeadDescriptorAttribute(descriptor, name);
      if (expected !== undefined) {
        return element.getAttribute(name)?.toLowerCase() === expected.toLowerCase();
      }
    }

    return true;
  }

  if (descriptor.tag === "link") {
    const rel = getHeadDescriptorAttribute(descriptor, "rel");
    if (rel !== undefined && element.getAttribute("rel")?.toLowerCase() !== rel.toLowerCase()) {
      return false;
    }

    const href = getHeadDescriptorAttribute(descriptor, "href");
    return href === undefined || element.getAttribute("href") === href;
  }

  return false;
}

function findHydrationHeadElement(
  start: Node | null,
  descriptor: TemplateElementDescriptor,
): Element | undefined {
  let current = start;

  while (current) {
    if (
      current.nodeType === 1 &&
      matchesHydrationHeadElement(descriptor, current as Element)
    ) {
      return current as Element;
    }

    current = current.nextSibling;
  }

  return undefined;
}

function ensureTitleHydrationSlots(
  descriptor: TemplateElementDescriptor,
  element: Element,
): void {
  const start = descriptor.children.find(
    (child): child is TemplateAnchorDescriptor =>
      child.kind === "anchor" && child.id.startsWith("start-"),
  );
  if (!start) return;

  const endId = start.id.slice("start-".length);
  const hasStart = Array.from(element.childNodes).some(
    (child) =>
      child.nodeType === 8 &&
      getTemplateAnchorId((child as Comment).data) === start.id,
  );
  const hasEnd = Array.from(element.childNodes).some(
    (child) =>
      child.nodeType === 8 &&
      getTemplateAnchorId((child as Comment).data) === endId,
  );
  if (hasStart && hasEnd) return;

  // A streamed or route-level title can replace the template's original
  // title markup before hydration. Recreate the template's static prefix and
  // slot boundaries, keeping that server title as the first dynamic value.
  const ownerDocument = element.ownerDocument;
  const serverText = element.textContent ?? "";
  const nodes: Node[] = [];
  let insertedServerText = false;

  for (const child of descriptor.children) {
    if (child.kind === "text") {
      nodes.push(ownerDocument.createTextNode(child.value));
      continue;
    }

    if (child.kind !== "anchor") continue;

    nodes.push(ownerDocument.createComment(getTemplateAnchorMarker(child.id)));

    if (child.id === start.id && !insertedServerText) {
      if (serverText) nodes.push(ownerDocument.createTextNode(serverText));
      insertedServerText = true;
    }
  }

  element.replaceChildren(...nodes);
}

function decodeStaticValue(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Parses the deliberately small HTML subset emitted by the JSX compiler.
 *
 * Template serialization excludes parser-sensitive contexts, escapes text and
 * attribute values, and emits only explicit quoted attributes. Keeping this
 * parser in the SSR runtime means the template factory needs only its markup.
 */
function parseServerTemplate(markup: string): TemplateElementDescriptor {
  const roots: TemplateNodeDescriptor[] = [];
  const stack: TemplateElementDescriptor[] = [];
  let offset = 0;

  const append = (node: TemplateNodeDescriptor): void => {
    const parent = stack.at(-1);
    (parent ? parent.children : roots).push(node);
  };

  while (offset < markup.length) {
    if (markup.startsWith("<!--", offset)) {
      const end = markup.indexOf("-->", offset + 4);
      if (end === -1) {
        throw new Error("[vynn]: Invalid comment in a compiled template.");
      }

      const value = markup.slice(offset + 4, end);
      const anchorId = getTemplateAnchorId(value);
      if (anchorId !== undefined) {
        append({ kind: "anchor", id: anchorId });
      } else if (value === EMPTY_TEXT_SSR_MARKER) {
        append({ kind: "text", value: "" });
      } else {
        throw new Error("[vynn]: Unsupported comment in a compiled template.");
      }

      offset = end + 3;
      continue;
    }

    if (markup[offset] === "<") {
      const end = markup.indexOf(">", offset + 1);
      if (end === -1) {
        throw new Error("[vynn]: Invalid tag in a compiled template.");
      }

      const token = markup.slice(offset + 1, end);
      if (token.startsWith("/")) {
        if (stack.length === 0) {
          throw new Error("[vynn]: Unexpected closing tag in a compiled template.");
        }
        stack.pop();
        offset = end + 1;
        continue;
      }

      const nameEnd = token.search(/[\s/]/);
      const tag = nameEnd === -1 ? token : token.slice(0, nameEnd);
      if (!tag) {
        throw new Error("[vynn]: Invalid element in a compiled template.");
      }

      const attributeSource = nameEnd === -1 ? "" : token.slice(nameEnd);
      const attributes: Array<[string, string]> = [];
      const attributePattern = /([^\s=/>]+)\s*=\s*"([^"]*)"/g;
      let attribute: RegExpExecArray | null;

      while ((attribute = attributePattern.exec(attributeSource))) {
        attributes.push([attribute[1], decodeStaticValue(attribute[2])]);
      }

      const element: TemplateElementDescriptor = {
        kind: "element",
        tag,
        attributes,
        children: [],
      };

      append(element);

      const selfClosing =
        attributeSource.trimEnd().endsWith("/") || voidElements.has(tag.toLowerCase());

      if (!selfClosing) stack.push(element);

      offset = end + 1;
      continue;
    }

    const end = markup.indexOf("<", offset);
    const textEnd = end === -1 ? markup.length : end;
    const value = markup.slice(offset, textEnd);

    if (value) append({ kind: "text", value: decodeStaticValue(value) });

    offset = textEnd;
  }

  if (stack.length !== 0) {
    throw new Error("[vynn]: Unclosed element in a compiled template.");
  }

  if (roots.length !== 1 || roots[0].kind !== "element") {
    throw new Error("[vynn]: A compiled template must contain exactly one root element.");
  }

  return roots[0];
}

function describeDOMNode(node: Node): TemplateNodeDescriptor {
  if (node.nodeType === Node.TEXT_NODE) {
    return { kind: "text", value: node.nodeValue ?? "" };
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    const value = (node as Comment).data;

    const anchorId = getTemplateAnchorId(value);
    if (anchorId !== undefined) {
      return { kind: "anchor", id: anchorId };
    }

    if (value === EMPTY_TEXT_SSR_MARKER) {
      return { kind: "text", value: "" };
    }

    throw new Error("[vynn]: Unsupported comment in a compiled template.");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    throw new Error("[vynn]: Unsupported node in a compiled template.");
  }

  const element = node as Element;

  return {
    kind: "element",
    tag: element.localName,
    attributes: Array.from(
      element.attributes,
      (attribute): [string, string] => [attribute.name, attribute.value],
    ),
    children: Array.from(element.childNodes, describeDOMNode),
  };
}

function createTemplateBlueprint(root: TemplateElementDescriptor): TemplateBlueprint {
  const steps: TemplateNodeDescriptor[] = [];
  const indices = new Map<TemplateNodeDescriptor, number>();
  const parents = new Map<TemplateNodeDescriptor, TemplateElementDescriptor>();

  const visit = (node: TemplateNodeDescriptor, parent?: TemplateElementDescriptor): void => {
    indices.set(node, steps.length);
    steps.push(node);

    if (parent) parents.set(node, parent);

    if (node.kind === "element") {
      for (const child of node.children) visit(child, node);
    }
  };

  visit(root);

  return { steps, indices, parents };
}

function createTemplateInstance(blueprint: TemplateBlueprint): TemplateInstance {
  return {
    ...blueprint,
    nodes: new Map(),
    descriptors: new WeakMap(),
    cursor: 1,
    hydrating: false,
  };
}

function registerTemplateNode(
  instance: TemplateInstance,
  descriptor: TemplateNodeDescriptor,
  node: TemplateRuntimeNode,
): void {
  instance.nodes.set(descriptor, node);
  instance.descriptors.set(node as object, descriptor);
  templateInstances.set(node as object, instance);
}

function createSSRTemplateNode(
  descriptor: TemplateNodeDescriptor,
  instance: TemplateInstance,
  namespace: string,
): SSR_NODE {
  if (descriptor.kind === "text") {
    const node = createSSRText(descriptor.value);
    registerTemplateNode(instance, descriptor, node);
    return node;
  }

  if (descriptor.kind === "anchor") {
    const node = createSSRComment(getTemplateAnchorMarker(descriptor.id));
    registerTemplateNode(instance, descriptor, node);
    return node;
  }

  const element = withDOMNamespace(namespace, () => createSSRNode(descriptor.tag));

  for (const [name, value] of descriptor.attributes) {
    element.attributes[name] = value;
  }

  registerTemplateNode(instance, descriptor, element);

  const childNamespace = getChildDOMNamespace(element.namespaceURI, descriptor.tag);

  for (const child of descriptor.children) {
    element.appendChild(createSSRTemplateNode(child, instance, childNamespace));
  }

  return element;
}

function createDOMElement(tag: string, namespace: string): Element {
  return namespace === HTML_NAMESPACE
    ? document.createElement(tag)
    : document.createElementNS(namespace, tag);
}

function createHydratedTemplatePlaceholder(
  descriptor: TemplateNodeDescriptor,
  parent: Element,
): Node {
  if (descriptor.kind === "text") {
    return document.createTextNode(descriptor.value);
  }

  if (descriptor.kind === "anchor") {
    return document.createComment(getTemplateAnchorMarker(descriptor.id));
  }

  const namespace = getChildDOMNamespace(parent.namespaceURI, parent.localName, descriptor.tag);
  const element = createDOMElement(descriptor.tag, namespace);

  for (const [name, value] of descriptor.attributes) {
    element.setAttribute(name, value);
  }

  return element;
}

function mapDOMTemplateNode(
  descriptor: TemplateNodeDescriptor,
  node: Node,
  instance: TemplateInstance,
): void {
  let actual = node;

  if (
    descriptor.kind === "text" &&
    node.nodeType === Node.COMMENT_NODE &&
    (node as Comment).data === EMPTY_TEXT_SSR_MARKER
  ) {
    actual = document.createTextNode("");
    node.parentNode?.replaceChild(actual, node);
  }

  registerTemplateNode(instance, descriptor, actual);

  if (descriptor.kind !== "element") return;

  for (let index = 0; index < descriptor.children.length; index++) {
    const child = actual.childNodes[index];

    if (!child) {
      throw new Error(
        "[vynn]: The cloned template does not match its parsed markup at child " + index + ".",
      );
    }

    mapDOMTemplateNode(descriptor.children[index], child, instance);
  }
}

function findHydrationAnchor(
  parent: Element,
  descriptor: TemplateAnchorDescriptor,
  start: Node | null = parent.firstChild,
): Comment {
  const marker = getTemplateAnchorMarker(descriptor.id);
  let current = start;

  while (current) {
    if (
      current.nodeType === Node.COMMENT_NODE &&
      getTemplateAnchorId((current as Comment).data) === descriptor.id
    ) {
      return current as Comment;
    }

    current = current.nextSibling;
  }

  throw new Error("[vynn]: Missing dynamic child anchor " + JSON.stringify(marker) + ".");
}

/**
 * Maps static template nodes in the hydrated DOM without consuming hydration
 * claims. Dynamic SSR children are skipped up to their trailing slot marker;
 * the insertion helper claims those children before rendering that slot.
 */
function isHydrationTemplateNodeCompatible(
  descriptor: TemplateNodeDescriptor,
  node: Node,
  parent: Element,
): boolean {
  if (descriptor.kind === "text") return node.nodeType === Node.TEXT_NODE;

  if (descriptor.kind === "anchor") {
    return (
      node.nodeType === Node.COMMENT_NODE &&
      getTemplateAnchorId((node as Comment).data) === descriptor.id
    );
  }

  const namespace = getChildDOMNamespace(parent.namespaceURI, parent.localName, descriptor.tag);

  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as Element).localName === descriptor.tag.toLowerCase() &&
    (node as Element).namespaceURI === namespace
  );
}

function mapHydratedTemplateNode(
  descriptor: TemplateNodeDescriptor,
  node: Node,
  instance: TemplateInstance,
): void {
  registerTemplateNode(instance, descriptor, node);

  if (descriptor.kind !== "element" || node.nodeType !== Node.ELEMENT_NODE) return;

  const parent = node as Element;
  let cursor: Node | null = parent.firstChild;

  for (const childDescriptor of descriptor.children) {
    if (childDescriptor.kind === "anchor") {
      const anchor = findHydrationAnchor(parent, childDescriptor, cursor);
      registerTemplateNode(instance, childDescriptor, anchor);
      cursor = anchor.nextSibling;
      continue;
    }

    if (
      parent.localName === "head" &&
      childDescriptor.kind === "element" &&
      ["title", "meta", "link"].includes(childDescriptor.tag.toLowerCase())
    ) {
      const metadata = findHydrationHeadElement(cursor, childDescriptor);
      if (metadata) {
        if (childDescriptor.tag.toLowerCase() === "title") {
          ensureTitleHydrationSlots(childDescriptor, metadata);
        }
        mapHydratedTemplateNode(childDescriptor, metadata, instance);
        cursor = metadata.nextSibling;
        continue;
      }

      const placeholder = createHydratedTemplatePlaceholder(childDescriptor, parent);
      parent.insertBefore(placeholder, cursor);
      mapHydratedTemplateNode(childDescriptor, placeholder, instance);
      continue;
    }

    if (cursor && isHydrationTemplateNodeCompatible(childDescriptor, cursor, parent)) {
      const current = cursor;
      mapHydratedTemplateNode(childDescriptor, current, instance);
      cursor = current.nextSibling;
      continue;
    }

    const placeholder = createHydratedTemplatePlaceholder(childDescriptor, parent);
    parent.insertBefore(placeholder, cursor);
    mapHydratedTemplateNode(childDescriptor, placeholder, instance);
  }
}

function insertHydratedNode(
  parent: Element,
  descriptor: TemplateNodeDescriptor,
  node: Node,
  instance: TemplateInstance,
): void {
  const parentDescriptor = instance.parents.get(descriptor);

  if (!parentDescriptor) {
    parent.appendChild(node);
    return;
  }

  const index = parentDescriptor.children.indexOf(descriptor);

  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
    const previous = instance.nodes.get(parentDescriptor.children[previousIndex]);

    if (previous instanceof Node && previous.parentNode === parent) {
      parent.insertBefore(node, previous.nextSibling);
      return;
    }
  }

  for (let nextIndex = index + 1; nextIndex < parentDescriptor.children.length; nextIndex++) {
    const next = instance.nodes.get(parentDescriptor.children[nextIndex]);

    if (next instanceof Node && next.parentNode === parent) {
      parent.insertBefore(node, next);
      return;
    }
  }

  parent.insertBefore(node, parent.firstChild);
}

function claimTemplateNode(
  descriptor: TemplateNodeDescriptor,
  instance: TemplateInstance,
): void {
  const parentDescriptor = instance.parents.get(descriptor);
  const parent = parentDescriptor
    ? (instance.nodes.get(parentDescriptor) as Element | undefined)
    : undefined;

  if (descriptor.kind === "anchor") {
    if (!parent) {
      throw new Error("[vynn]: A dynamic child anchor must have a template parent.");
    }

    registerTemplateNode(instance, descriptor, findHydrationAnchor(parent, descriptor));
    return;
  }

  if (descriptor.kind === "element") {
    const namespace = parent
      ? getChildDOMNamespace(parent.namespaceURI, parentDescriptor!.tag, descriptor.tag)
      : getElementNamespace(descriptor.tag);
    const existing = instance.nodes.get(descriptor);
    const isHeadMetadata =
      parentDescriptor?.tag === "head" &&
      ["title", "meta", "link"].includes(descriptor.tag.toLowerCase());

    // Metadata is deliberately excluded from the global hydration queue.
    // The document template already mapped these nodes directly.
    if (
      isHeadMetadata &&
      existing instanceof Element &&
      (!parent || existing.parentNode === parent)
    ) {
      registerTemplateNode(instance, descriptor, existing);
      return;
    }

    const claimed = claimHydrationElement<Element>();

    if (
      !claimed &&
      existing instanceof Element &&
      (!parent || existing.parentNode === parent)
    ) {
      registerTemplateNode(instance, descriptor, existing);
      return;
    }

    const claimedParent = claimed?.parentNode ?? null;
    const claimedNext = claimed?.nextSibling ?? null;
    let element: Element;

    const claimedCompatible = isHydrationElementCompatible(
      claimed,
      descriptor.tag,
      namespace,
    );

    if (claimed && claimedCompatible) {
      element = claimed;
    } else {
      element = createDOMElement(descriptor.tag, namespace);

      for (const [name, value] of descriptor.attributes) {
        element.setAttribute(name, value);
      }

      if (claimedParent) {
        claimedParent.insertBefore(
          element,
          claimedNext?.parentNode === claimedParent ? claimedNext : null,
        );
      } else if (parent) {
        const current = existing instanceof Element ? existing : undefined;
        if (current && current.parentNode === parent) current.remove();
        insertHydratedNode(parent, descriptor, element, instance);
      }
    }

    const current = existing instanceof Element ? existing : undefined;
    if (current && current !== element && current.parentNode === parent) {
      current.remove();
    }

    if (parent && element.parentNode !== parent) {
      insertHydratedNode(parent, descriptor, element, instance);
    }

    registerTemplateNode(instance, descriptor, element);
    return;
  }

  const existing = instance.nodes.get(descriptor);

  // The hydration scanner skips <title> contents together with the metadata
  // element, so static title text must not consume a body text claim.
  if (
    parentDescriptor?.tag === "title" &&
    existing instanceof Text &&
    (!parent || existing.parentNode === parent)
  ) {
    registerTemplateNode(instance, descriptor, existing);
    return;
  }

  const claimed = claimHydrationText();
  const claimedParent = claimed?.parentNode ?? null;
  const claimedNext = claimed?.nextSibling ?? null;
  let text: Text;

  if (
    !claimed &&
    existing instanceof Text &&
    (!parent || existing.parentNode === parent)
  ) {
    synchronizeHydrationText(existing, descriptor.value);
    registerTemplateNode(instance, descriptor, existing);
    return;
  }

  if (synchronizeHydrationText(claimed, descriptor.value)) {
    text = claimed;
  } else {
    text = document.createTextNode(descriptor.value);
    if (claimedParent) {
      claimedParent.insertBefore(
        text,
        claimedNext?.parentNode === claimedParent ? claimedNext : null,
      );
    } else if (parent) {
      const current = existing instanceof Text ? existing : undefined;
      if (current && current.parentNode === parent) current.remove();
      insertHydratedNode(parent, descriptor, text, instance);
    }
  }

  const current = existing instanceof Text ? existing : undefined;
  if (current && current !== text && current.parentNode === parent) {
    current.remove();
  }

  if (parent && text.parentNode !== parent) {
    insertHydratedNode(parent, descriptor, text, instance);
  }

  registerTemplateNode(instance, descriptor, text);
}

function claimTemplateThrough(
  instance: TemplateInstance,
  target: TemplateNodeDescriptor,
): void {
  const targetIndex = instance.indices.get(target);

  if (targetIndex === undefined) {
    throw new Error("[vynn]: A template node does not belong to its template.");
  }

  while (instance.cursor <= targetIndex) {
    const descriptor = instance.steps[instance.cursor++];
    claimTemplateNode(descriptor, instance);
  }
}

function getTemplateData(markup: string, namespace: string): TemplateData {
  const key = (isServer() ? "server:" : "client:") + namespace + ":" + markup;
  const cached = templateDataCache.get(key);
  if (cached) return cached;

  // Fallback JSX elements are emitted as empty one-tag templates. Creating
  // those roots directly avoids HTML fragment-parser special cases for
  // document and remaining context-sensitive elements such as <html>, <head>,
  // <body>, and <option>, while still using the single $template API.
  const simpleVoid = /^<([A-Za-z][A-Za-z0-9:._-]*)\s*>$/.exec(markup);
  const simplePair = /^<([A-Za-z][A-Za-z0-9:._-]*)>\s*<\/\1\s*>$/.exec(markup);
  const simpleTag = simplePair?.[1] ?? (simpleVoid && voidElements.has(simpleVoid[1].toLowerCase()) ? simpleVoid[1] : undefined);

  if (isServer()) {
    const descriptor: TemplateElementDescriptor = simpleTag
      ? { kind: "element", tag: simpleTag, attributes: [], children: [] }
      : parseServerTemplate(markup);
    const data = {
      descriptor,
      blueprint: createTemplateBlueprint(descriptor),
      simpleTag,
    };

    templateDataCache.set(key, data);
    return data;
  }

  if (simpleTag) {
    const root = createDOMElement(simpleTag, namespace);
    const descriptor = describeDOMNode(root) as TemplateElementDescriptor;
    const data = {
      descriptor,
      blueprint: createTemplateBlueprint(descriptor),
      simpleTag,
    };

    templateDataCache.set(key, data);
    return data;
  }

  if (/^<html(?:\s|>)/i.test(markup)) {
    // Fragment parsing normalizes <html>, <head>, and <body> away. Parse a
    // complete document in document context so the template keeps one root.
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    const documentRoot = parsed.documentElement;

    if (!documentRoot || documentRoot.localName !== "html") {
      throw new Error("[vynn]: A document template must have an <html> root.");
    }

    normalizeTemplateTextAnchors(documentRoot);

    const descriptor = describeDOMNode(documentRoot) as TemplateElementDescriptor;
    const data = {
      descriptor,
      blueprint: createTemplateBlueprint(descriptor),
      documentRoot,
    };

    templateDataCache.set(key, data);
    return data;
  }

  const template = document.createElement("template");
  template.innerHTML =
    namespace === SVG_NAMESPACE ? "<svg>" + markup + "</svg>" : markup;

  const root =
    namespace === SVG_NAMESPACE
      ? template.content.firstElementChild?.firstElementChild
      : template.content.firstElementChild;

  if (!root) {
    throw new Error("[vynn]: A compiled template must contain exactly one root element.");
  }

  const descriptor = describeDOMNode(root) as TemplateElementDescriptor;
  const data = {
    descriptor,
    blueprint: createTemplateBlueprint(descriptor),
    template,
  };

  templateDataCache.set(key, data);
  return data;
}

/**
 * Creates a reusable template factory from static markup. The runtime derives
 * its private SSR and hydration blueprint from the markup. The compiler passes
 * neither a descriptor nor a node-binding callback.
 */
export function $template<T extends Element = Element>(markup: string): () => T {
  const rootTag = /^<([A-Za-z][A-Za-z0-9:._-]*)/.exec(markup)?.[1] ?? "div";

  return function template(): T {
    const namespace = getElementNamespace(rootTag);
    const {
      descriptor,
      blueprint,
      template: domTemplate,
      documentRoot: documentTemplateRoot,
      simpleTag,
    } = getTemplateData(markup, namespace);
    const instance = createTemplateInstance(blueprint);

    if (isServer()) {
      return createSSRTemplateNode(descriptor, instance, namespace) as unknown as T;
    }

    if (isHydrationClaimActive()) {
      instance.hydrating = true;

      const claimed = claimHydrationElement<Element>();
      const claimedParent = claimed?.parentNode ?? null;
      const claimedNext = claimed?.nextSibling ?? null;
      let root: Element;

      const claimedCompatible = isHydrationElementCompatible(
        claimed,
        descriptor.tag,
        namespace,
      );

      if (claimed && claimedCompatible) {
        root = claimed;
      } else {
        const fragment = domTemplate?.content.cloneNode(true) as DocumentFragment | undefined;
        const clone = (
          documentTemplateRoot
            ? documentTemplateRoot.cloneNode(true)
            : simpleTag
              ? createDOMElement(simpleTag, namespace)
              : namespace === SVG_NAMESPACE
                ? fragment?.firstElementChild?.firstElementChild
                : fragment?.firstElementChild
        ) as Element | null;

        if (!clone) {
          throw new Error("[vynn]: A compiled template must contain exactly one root element.");
        }

        root = clone;

        if (claimed) {
          root.replaceChildren();
          while (claimed.firstChild) {
            root.appendChild(claimed.firstChild);
          }
        }

        if (claimedParent instanceof Document) {
          claimedParent.replaceChild(root, claimed);
        } else if (claimedParent) {
          claimedParent.insertBefore(
            root,
            claimedNext?.parentNode === claimedParent ? claimedNext : null,
          );
        }
      }

      normalizeTemplateTextAnchors(root);
      registerTemplateNode(instance, descriptor, root);
      mapHydratedTemplateNode(descriptor, root, instance);

      if (!instance.steps.some((step) => step.kind === "anchor")) {
        const last = instance.steps.at(-1);
        if (last) claimTemplateThrough(instance, last);
      }

      return root as T;
    }

    const fragment = domTemplate?.content.cloneNode(true) as DocumentFragment | undefined;
    const root = documentTemplateRoot
      ? documentTemplateRoot.cloneNode(true)
      : simpleTag
        ? createDOMElement(simpleTag, namespace)
        : namespace === SVG_NAMESPACE
          ? fragment?.firstElementChild?.firstElementChild
          : fragment?.firstElementChild;

    if (!root) {
      throw new Error("[vynn]: A compiled template must contain exactly one root element.");
    }

    normalizeTemplateTextAnchors(root);
    mapDOMTemplateNode(descriptor, root, instance);
    return root as T;
  };
}

/**
 * Resolves a node reached through compiler-emitted DOM navigation.
 *
 * Normal rendering is just native DOM traversal. During hydration, the
 * template-local cursor claims the static nodes up to this position and
 * returns the repaired node when the server DOM differs from the template.
 */
function resolveTemplateNavigationNode(node: TemplateRuntimeNode | null): TemplateRuntimeNode {
  if (!node) {
    throw new Error("[vynn]: A compiled template node is missing from the DOM.");
  }

  const instance = templateInstances.get(node as object);
  const descriptor = instance?.descriptors.get(node as object);

  if (!instance?.hydrating || !descriptor) return node;

  claimTemplateThrough(instance, descriptor);

  return instance.nodes.get(descriptor) ?? node;
}

/** Gets the first child in a template's authored child sequence. */
export function $child<E extends Element = Element>(parent: Element | SSR_ELEMENT): E {
  const instance = templateInstances.get(parent as object);
  const parentDescriptor = instance?.descriptors.get(parent as object);

  if (instance && parentDescriptor?.kind === "element") {
    const childDescriptor = parentDescriptor.children[0];
    const child = childDescriptor ? instance.nodes.get(childDescriptor) : undefined;

    if (child) return resolveTemplateNavigationNode(child) as E;
  }

  return resolveTemplateNavigationNode(parent.firstChild) as E;
}

/** Gets a following sibling in the template's authored child sequence. */
export function $sibling<E extends Element = Element>(
  node: Node | SSR_NODE,
  count = 1,
): E {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("[vynn]: $sibling() expects a non-negative integer count.");
  }

  const instance = templateInstances.get(node as object);
  const descriptor = instance?.descriptors.get(node as object);
  const parentDescriptor = descriptor ? instance?.parents.get(descriptor) : undefined;

  if (instance && descriptor && parentDescriptor) {
    const index = parentDescriptor.children.indexOf(descriptor);
    const nextDescriptor = parentDescriptor.children[index + count];
    const next = nextDescriptor ? instance.nodes.get(nextDescriptor) : undefined;

    if (next) return resolveTemplateNavigationNode(next) as E;
  }

  let sibling: Node | SSR_NODE | null = node;

  while (count-- > 0) {
    sibling = sibling?.nextSibling ?? null;
  }

  return resolveTemplateNavigationNode(sibling) as E;
}

/**
 * Resolves a template slot and claims the static prefix before it. Returning
 * the marker lets generated sibling walks continue from marker.nextSibling,
 * after any server-rendered dynamic children that precede it.
 */
export function $claimTemplateAnchor(
  parent: Element | SSR_ELEMENT,
  id: string,
): Node | SSR_NODE {
  const instance = templateInstances.get(parent as object);
  const parentDescriptor = instance?.descriptors.get(parent as object);

  if (!instance || !parentDescriptor || parentDescriptor.kind !== "element") {
    throw new Error("[vynn]: A dynamic child slot does not belong to a compiled template.");
  }

  const descriptor = parentDescriptor.children.find(
    (child): child is TemplateAnchorDescriptor => child.kind === "anchor" && child.id === id,
  );

  if (!descriptor) {
    throw new Error("[vynn]: Missing compiled dynamic child slot " + JSON.stringify(id) + ".");
  }

  if (instance.hydrating) {
    claimTemplateThrough(instance, descriptor);
  }

  const node = instance.nodes.get(descriptor);
  if (node) return node as Node | SSR_NODE;

  if (parent instanceof SSR_ELEMENT) {
    const anchor = parent.children.find(
      (child): child is SSR_COMMENT =>
        child instanceof SSR_COMMENT && getTemplateAnchorId(child.value) === id,
    );

    if (anchor) {
      registerTemplateNode(instance, descriptor, anchor);
      return anchor;
    }
  } else {
    return findHydrationAnchor(parent, descriptor);
  }

  throw new Error("[vynn]: Missing dynamic child anchor for slot " + JSON.stringify(id) + ".");
}

/** Completes remaining static hydration claims after the template bindings. */
export function $finishTemplate(root: Element | SSR_ELEMENT): void {
  const instance = templateInstances.get(root as object);

  if (!instance?.hydrating) return;

  const last = instance.steps.at(-1);
  if (last) claimTemplateThrough(instance, last);
}
