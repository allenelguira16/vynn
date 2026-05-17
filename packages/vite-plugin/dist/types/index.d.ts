import * as rollup from 'rollup';

type VitePluginVynnOptions = {
    ssr: boolean;
};
/**
 * vite plugin for vynn
 *
 * @returns The vite plugin.
 */
declare const _default: (options?: VitePluginVynnOptions) => {
    name: string;
    enforce: "pre";
    transform(this: rollup.TransformPluginContext, code: string, id: string): {
        code: string;
        map: {
            version: number;
            sources: string[];
            names: string[];
            sourceRoot?: string | undefined;
            sourcesContent?: string[] | undefined;
            mappings: string;
            file: string;
        } | null | undefined;
    } | undefined;
}[];

export { _default as default };
