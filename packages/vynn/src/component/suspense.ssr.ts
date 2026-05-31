import { getRuntimeContext } from "~/context/runtime-context";
import { normalizeToString } from "~/server/normalize-to-string";
import { JSX } from "~/types/jsx";

type SuspenseSSRProps = {
  fallback?: () => JSX.Element;
  children: () => JSX.Element;
};

export function SuspenseSSR({ children, fallback = () => null }: SuspenseSSRProps) {
  const id = getRuntimeContext().suspenseID++;

  try {
    return normalizeToString(children);
  } catch (error) {
    if (error instanceof Promise) {
      return [
        normalizeToString(fallback),
        `<script>window.__SUSPENSE_DEFAULT_FALLBACK__ ??= [];window.__SUSPENSE_DEFAULT_FALLBACK__[${id}]=true;document.currentScript.remove();</script>`,
        `<!--split-->`,
      ];
    } else {
      throw error;
    }
  }
}
