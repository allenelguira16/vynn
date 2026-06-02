import { J as JSX } from './jsx-BgHN_1Il.js';

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

export { HydrateStreamScript, renderToStream, renderToString };
