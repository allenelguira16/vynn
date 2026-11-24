/**
 * Optional document-head lifecycle hooks.
 *
 * The normal client renderer can swap a full document root without importing
 * the head registry. The head runtime registers these hooks only when head JSX
 * is included in the application bundle.
 */
export type HeadDocumentLifecycle = {
  afterDocumentRootMounted(): void;
  beforeDocumentRootUnmount(): void;
};

type HeadDocumentLifecycleFactory = () => HeadDocumentLifecycle | undefined;

let createHeadDocumentLifecycle: HeadDocumentLifecycleFactory | undefined;

export function registerHeadDocumentLifecycle(
  factory: HeadDocumentLifecycleFactory,
): void {
  createHeadDocumentLifecycle = factory;
}

export function captureHeadDocumentLifecycle(): HeadDocumentLifecycle | undefined {
  return createHeadDocumentLifecycle?.();
}
