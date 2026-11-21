import { EMPTY_TEXT_SSR_MARKER } from "../../const";
import { getElementNamespace, getChildDOMNamespace, withDOMNamespace } from "../namespace";
import { createSSRComment, createSSRNode, createSSRText, SSR_COMMENT, SSR_ELEMENT, type SSR_NODE } from "./resolve-node";
import { createTemplateBlueprint, createTemplateInstance, getTemplateAnchorId, getTemplateAnchorMarker, registerTemplateNode, templateInstances, voidElements, type TemplateAnchorDescriptor, type TemplateElementDescriptor, type TemplateNodeDescriptor } from "../shared/template";

type ServerTemplateData = { descriptor: TemplateElementDescriptor; blueprint: ReturnType<typeof createTemplateBlueprint>; simpleTag?: string };
const templateDataCache = new Map<string, ServerTemplateData>();

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

export function $template<T extends Element = Element>(markup: string): () => T {
  const rootTag = /^<([A-Za-z][A-Za-z0-9:._-]*)/.exec(markup)?.[1] ?? "div";
  return function template(): T {
    const namespace = getElementNamespace(rootTag);
    const key = namespace + ":" + markup;
    let data = templateDataCache.get(key);
    if (!data) {
      const simpleVoid = /^<([A-Za-z][A-Za-z0-9:._-]*)\s*>$/.exec(markup);
      const simplePair = /^<([A-Za-z][A-Za-z0-9:._-]*)>\s*<\/\1\s*>$/.exec(markup);
      const simpleTag = simplePair?.[1] ?? (simpleVoid && voidElements.has(simpleVoid[1].toLowerCase()) ? simpleVoid[1] : undefined);
      const descriptor: TemplateElementDescriptor = simpleTag ? { kind: "element", tag: simpleTag, attributes: [], children: [] } : parseServerTemplate(markup);
      data = { descriptor, blueprint: createTemplateBlueprint(descriptor), simpleTag };
      templateDataCache.set(key, data);
    }
    const instance = createTemplateInstance(data.blueprint);
    return createSSRTemplateNode(data.descriptor, instance, namespace) as unknown as T;
  };
}

export function $child<E extends Element = Element>(parent: SSR_ELEMENT): E {
  const instance = templateInstances.get(parent as object);
  const descriptor = instance?.descriptors.get(parent as object);
  if (instance && descriptor?.kind === "element") {
    const first = descriptor.children[0];
    const child = first ? instance.nodes.get(first) : undefined;
    if (child) return child as unknown as E;
  }
  return parent.firstChild as unknown as E;
}

export function $sibling<E extends Element = Element>(node: SSR_NODE, count = 1): E {
  if (!Number.isInteger(count) || count < 0) throw new RangeError("[vynn]: $sibling() expects a non-negative integer count.");
  const instance = templateInstances.get(node as object);
  const descriptor = instance?.descriptors.get(node as object);
  const parent = descriptor ? instance?.parents.get(descriptor) : undefined;
  if (instance && descriptor && parent) {
    const index = parent.children.indexOf(descriptor);
    const next = parent.children[index + count];
    const value = next ? instance.nodes.get(next) : undefined;
    if (value) return value as unknown as E;
  }
  let current: SSR_NODE | null = node;
  while (count-- > 0) current = current?.nextSibling ?? null;
  return current as unknown as E;
}

export function $claimTemplateAnchor(parent: SSR_ELEMENT, id: string): SSR_NODE {
  const instance = templateInstances.get(parent as object);
  const parentDescriptor = instance?.descriptors.get(parent as object);
  if (!instance || !parentDescriptor || parentDescriptor.kind !== "element") throw new Error("[vynn]: A dynamic child slot does not belong to a compiled template.");
  const descriptor = parentDescriptor.children.find((child): child is TemplateAnchorDescriptor => child.kind === "anchor" && child.id === id);
  if (!descriptor) throw new Error("[vynn]: Missing compiled dynamic child slot " + JSON.stringify(id) + ".");
  const existing = instance.nodes.get(descriptor);
  if (existing) return existing as SSR_NODE;
  const anchor = parent.children.find((child): child is SSR_COMMENT => child instanceof SSR_COMMENT && getTemplateAnchorId(child.value) === id);
  if (anchor) { registerTemplateNode(instance, descriptor, anchor); return anchor; }
  throw new Error("[vynn]: Missing dynamic child anchor for slot " + JSON.stringify(id) + ".");
}

export function $finishTemplate(_root: SSR_ELEMENT): void {}