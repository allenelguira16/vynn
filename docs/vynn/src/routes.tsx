import { lazy } from "vynn";
import { Route } from "vynn-router";

import Layout from "./layout";

const ComputedPage = lazy(() => import("./pages/computed-page"), "ComputedPage");
const EffectPage = lazy(() => import("./pages/effect-page"), "EffectPage");
const HomePage = lazy(() => import("./pages/home-page"), "HomePage");
const InstallationPage = lazy(() => import("./pages/installation-page"), "InstallationPage");
const IntroductionPage = lazy(() => import("./pages/introduction-page"), "IntroductionPage");
const LazyPage = lazy(() => import("./pages/lazy-page"), "LazyPage");
const OnDestroyPage = lazy(() => import("./pages/on-destroy-page"), "OnDestroyPage");
const OnMountPage = lazy(() => import("./pages/on-mount-page"), "OnMountPage");
const StatePage = lazy(() => import("./pages/state-page"), "StatePage");
const StorePage = lazy(() => import("./pages/store-page"), "StorePage");
const AwaitPage = lazy(() => import("./pages/await-page"), "AwaitPage");
const ThingsToKnowPage = lazy(() => import("./pages/things-to-know-page"), "ThingsToKnowPage");
const ErrorBoundaryPage = lazy(() => import("./pages/error-boundary-page"), "ErrorBoundaryPage");
const IsPendingPage = lazy(() => import("./pages/is-pending-page"), "IsPendingPage");
const ContextPage = lazy(() => import("./pages/context-page"), "ContextPage");

export const routes: Route[] = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/docs",
    component: Layout,
    children: [
      {
        path: "/getting-started",
        component: (props) => props.children,
        children: [
          {
            path: "/introduction",
            component: IntroductionPage,
          },
          {
            path: "/installation",
            component: InstallationPage,
          },
          {
            path: "/things-to-know",
            component: ThingsToKnowPage,
          },
        ],
      },
      {
        path: "/life-cycles",
        component: (props) => props.children,
        children: [
          {
            path: "/on-mount",
            component: OnMountPage,
          },
          {
            path: "/on-destroy",
            component: OnDestroyPage,
          },
        ],
      },
      {
        path: "/reactivity",
        component: (props) => props.children,
        children: [
          {
            path: "/state",
            component: StatePage,
          },
          {
            path: "/store",
            component: StorePage,
          },
          {
            path: "/computed",
            component: ComputedPage,
          },
          {
            path: "/effect",
            component: EffectPage,
          },
        ],
      },
      {
        path: "/components",
        component: (props) => props.children,
        children: [
          {
            path: "/await",
            component: AwaitPage,
          },
          {
            path: "/error-boundary",
            component: ErrorBoundaryPage,
          },
        ],
      },
      {
        path: "/utilities",
        component: (props) => props.children,
        children: [
          {
            path: "/lazy",
            component: LazyPage,
          },
          {
            path: "/is-pending",
            component: IsPendingPage,
          },
          {
            path: "/context",
            component: ContextPage,
          },
        ],
      },
    ],
  },
];
