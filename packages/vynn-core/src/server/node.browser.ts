import type { IncomingMessage } from "node:http";

export type ToWebRequestOptions = {
  url?: string;
  origin?: string;
};

/** Browser stub for a Node.js-only request adapter. */
export function toWebRequest(
  _request: IncomingMessage,
  _options: ToWebRequestOptions = {},
): Request {
  throw new Error(
    "[vynn]: toWebRequest() is only available in a Node.js server environment.",
  );
}
