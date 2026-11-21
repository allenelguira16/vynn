import { lazy } from "react";

export const LazyPage = lazy(() => import("./lazy"));
export const FormsPage = lazy(() => import("./forms"));
export const ContextsPage = lazy(() => import("./contexts"));
export const DropdownsPage = lazy(() => import("./dropdown-list"));
export const ComponentErrorPage = lazy(() => import("./component-error"));
export const NonAsyncSuspensePage = lazy(() => import("./non-async-suspense"));
export const StackedSuspensePage = lazy(() => import("./stacked-suspense"));
export const PokeDexPage = lazy(() => import("./poke-dex"));
export const PokeDexAwaitPage = lazy(() => import("./poke-dex-await"));
export const RedirectPage = lazy(() => import("./redirect"));
export const ParamsPage = lazy(() => import("./params"));
export const NotFoundPage = lazy(() => import("./not-found"));
