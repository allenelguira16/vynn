export type { RenderNewComponent, RenderNewComponentResult } from "./component";

export type {
  Accessor,
  Cleanup,
  Disposable,
  RenderScope,
  RenderScopeState,
} from "./types";

export {
  createScope,
  createRootScope,
  disposeScope,
  getCurrentScope,
  onScopeDispose,
  runWithScope,
} from "./lifecycle/scope";

export * from "./template";

export * from "./dom";

export * from "./binding";

export * from "./ssr";

export { prepareRenderNewTree } from "./prepare";

export { Await, type RenderNewAwaitProps } from "./components/await";
