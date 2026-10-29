export type VynnAppOptions = {
  /** Root component module, relative to the Vite root. Defaults to src/App.* or src/app.*. */
  app?: string;
  /** Optional named App export. Defaults to `default`, then `App`. */
  exportName?: string;
  /** Conventional client entry override. Defaults to src/entry-client.* when present. */
  entryClient?: string;
  /** Conventional server entry override. Defaults to src/entry-server.* when present in SSR mode. */
  entryServer?: string;
  /** Mount selector for the application. Currently must be an ID selector, such as #app. */
  mount?: string;
  /** HTML document title used by the generated document shell. */
  title?: string;
  /** SSR rendering strategy. @default "stream" */
  renderMode?: "async" | "stream";
};

export type ResolvedEntries = {
  appSpecifier: string | null;
  styleSpecifiers: string[];
  clientFile: string | null;
  serverFile: string | null;
  clientInput: string;
  clientIsGenerated: boolean;
  serverIsGenerated: boolean;
};

export type ClientAssets = {
  file: string;
  css: string[];
  lazyModuleAssets: Record<string, string>;
};

export const CLIENT_ENTRY_ID = "virtual:vynn/client-entry";
export const SERVER_ENTRY_ID = "virtual:vynn/server-entry";
export const SSR_HANDLER_ID = "virtual:vynn/ssr-handler";

export const RESOLVED_CLIENT_ENTRY_ID = `\0${CLIENT_ENTRY_ID}`;
export const RESOLVED_SERVER_ENTRY_ID = `\0${SERVER_ENTRY_ID}`;
export const RESOLVED_SSR_HANDLER_ID = `\0${SSR_HANDLER_ID}`;
export const HTML_OUTLET_ID = "app";
