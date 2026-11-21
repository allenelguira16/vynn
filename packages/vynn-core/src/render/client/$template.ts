import { EMPTY_TEXT_SSR_MARKER } from "../../const";
import { claimHydrationElement, claimHydrationText, isHydrationClaimActive } from "../../client/hydration";
import { isHydrationElementCompatible, synchronizeHydrationText } from "../../client/hydration-diagnostics";
import { getChildDOMNamespace, getElementNamespace, HTML_NAMESPACE, SVG_NAMESPACE } from "../namespace";
import { createTemplateBlueprint, createTemplateInstance, getTemplateAnchorId, getTemplateAnchorMarker, registerTemplateNode, templateInstances, voidElements, type TemplateAnchorDescriptor, type TemplateData, type TemplateElementDescriptor, type TemplateNodeDescriptor } from "../shared/template";

type TemplateRuntimeNode = Node;
const templateDataCache = new Map<string, TemplateData>();

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
  const key = namespace + ":" + markup;
  const cached = templateDataCache.get(key);
  if (cached) return cached;
  const simpleVoid = /^<([A-Za-z][A-Za-z0-9:._-]*)\s*>$/.exec(markup);
  const simplePair = /^<([A-Za-z][A-Za-z0-9:._-]*)>\s*<\/\1\s*>$/.exec(markup);
  const simpleTag = simplePair?.[1] ?? (simpleVoid && voidElements.has(simpleVoid[1].toLowerCase()) ? simpleVoid[1] : undefined);
  if (simpleTag) {
    const root = createDOMElement(simpleTag, namespace);
    const descriptor = describeDOMNode(root) as TemplateElementDescriptor;
    const data = { descriptor, blueprint: createTemplateBlueprint(descriptor), simpleTag };
    templateDataCache.set(key, data);
    return data;
  }
  if (/^<html(?:\s|>)/i.test(markup)) {
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    const documentRoot = parsed.documentElement;
    if (!documentRoot || documentRoot.localName !== "html") throw new Error("[vynn]: A document template must have an <html> root.");
    normalizeTemplateTextAnchors(documentRoot);
    const descriptor = describeDOMNode(documentRoot) as TemplateElementDescriptor;
    const data = { descriptor, blueprint: createTemplateBlueprint(descriptor), documentRoot };
    templateDataCache.set(key, data);
    return data;
  }
  const template = document.createElement("template");
  template.innerHTML = namespace === SVG_NAMESPACE ? "<svg>" + markup + "</svg>" : markup;
  const root = namespace === SVG_NAMESPACE ? template.content.firstElementChild?.firstElementChild : template.content.firstElementChild;
  if (!root) throw new Error("[vynn]: A compiled template must contain exactly one root element.");
  const descriptor = describeDOMNode(root) as TemplateElementDescriptor;
  const data = { descriptor, blueprint: createTemplateBlueprint(descriptor), template };
  templateDataCache.set(key, data);
  return data;
}

export function $template<T extends Element = Element>(markup: string): () => T {
  const rootTag = /^<([A-Za-z][A-Za-z0-9:._-]*)/.exec(markup)?.[1] ?? "div";
  return function template(): T {
    const namespace = getElementNamespace(rootTag);
    const { descriptor, blueprint, template: domTemplate, documentRoot: documentTemplateRoot, simpleTag } = getTemplateData(markup, namespace);
    const instance = createTemplateInstance(blueprint);
    if (isHydrationClaimActive()) {
      instance.hydrating = true;
      const claimed = claimHydrationElement<Element>();
      const claimedParent = claimed?.parentNode ?? null;
      const claimedNext = claimed?.nextSibling ?? null;
      let root: Element;
      const claimedCompatible = isHydrationElementCompatible(claimed, descriptor.tag, namespace);
      if (claimed && claimedCompatible) root = claimed;
      else {
        const fragment = domTemplate?.content.cloneNode(true) as DocumentFragment | undefined;
        const clone = (documentTemplateRoot ? documentTemplateRoot.cloneNode(true) : simpleTag ? createDOMElement(simpleTag, namespace) : namespace === SVG_NAMESPACE ? fragment?.firstElementChild?.firstElementChild : fragment?.firstElementChild) as Element | null;
        if (!clone) throw new Error("[vynn]: A compiled template must contain exactly one root element.");
        root = clone;
        if (claimed) { root.replaceChildren(); while (claimed.firstChild) root.appendChild(claimed.firstChild); }
        if (claimedParent instanceof Document) claimedParent.replaceChild(root, claimed);
        else if (claimedParent) claimedParent.insertBefore(root, claimedNext?.parentNode === claimedParent ? claimedNext : null);
      }
      normalizeTemplateTextAnchors(root);
      registerTemplateNode(instance, descriptor, root);
      mapHydratedTemplateNode(descriptor, root, instance);
      if (!instance.steps.some((step) => step.kind === "anchor")) { const last = instance.steps.at(-1); if (last) claimTemplateThrough(instance, last); }
      return root as T;
    }
    const fragment = domTemplate?.content.cloneNode(true) as DocumentFragment | undefined;
    const root = documentTemplateRoot ? documentTemplateRoot.cloneNode(true) : simpleTag ? createDOMElement(simpleTag, namespace) : namespace === SVG_NAMESPACE ? fragment?.firstElementChild?.firstElementChild : fragment?.firstElementChild;
    if (!root) throw new Error("[vynn]: A compiled template must contain exactly one root element.");
    normalizeTemplateTextAnchors(root);
    mapDOMTemplateNode(descriptor, root, instance);
    return root as T;
  };
}

function resolveTemplateNavigationNode(node: TemplateRuntimeNode | null): TemplateRuntimeNode {
  if (!node) {
    throw new Error("[vynn]: A compiled template node is missing from the DOM.");
  }

  const instance = templateInstances.get(node as object);
  const descriptor = instance?.descriptors.get(node as object);

  if (!instance?.hydrating || !descriptor) return node;

  claimTemplateThrough(instance, descriptor);

  return (instance.nodes.get(descriptor) as Node | undefined) ?? node;
}

export function $child<E extends Element = Element>(parent: Element): E {
  const instance = templateInstances.get(parent as object);
  const parentDescriptor = instance?.descriptors.get(parent as object);

  if (instance && parentDescriptor?.kind === "element") {
    const childDescriptor = parentDescriptor.children[0];
    const child = childDescriptor ? instance.nodes.get(childDescriptor) : undefined;

    if (child) return resolveTemplateNavigationNode(child as Node) as E;
  }

  return resolveTemplateNavigationNode(parent.firstChild) as E;
}

export function $sibling<E extends Element = Element>(
  node: Node,
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

    if (next) return resolveTemplateNavigationNode(next as Node) as E;
  }

  let sibling: Node | null = node;

  while (count-- > 0) {
    sibling = sibling?.nextSibling ?? null;
  }

  return resolveTemplateNavigationNode(sibling) as E;
}

export function $claimTemplateAnchor(
  parent: Element,
  id: string,
): Node {
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
  if (node) return node as Node;

  return findHydrationAnchor(parent, descriptor);
}

/** Completes remaining static hydration claims after the template bindings. */

export function $finishTemplate(root: Element): void {
  const instance = templateInstances.get(root as object);

  if (!instance?.hydrating) return;

  const last = instance.steps.at(-1);
  if (last) claimTemplateThrough(instance, last);
}