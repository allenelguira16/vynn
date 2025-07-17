import { J as JSX } from '../dom-attributes-CCUg0DNA.js';
import { P as PropsWithChildren, F as FC } from '../props-DucQZS0A.js';
export { l as logJsx } from '../log-jsx-BuTAQJLg.js';
export { F as Fragment } from '../fragment-CM6EtvGy.js';

/**
 * jsx runtime
 *
 * @param type - The type of the element.
 * @param props - The properties of the element.
 * @param children - The children of the element.
 * @returns The JSX element.
 */
declare const jsx: <T extends PropsWithChildren<Record<string, any>>>(type: string | FC<T>, { children, ...props }?: T, key?: () => string) => JSX.Element;

export { JSX, jsx, jsx as jsxs };
