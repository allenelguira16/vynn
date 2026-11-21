import type { SSR_NODE } from "../server/resolve-node";

export type TemplateElementDescriptor = {
  kind: "element";
  tag: string;
  attributes: Array<[string, string]>;
  children: TemplateNodeDescriptor[];
};

export type TemplateTextDescriptor = {
  kind: "text";
  value: string;
};

export type TemplateAnchorDescriptor = {
  kind: "anchor";
  id: string;
};

export type TemplateNodeDescriptor =
  | TemplateElementDescriptor
  | TemplateTextDescriptor
  | TemplateAnchorDescriptor;

export type TemplateRuntimeNode = Node | SSR_NODE;

export type TemplateBlueprint = {
  readonly steps: TemplateNodeDescriptor[];
  readonly indices: Map<TemplateNodeDescriptor, number>;
  readonly parents: Map<TemplateNodeDescriptor, TemplateElementDescriptor>;
};

export type TemplateInstance = TemplateBlueprint & {
  readonly nodes: Map<TemplateNodeDescriptor, TemplateRuntimeNode>;
  readonly descriptors: WeakMap<object, TemplateNodeDescriptor>;
  cursor: number;
  hydrating: boolean;
};

export type TemplateData = {
  descriptor: TemplateElementDescriptor;
  blueprint: TemplateBlueprint;
  template?: HTMLTemplateElement;
  documentRoot?: Element;
  simpleTag?: string;
};

export const templateInstances = new WeakMap<object, TemplateInstance>();

export function getTemplateAnchorMarker(id: string): string {
  return id.startsWith("start-")
    ? "$vs" + id.slice("start-".length)
    : "$v" + id;
}

export function getTemplateAnchorId(value: string): string | undefined {
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

export const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
  "source", "track", "wbr",
]);

export function createTemplateBlueprint(root: TemplateElementDescriptor): TemplateBlueprint {
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

export function createTemplateInstance(blueprint: TemplateBlueprint): TemplateInstance {
  return {
    ...blueprint,
    nodes: new Map(),
    descriptors: new WeakMap(),
    cursor: 1,
    hydrating: false,
  };
}

export function registerTemplateNode(
  instance: TemplateInstance,
  descriptor: TemplateNodeDescriptor,
  node: TemplateRuntimeNode,
): void {
  instance.nodes.set(descriptor, node);
  instance.descriptors.set(node as object, descriptor);
  templateInstances.set(node as object, instance);
}