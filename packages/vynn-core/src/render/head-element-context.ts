import { getOwner } from "../life-cycle/owner";
import {
  getContext,
  runWithRuntimeContextScope,
  setContext,
} from "../runtime/context";

const HEAD_ELEMENT_CREATION_CONTEXT = Symbol.for("vynn.head-element-creation");

/** Whether the current render is producing text for document metadata. */
export function isCreatingHeadElement(): boolean {
  return getContext<boolean>(HEAD_ELEMENT_CREATION_CONTEXT) === true;
}

/** Marks synchronous child evaluation as head metadata creation. */
export function withHeadElementCreation<T>(callback: () => T): T {
  if (!getOwner()) return callback();

  return runWithRuntimeContextScope(() => {
    setContext(HEAD_ELEMENT_CREATION_CONTEXT, true);
    return callback();
  });
}
