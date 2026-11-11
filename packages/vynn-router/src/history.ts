export type HistoryListener = (location: string) => void;

export type RouterHistory = {
  readonly location: string;
  push(to: string): void;
  replace(to: string): void;
  listen(listener: HistoryListener): () => void;
  dispose?(): void;
};

export type MemoryHistory = RouterHistory & {
  readonly entries: readonly string[];
  readonly index: number;
  go(delta: number): void;
  back(): void;
  forward(): void;
};

export type MemoryHistoryOptions = {
  initialEntries?: string[];
  initialIndex?: number;
};

function resolveMemoryLocation(to: string, from: string): string {
  const target = new URL(to, new URL(from, "http://vynn.local"));
  return target.pathname + target.search + target.hash;
}

/**
 * Creates an in-memory history implementation.
 *
 * It is useful for tests, embedded routers, and server-side router instances.
 * It never reads or mutates the browser URL.
 */
export function createMemoryHistory(options: MemoryHistoryOptions = {}): MemoryHistory {
  const inputEntries = options.initialEntries?.length ? options.initialEntries : ["/"];
  const entries = inputEntries.reduce<string[]>((result, entry) => {
    const previous = result[result.length - 1] ?? "/";
    result.push(resolveMemoryLocation(entry, previous));
    return result;
  }, []);

  const requestedIndex =
    typeof options.initialIndex === "number" && Number.isFinite(options.initialIndex)
      ? Math.trunc(options.initialIndex)
      : entries.length - 1;
  let index = Math.max(0, Math.min(requestedIndex, entries.length - 1));

  const listeners = new Set<HistoryListener>();
  const getLocation = () => entries[index] ?? "/";

  const notify = () => {
    const location = getLocation();
    for (const listener of listeners) listener(location);
  };

  const go = (delta: number) => {
    if (!Number.isFinite(delta)) return;

    const nextIndex = Math.max(0, Math.min(index + Math.trunc(delta), entries.length - 1));
    if (nextIndex === index) return;

    index = nextIndex;
    notify();
  };

  return {
    get location() {
      return getLocation();
    },

    get entries() {
      return entries.slice();
    },

    get index() {
      return index;
    },

    push(to) {
      const current = getLocation();
      const next = resolveMemoryLocation(to, current);
      if (next === current) return;

      entries.splice(index + 1);
      entries.push(next);
      index = entries.length - 1;
      notify();
    },

    replace(to) {
      const current = getLocation();
      const next = resolveMemoryLocation(to, current);
      if (next === current) return;

      entries[index] = next;
      notify();
    },

    go,

    back() {
      go(-1);
    },

    forward() {
      go(1);
    },

    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function scrollToHash(hash: string): void {
  if (!hash) return;

  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // Keep the literal fragment when it contains malformed escapes.
  }

  const target = document.getElementById(id) ?? document.getElementsByName(id).item(0);
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView();
  }
}

/**
 * Creates a browser history implementation backed by the History API.
 *
 * Router instances create this automatically in the browser. The optional
 * initial URL is useful when hydrating an application from its server URL.
 */
export function createBrowserHistory(initialUrl?: string): RouterHistory {
  const listeners = new Set<HistoryListener>();
  let listening = false;

  const getLocation = () =>
    window.location.pathname + window.location.search + window.location.hash;

  const notify = () => {
    const location = getLocation();
    for (const listener of listeners) listener(location);
  };

  const onPopState = () => notify();

  const attach = () => {
    if (listening || listeners.size === 0) return;
    window.addEventListener("popstate", onPopState);
    listening = true;
  };

  const detach = () => {
    if (!listening) return;
    window.removeEventListener("popstate", onPopState);
    listening = false;
  };

  if (initialUrl) {
    const target = new URL(initialUrl, window.location.href);
    if (target.origin === window.location.origin && target.href !== window.location.href) {
      window.history.replaceState(null, "", target.href);
    }
  }

  const update = (to: string, action: "push" | "replace") => {
    const target = new URL(to, window.location.href);

    if (target.origin !== window.location.origin) {
      window.location.assign(target.href);
      return;
    }

    const next = target.pathname + target.search + target.hash;
    if (next === getLocation()) return;

    if (action === "replace") {
      window.history.replaceState(null, "", next);
    } else {
      window.history.pushState(null, "", next);
    }

    notify();
    scrollToHash(target.hash);
  };

  return {
    get location() {
      return getLocation();
    },

    push(to) {
      update(to, "push");
    },

    replace(to) {
      update(to, "replace");
    },

    listen(listener) {
      listeners.add(listener);
      attach();

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) detach();
      };
    },

    dispose() {
      listeners.clear();
      detach();
    },
  };
}
