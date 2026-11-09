import { isServer } from "./environment";
import { currentLocation, replace } from "./location";

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export type RedirectOptions = {
  status?: RedirectStatus;
};

class ClientRedirectSignal extends Error {
  readonly target: URL;
  readonly sourcePathname: string;
  readonly sourceSearch: string;

  constructor(to: string, location: ReturnType<typeof currentLocation>) {
    super("Vynn client redirect");
    this.name = "ClientRedirectSignal";

    this.sourcePathname = location.pathname;
    this.sourceSearch = location.search;
    this.target = new URL(to, window.location.origin + location.pathname + location.search);
  }
}

/** Returns whether an error is the internal signal used to stop a client guard. */
export function isClientRedirect(error: unknown): error is ClientRedirectSignal {
  return error instanceof ClientRedirectSignal;
}

/**
 * Commits a redirect signal produced by the current route guard.
 *
 * The location check prevents a queued redirect from overwriting a newer
 * navigation. The caller's revision check also invalidates redirects when
 * the guard resource is superseded before this frame runs.
 */
export function commitClientRedirect(error: unknown, isCurrent: () => boolean = () => true): void {
  if (!isClientRedirect(error)) {
    return;
  }

  const commit = () => {
    if (!isCurrent()) {
      return;
    }

    const location = currentLocation();

    if (location.pathname !== error.sourcePathname || location.search !== error.sourceSearch) {
      return;
    }

    if (error.target.origin !== window.location.origin) {
      window.location.replace(error.target.href);
    } else {
      replace(error.target.pathname + error.target.search + error.target.hash, location);
    }
  };

  // RouteView invokes this from its conditional computation. Defer the
  // location mutation until the current render commit has completed.
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => commit());
  } else {
    window.setTimeout(commit, 0);
  }
}

/**
 * Redirects from a route guard.
 *
 * SSR throws a Response so the request handler can return the Location header
 * and redirect status before sending the rendered document. CSR returns an
 * internal signal that RouteView commits only if this guard execution is
 * still current.
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

  throw new ClientRedirectSignal(to, currentLocation());
}
