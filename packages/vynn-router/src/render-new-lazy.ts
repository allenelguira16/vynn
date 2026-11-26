import { $state, type JSX, type PropsWithChildren } from "vynn";
import { createRenderNewComponent } from "vynn/render_new/internal";
import { isServer } from "./environment";
import type {
  DOMTemplateProgram,
  TemplateDefinition,
} from "vynn/render_new";

type AnyRouteComponent = (props: never) => JSX.Element;

type ComponentExport<
  M extends Record<string, unknown>,
  K extends keyof M,
> = M[K] extends AnyRouteComponent ? M[K] : never;

type LoadableModule<M extends Record<string, unknown>> = () => Promise<M>;

const lazyComponents = new WeakSet<Function>();

export function isRenderNewLazyComponent(value: unknown): boolean {
  return typeof value === "function" && lazyComponents.has(value);
}

type LazyState<TComponent> =
  | { status: "pending" }
  | { status: "loaded"; component: TComponent }
  | { status: "error"; error: unknown };

const lazyTemplate: TemplateDefinition = Object.freeze({
  namespace: "html",
  markup:
    "<!--__vynn_render_new_child_0_start__-->" +
    "<!--__vynn_render_new_child_0_end__-->",
  references: Object.freeze([
    Object.freeze({
      id: 0,
      kind: "anchor" as const,
      path: Object.freeze([0]),
    }),
  ]),
});

function childProgram(read: () => unknown): DOMTemplateProgram {
  return {
    template: lazyTemplate,
    bindings: [{ kind: "child", reference: 0, read }],
  };
}

/**
 * Creates a renderer-native lazy component.
 *
 * Module loading is shared by the lazy declaration. Each mounted instance
 * owns its loading state and displays no content until its module resolves.
 * The hidden preload method lets createRouter() load destination modules
 * before it commits a route branch.
 */
export function lazy<
  M extends Record<string, unknown> & { default: AnyRouteComponent },
>(
  loader: LoadableModule<M>,
  namedExport?: undefined,
  moduleId?: string,
): M["default"];
export function lazy<
  M extends Record<string, unknown>,
  K extends keyof M,
>(
  loader: LoadableModule<M>,
  namedExport: K,
  moduleId?: string,
): ComponentExport<M, K>;
export function lazy<
  M extends Record<string, unknown>,
  K extends keyof M = "default" & keyof M,
>(
  loader: LoadableModule<M>,
  namedExport?: K,
  moduleId?: string,
): ComponentExport<M, K> {
  const exportName = (namedExport ?? "default") as K;
  let resolvedComponent: ComponentExport<M, K> | undefined;
  let modulePromise: Promise<ComponentExport<M, K>> | undefined;

  const loadComponent = (): Promise<ComponentExport<M, K>> => {
    if (resolvedComponent) return Promise.resolve(resolvedComponent);

    if (!modulePromise) {
      modulePromise = loader()
        .then((module) => {
          const component = module[exportName] as ComponentExport<M, K> | undefined;

          if (typeof component !== "function") {
            throw new Error(
              "[vynn render_new]: Lazy route export " +
                JSON.stringify(String(exportName)) +
                " is not a component.",
            );
          }

          resolvedComponent = component;
          return component;
        })
        .catch((error: unknown) => {
          modulePromise = undefined;
          throw error;
        });
    }

    return modulePromise;
  };

  const LazyComponent = (props: PropsWithChildren): JSX.Element => {
    return createRenderNewComponent(() => {
      if (isServer && !resolvedComponent) {
        throw new Error(
          "[vynn render_new]: Lazy components must be prepared before synchronous SSR serialization.",
        );
      }

      const state = $state<LazyState<ComponentExport<M, K>>>(
        resolvedComponent
          ? { status: "loaded", component: resolvedComponent }
          : { status: "pending" },
      );

      if (!resolvedComponent) {
        void loadComponent().then(
          (component) => {
            state.value = { status: "loaded", component };
          },
          (error: unknown) => {
            state.value = { status: "error", error };
          },
        );
      }

      return childProgram(() => {
        const current = state.value;
        if (current.status === "pending") return null;
        if (current.status === "error") throw current.error;

        return createRenderNewComponent(
          () => current.component(props) as unknown as DOMTemplateProgram,
          props,
          current.component,
        );
      });
    }, props, LazyComponent, async () => {
      await loadComponent();
      return false;
    }) as unknown as JSX.Element;
  };

  lazyComponents.add(LazyComponent);

  Object.defineProperty(LazyComponent, "preload", {
    configurable: false,
    enumerable: false,
    value: () => resolvedComponent ? undefined : loadComponent(),
    writable: false,
  });

  Object.defineProperty(LazyComponent, "moduleId", {
    configurable: false,
    enumerable: false,
    value: moduleId,
    writable: false,
  });

  return LazyComponent as ComponentExport<M, K>;
}
