import { isServer } from "./environment";
import { currentLocation, replace } from "./location";

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export type RedirectOptions = {
  status?: RedirectStatus;
};

class ClientRedirectSignal extends Error {
  constructor() {
    super("Vynn client redirect");
    this.name = "ClientRedirectSignal";
  }
}

/** Returns whether an error is the internal signal used to stop a client guard. */
export function isClientRedirect(error: unknown): boolean {
  return error instanceof ClientRedirectSignal;
}

/**
 * Redirects from a route guard.
 *
 * SSR throws a Response so the request handler can return the Location header
 * and redirect status before sending the rendered document. CSR replaces the
 * current history entry, then throws an internal signal to stop route rendering.
 */
export function redirect(to: string, options: RedirectOptions = {}): never {
  const status = options.status ?? 302;

  if (![301, 302, 303, 307, 308].includes(status)) {
    throw new RangeError("[vynn-router] Redirect status must be 301, 302, 303, 307, or 308.");
  }

  if (isServer) {
    throw new Response(null, {
      status,
      headers: {
        Location: to,
      },
    });
  }

  const location = currentLocation();
  const target = new URL(
    to,
    window.location.origin + location.pathname + location.search,
  );

  if (target.origin !== window.location.origin) {
    window.location.replace(target.href);
  } else {
    replace(target.pathname + target.search + target.hash, location);
  }

  throw new ClientRedirectSignal();
}
