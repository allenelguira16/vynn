import * as vinxi from 'vinxi';
import { AppOptions } from 'vinxi';
import { PluginOption } from 'vite';
export { A as AppProps } from './types-Bb-7_Lpp.js';
import 'vynn';

type DefineConfig = {
    plugins: PluginOption[];
    server?: AppOptions["server"];
};
/**
 * Defining Configuration for @vynn/volt application
 *
 * @param config
 * @returns vinxi createApp
 */
declare function defineConfig({ plugins, server }: DefineConfig): vinxi.App;

export { defineConfig };
