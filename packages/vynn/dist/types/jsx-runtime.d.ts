import { P as PropsWithChildren, F as FC } from './props-Jf6QYkA_.js';
export { a as Fragment } from './props-Jf6QYkA_.js';
import { J as JSX } from './jsx-BgHN_1Il.js';
export { l as logJsx } from './log-jsx-C7efD8Qe.js';

/**
 * jsx runtime
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element.
 */
declare const jsx: <T extends PropsWithChildren<Record<string, any>>>(type: string | FC<T>, { children, ...props }: T | undefined, key: () => string) => JSX.Element;

export { JSX, jsx, jsx as jsxs };
