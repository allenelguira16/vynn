import { isServer } from "./environment";
import { navigate } from "./location";

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export type RedirectOptions = {
  /** HTTP redirect status used during SSR. Defaults to 302. */
  status?: RedirectStatus;
};

class ClientRedirectError extends Error {
  constructor() {
    super("Vynn client navigation redirected.");
    this.name = "ClientRedirectError";
  }
}

/** @internal Used by RouteLoadBoundary to distinguish redirects from errors. */
export function isClientRedirectError(error: unknown): boolean {
  return error instanceof ClientRedirectError;
}

/**
 * Redirects the active navigation.
 *
 * On the server, a redirect is thrown as a Web Response so the SSR request
 * handler can return it before sending the document. In the browser, it
 * navigates and aborts the current beforeLoad callback.
 */
export function redirect(path: string, options: RedirectOptions = {}): never {
  if (isServer) {
    throw new Response(null, {
      status: options.status ?? 302,
      headers: {
        Location: path,
      },
    });
  }

  navigate(path);
  throw new ClientRedirectError();
}
