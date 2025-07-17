import { P as PropsWithChildren, F as FC } from './props-DucQZS0A.js';
import { J as JSX } from './dom-attributes-CCUg0DNA.js';

/**
 * Create a JSX element for SSR
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element for SSR.
 */
declare function h<T extends PropsWithChildren<Record<string, any>>>(type: string | FC<T>, props?: Omit<T, "children">, children?: T["children"], _key?: () => string): string | undefined;

/**
 * Stream Hydration Script, used for hydrating async
 *
 * @returns
 */
declare function HydrateStreamScript(): JSX.Element;

/**
 * render an application into a streamable pipe.
 *
 * @param App root application
 * @returns stream
 */
declare function renderToStream(App: () => JSX.Element): ReadableStream<Uint8Array<ArrayBufferLike>>;

/**
 * render an application into a string.
 *
 * @param App root application
 * @returns stream
 */
declare function renderToString(App: () => JSX.Element): string;

export { HydrateStreamScript, h, renderToStream, renderToString };
