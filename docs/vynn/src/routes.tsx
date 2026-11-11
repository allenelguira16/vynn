import type { Route } from "vynn-router";

import { lazy } from "vynn";

import Layout from "./layout";

const HomePage = lazy(() => import("./pages/home-page"), "HomePage");
const InstallationPage = lazy(() => import("./pages/installation-page"), "InstallationPage");
const IntroductionPage = lazy(() => import("./pages/introduction-page"), "IntroductionPage");
const QuickStartPage = lazy(() => import("./pages/quick-start-page"), "QuickStartPage");
const ReactivityPage = lazy(() => import("./pages/reactivity-page"), "ReactivityPage");
const AdvancedReactivityPage = lazy(
  () => import("./pages/advanced-reactivity-page"),
  "AdvancedReactivityPage",
);
const ComponentsPage = lazy(() => import("./pages/components-page"), "ComponentsPage");
const ContextLifecyclePage = lazy(
  () => import("./pages/context-lifecycle-page"),
  "ContextLifecyclePage",
);
const AsyncUiPage = lazy(() => import("./pages/async-ui-page"), "AsyncUiPage");
const RenderingPage = lazy(() => import("./pages/rendering-page"), "RenderingPage");
const ServerFunctionsPage = lazy(
  () => import("./pages/server-functions-page"),
  "ServerFunctionsPage",
);
const ApiReferencePage = lazy(() => import("./pages/api-reference-page"), "ApiReferencePage");
const CoreRuntimePage = lazy(() => import("./pages/core-api-page"), "CoreRuntimePage");
const ServerIntegrationPage = lazy(
  () => import("./pages/server-integration-page"),
  "ServerIntegrationPage",
);
const ServerFunctionsReferencePage = lazy(
  () => import("./pages/server-functions-reference-page"),
  "ServerFunctionsReferencePage",
);
const CompilerPage = lazy(() => import("./pages/compiler-page"), "CompilerPage");

export const routes: Route[] = [
  { path: "/", component: HomePage },
  {
    path: "/docs",
    component: Layout,
    children: [
      {
        path: "/getting-started",
        component: (props) => props.children,
        children: [
          { path: "/introduction", component: IntroductionPage },
          { path: "/installation", component: InstallationPage },
          { path: "/quick-start", component: QuickStartPage },
        ],
      },
      {
        path: "/core-concepts",
        component: (props) => props.children,
        children: [
          { path: "/reactivity", component: ReactivityPage },
          { path: "/advanced-reactivity", component: AdvancedReactivityPage },
          { path: "/components", component: ComponentsPage },
          { path: "/context-and-lifecycle", component: ContextLifecyclePage },
          { path: "/async-ui", component: AsyncUiPage },
        ],
      },
      {
        path: "/guides",
        component: (props) => props.children,
        children: [
          { path: "/rendering", component: RenderingPage },
          { path: "/server-functions", component: ServerFunctionsPage },
        ],
      },
      {
        path: "/reference",
        component: (props) => props.children,
        children: [
          { path: "/api", component: ApiReferencePage },
          { path: "/core-runtime", component: CoreRuntimePage },
          { path: "/server-integration", component: ServerIntegrationPage },
          { path: "/server-functions", component: ServerFunctionsReferencePage },
          { path: "/compiler", component: CompilerPage },
        ],
      },
    ],
  },
];
