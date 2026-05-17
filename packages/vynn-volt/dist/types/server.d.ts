import * as vinxi_http from 'vinxi/http';
import { JSX } from 'vynn';
import { A as AppProps } from './types-Bb-7_Lpp.js';

/**
 * Server render of Volt Application
 *
 * @param App root application
 * @returns string or stream depending of mode
 */
declare const renderServer: (App: (props: AppProps) => JSX.Element, mode?: "ssr" | "stream") => vinxi_http.EventHandler<vinxi_http.EventHandlerRequest, Promise<string>>;

export { renderServer };
