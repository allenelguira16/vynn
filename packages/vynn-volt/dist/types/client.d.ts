import { JSX } from 'vynn';
import { A as AppProps } from './types-Bb-7_Lpp.js';

/**
 * Hydrate Client of Volt Application
 *
 * @param App root application
 */
declare const hydrateClient: (App: (props: AppProps) => JSX.Element) => Promise<void>;

export { hydrateClient };
