import { $state, type JSX, type PropsWithChildren } from "vynn";
import { createRenderNewComponent } from "vynn/render_new/internal";
import type {
  DOMTemplateProgram,
  TemplateDefinition,
} from "vynn/render_new";

type AnyRouteComponent = (props: PropsWithChildren) => JSX.Element;

type ComponentExport<
  M extends Record<string, unknown>,
  K extends keyof M,
> = M[K] extends AnyRouteComponent ? M[K] : never;

type LoadableModule<M extends Record<string, unknown>> = () => Promise<M>;

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
 * The module promise is shared by the lazy declaration. Initial rendering
 * exposes an empty child range while loading; route navigation can use the
 * hidden preload capability to load the module before committing its branch.
 */
export function lazy<
  M extends Record<string, unknown> & { default: AnyRouteComponent },
>(
  loader: LoadableModule<M>,
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
  namedExportOrModuleId?: K | string,
  explicitModuleId?: string,
): ComponentExport<M, K> {
  const namedExport = (
    typeof namedExportOrModuleId === "string" &&
    explicitModuleId === undefined &&
    namedExportOrModuleId !== "default"
      ? "default"
      : namedExportOrModuleId ?? "default"
  ) as K;
  const moduleId = explicitModuleId ??
    (namedExportOrModuleId === "default" ? undefined : undefined);

  let resolvedComponent: ComponentExport<M, K> | undefined;
  let modulePromise: Promise<ComponentExport<M, K>> | undefined;

  const loadComponent = (): Promise<ComponentExport<M, K>> => {
    if (resolvedComponent) return Promise.resolve(resolvedComponent);

    if (!modulePromise) {
      modulePromise = loader()
        .then((module) => {
          const component = module[namedExport] as ComponentExport<M, K> | undefined;

          if (typeof component !== "function") {
            throw new Error(
              "[vynn render_new]: Lazy route export " +
                JSON.stringify(String(namedExport)) +
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
      const component = $state<ComponentExport<M, K> | undefined>(resolvedComponent);

      if (!component.value) {
        void loadComponent().then(
          (loaded) => {
            component.value = loaded;
          },
          (error: unknown) => {
            component.value = (() => {
              throw error;
            }) as unknown as ComponentExport<M, K>;
          },
        );
      }

      return childProgram(() => {
        const Loaded = component.value;
        if (!Loaded) return null;
        return createRenderNewComponent(
          () => Loaded(props) as unknown as DOMTemplateProgram,
          props,
          Loaded,
        );
      });
    }, props, LazyComponent);
  };

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
