import { lazy } from "vynn";
import { Route } from "vynn-router";

import Layout from "./layout";

const HomePage = lazy(() => import("./pages/home-page"), "HomePage");
const InstallationPage = lazy(() => import("./pages/installation-page"), "InstallationPage");
const IntroductionPage = lazy(() => import("./pages/introduction-page"), "IntroductionPage");

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
        ],
      },
    ],
  },
];
