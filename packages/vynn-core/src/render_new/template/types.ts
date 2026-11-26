/**
 * Namespace used to parse a compiled template.
 *
 * This is semantic metadata rather than a DOM namespace URI, so the template
 * contract remains usable by server renderers and non-browser hosts.
 */
export type TemplateNamespace = "html" | "svg" | "mathml";

/**
 * A path into a template's parsed child-node tree.
 *
 * The first index addresses the template fragment's childNodes. Each
 * subsequent index addresses the childNodes of the previously resolved node.
 * Paths include text and comment nodes, not only elements.
 */
export type TemplateNodePath = readonly number[];

/**
 * The kind of node a compiled template reference is expected to resolve to.
 *
 * - element: a host element used by attribute, property, or event bindings.
 * - text: a static text node that receives a text binding.
 * - anchor: a comment node marking a dynamic child insertion point.
 */
export type TemplateReferenceKind = "element" | "text" | "anchor";

/**
 * A compiler-emitted reference to one node in a template instance.
 *
 * Reference IDs are local to a TemplateDefinition and must be unique within
 * that definition. The runtime validates that the node at path matches kind
 * when an instance is created.
 */
export interface TemplateReference {
  readonly id: number;
  readonly kind: TemplateReferenceKind;
  readonly path: TemplateNodePath;
}

/**
 * Immutable, host-agnostic description of a compiled static template.
 *
 * markup contains only the static portion of the template. Dynamic child
 * positions are represented by comment anchors and described in references.
 * Element and text references point at nodes in the same parsed tree.
 */
export interface TemplateDefinition {
  readonly markup: string;
  readonly namespace: TemplateNamespace;
  readonly references: readonly TemplateReference[];
}

/**
 * One instantiated copy of a template.
 *
 * A template can have multiple root nodes, so the instance exposes an ordered
 * root list instead of assuming a single root Element. references maps each
 * compiler-emitted reference ID to the corresponding node in this instance.
 * The reference table is immutable at runtime, not only through its type.
 */
export interface TemplateInstance<TNode = unknown> {
  readonly roots: readonly TNode[];
  readonly references: ReadonlyMap<number, TNode>;
}

/**
 * Reusable template definition capable of producing independent instances.
 */
export interface TemplateFactory<TNode = unknown> {
  readonly definition: TemplateDefinition;
  instantiate(): TemplateInstance<TNode>;
}
