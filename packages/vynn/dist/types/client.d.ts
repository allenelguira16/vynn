import { J as JSX } from './jsx-BgHN_1Il.js';

/**
 * create root app
 *
 * @param App - The app to render.
 */
declare function createApp(App: () => JSX.Element): {
    mount: (id: Document | HTMLElement | DocumentFragment | string) => void;
    unmount: () => void;
};

/**
 * hydrate root app
 *
 * @param App - The app to render.
 */
declare function hydrateApp(App: () => JSX.Element): {
    mount: (id: Document | HTMLElement | string) => void;
    unmount: () => void;
};

export { createApp, hydrateApp };
