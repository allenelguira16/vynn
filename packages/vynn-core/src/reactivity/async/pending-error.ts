import { getAsyncBoundary } from "../../context/async-boundary";
import { NotReadyError } from "./not-ready-error";
import type { Source } from "../graph";

/** A pending read understood by both the new graph and Vynn's render pipeline. */
export class PendingReadError extends NotReadyError {
  constructor(
    promise: Promise<unknown>,
    public readonly source: Source,
    registerBoundary = true,
  ) {
    const boundary = getAsyncBoundary();
    super(promise, boundary);
    if (registerBoundary) boundary?.(promise);
    this.name = "PendingReadError";
  }
}
