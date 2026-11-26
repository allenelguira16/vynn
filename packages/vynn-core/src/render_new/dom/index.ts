export {
  hydrateRenderNew,
} from "./hydrate-client";

export {
  mountRenderNew,
  type MountRenderNewOptions,
} from "./client";

export {
  createDOMTemplateAdapter,
  type DOMTemplateAdapter,
} from "./adapter";

export {
  mountTemplate,
  type MountedTemplate,
} from "./mount";

export {
  createDOMComment,
  createDOMElement,
  createDOMFragment,
  createDOMText,
} from "./create";

export {
  insertDOMNode,
  insertDOMNodes,
} from "./insert";

export {
  moveDOMNode,
  moveDOMNodes,
} from "./move";

export {
  removeDOMNode,
  removeDOMNodes,
} from "./remove";

export {
  createDOMRange,
  getDOMRangeContentNodes,
  getDOMRangeNodes,
  insertDOMRange,
  isDOMRangeAttached,
  moveDOMRange,
  removeDOMRange,
  type DOMNodeRange,
} from "./range";

export {
  mountTemplateProgram,
  type DOMTemplateKey,
  type DOMTemplateProgram,
  type MountedTemplateProgram,
} from "./program";

export {
  type TemplateInitializer,
} from "./mount";
