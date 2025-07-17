import { ConfigAPI, TransformOptions } from '@babel/core';

type BabelPresetVynnOptions = {
    ssr: boolean;
};
/**
 * babel preset for vynn
 *
 * @param api - The babel api.
 * @returns The babel options.
 */
declare function babelPresetVynn(api: ConfigAPI, opts?: BabelPresetVynnOptions): TransformOptions;

export { babelPresetVynn as default };
