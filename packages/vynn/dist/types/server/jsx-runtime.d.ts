import { P as PropsWithChildren, a as FC } from '../props-Bx-TEx3T.js';
export { F as Fragment } from '../props-Bx-TEx3T.js';
import { J as JSX } from '../jsx-CQ66VjTW.js';
export { l as logJsx } from '../log-jsx-DwiN_lFy.js';

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
