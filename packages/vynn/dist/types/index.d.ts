import { J as JSX } from './dom-attributes-CCUg0DNA.js';
export { F as Fragment } from './fragment-CM6EtvGy.js';
import { P as PropsWithChildren } from './props-DucQZS0A.js';
export { a as PropsWithRef } from './props-DucQZS0A.js';

/**
 * Lazily load components
 *
 * @param loader lazy loader import
 * @param namedExport name of the exported
 * @returns jsx
 */
declare const lazy: <M extends Record<string, any>, K extends keyof M = "default">(_loader: () => Promise<M>, namedExport?: K) => (() => JSX.Element);

type ResourceReturn<T> = {
    readonly loading: boolean;
    readonly error: Error | null;
    readonly data: T;
    refetch: () => void;
    mutate: (newValue: T) => void;
};
/**
 * Create a reactive resource
 *
 * @param fetcher - The function to fetch the data.
 * @returns The resource.
 */
declare function resource<T, const P extends any[]>(fetcher: (...params: P) => Promise<T>, _params: P): ResourceReturn<T>;

/**
 * memoize a function
 *
 * @param fn - The function to memoize.
 * @returns The memoized function.
 */
declare function memo<T>(fn: () => T): () => T;
declare function memo<P extends object, T>(fn: (props: P) => T): (props: P) => T;

/**
 * unwraps proxy objects
 *
 * @param value - The value to unwrap.
 * @returns The unwrapped value.
 */
declare function unwrap<T>(value: any): Partial<T>;

/**
 * Suspense component for suspending async operations
 *
 * @param props - The props of the component.
 * @returns jsx function
 */
declare function Suspense(props: {
    fallback?: JSX.Element;
    children: JSX.Element;
}): JSX.Element;

type Computed<T> = {
    readonly value: T;
};
/**
 * Create a computed value
 *
 * @param getter - The getter function that returns the computed value from a reactive value.
 * @returns The computed value.
 */
declare function $computed<T>(getter: () => T): Computed<T>;

/**
 * Create an effect with an attached render frame
 */
declare function $effect(fn: (() => void | (() => void)) | (() => Promise<void | (() => void)>)): () => void;
declare function stopEffect(): void;

type State<T> = {
    value: T;
};
/**
 * Create a state
 *
 * @param initialValue - The initial value of the state.
 * @returns The state object.
 */
declare function $state<T>(initialValue: T): State<T>;
declare function $state<T = undefined>(): State<T | undefined>;

type Store<T extends object> = T;
declare function $store<T extends object>(initialObject: T): Store<T>;

/**
 * Unwrap a reactive value
 *
 * @param fn - The function that returns the reactive value.
 * @returns The reactive value.
 */
declare function untrack<T>(fn: () => T): T;

/**
 * An array helper for iterating arrays efficiently
 *
 * @param items - The items to loop through.
 * @returns each fn.
 */
declare function loop<T>(items: T[]): {
    each(children: (item: T, index: State<number>) => JSX.Element): JSX.Element;
};

/**
 * No Hydration component to tell renderer it should not be hydrated
 *
 * @param children - The children of the fragment.
 * @returns The fragment.
 */
declare function NoHydration({ children }: {
    children?: () => JSX.Element;
}): () => JSX.Element;

/**
 * A portal component for rendering into different part of the dom
 *
 * @param children The children of the Portal.
 * @param target
 * @returns
 */
declare function Portal({ children, target }: PropsWithChildren<{
    target: Node;
}>): () => null;

/**
 * Create Context helper
 *
 * @returns Provider and context
 */
declare function createContext<T>(): readonly [(props: {
    value: T;
    children: () => JSX.Element;
}) => JSX.Element, () => T];

type DestroyFn = () => Promise<void> | void;
/**
 * on destroy
 *
 * @param fn - The function to run on destroy.
 */
declare function onDestroy(fn: DestroyFn): void;

type MountFn = () => Promise<void | DestroyFn> | (void | DestroyFn);
/**
 * on mount
 *
 * @param fn - The function to run on mount.
 */
declare function onMount(fn: () => Promise<DestroyFn> | DestroyFn): void;
declare function onMount(fn: () => Promise<void> | void): void;

export { $computed, $effect, $state, $store, JSX, NoHydration, Portal, PropsWithChildren, Suspense, createContext, lazy, loop, memo, onDestroy, onMount, resource, stopEffect, untrack, unwrap };
export type { Computed, DestroyFn, MountFn, ResourceReturn, State };
