import { createOwner, runWithOwner } from "../life-cycle/owner";

/**
 * Re-enters the owner associated with an SSR request for one synchronous
 * execution segment.
 *
 * Owner context is intentionally synchronous. Call this again after every
 * await before reading or writing request-scoped context.
 */
export type SsrContextRunner = <T>(callback: () => T) => T;

/**
 * Creates an isolated owner scope for one SSR request.
 *
 * The request owner is the parent of each render owner created inside the
 * scope. Render owners retain that parent while async or streaming work is
 * pending, and detach from it when their normal rendering lifecycle ends.
 *
 * The callback may cross asynchronous boundaries, but owner context is not
 * implicitly propagated. Use the supplied `run` function whenever code needs
 * to access request-scoped owner context.
 */
export async function runWithSsrContext<T>(
  callback: (run: SsrContextRunner) => T,
): Promise<Awaited<T>> {
  const owner = createOwner(null);
  const run: SsrContextRunner = (callback) =>
    runWithOwner(owner, callback);

  return await run(() => callback(run));
}
