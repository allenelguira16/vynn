export type ResolvedEntries = {
  appSpecifier: string | null;
  clientFile: string | null;
  serverFile: string | null;
  clientInput: string;
  clientIsGenerated: boolean;
  serverIsGenerated: boolean;
};

export type ClientAssets = {
  file: string;
  css: string[];
};

export const CLIENT_ENTRY_ID = "virtual:vynn/client-entry";
export const SERVER_ENTRY_ID = "virtual:vynn/server-entry";
export const SSR_HANDLER_ID = "virtual:vynn/ssr-handler";

export const RESOLVED_CLIENT_ENTRY_ID = `\0${CLIENT_ENTRY_ID}`;
export const RESOLVED_SERVER_ENTRY_ID = `\0${SERVER_ENTRY_ID}`;
export const RESOLVED_SSR_HANDLER_ID = `\0${SSR_HANDLER_ID}`;
