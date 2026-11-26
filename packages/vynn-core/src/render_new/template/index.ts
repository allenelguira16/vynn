export {
  cloneTemplateInstance,
  type TemplateNodeCloner,
} from "./clone";
export {
  createTemplateFactory,
  type TemplateAdapter,
} from "./factory";
export {
  resolveTemplateReference,
  resolveTemplateReferences,
  type TemplateNodeResolver,
} from "./resolve";
export type {
  TemplateDefinition,
  TemplateFactory,
  TemplateInstance,
  TemplateNamespace,
  TemplateNodePath,
  TemplateReference,
  TemplateReferenceKind,
} from "./types";
