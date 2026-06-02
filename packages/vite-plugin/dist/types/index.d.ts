import { PluginOption } from 'vite';

type VitePluginVynnOptions = {
    ssr: boolean;
};
/**
 * vite plugin for vynn
 *
 * @returns The vite plugin.
 */
declare const _default: (options?: VitePluginVynnOptions) => PluginOption[];

export { _default as default };
