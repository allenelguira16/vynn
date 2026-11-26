/**
 * A function registered to run when its owning render scope is disposed.
 */
export type Cleanup = () => void;

/**
 * A zero-argument read of a value.
 *
 * The renderer uses accessors for values that must be read reactively.
 */
export type Accessor<T> = () => T;

/**
 * Lifecycle state for a render scope.
 *
 * A scope transitions in one direction:
 * active -> disposing -> disposed.
 */
export type RenderScopeState = "active" | "disposing" | "disposed";

/**
 * An object with an explicit, idempotent disposal operation.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Opaque lifetime boundary owned by the new renderer.
 *
 * Scope instances are created by the render_new lifecycle implementation.
 * Their internal bookkeeping and the bridge to Vynn's reactive owner system
 * are intentionally not part of this contract.
 *
 * This type is host-agnostic so the same scope model can be used by client
 * rendering, server rendering, and hydration.
 */
declare const renderScopeBrand: unique symbol;

export interface RenderScope extends Disposable {
  readonly [renderScopeBrand]: true;
  readonly parent: RenderScope | null;
  readonly state: RenderScopeState;
}
