/// <reference types="vinxi/types/client" />
import "vinxi/client";

import { JSX } from "vynn";
import { hydrateApp } from "vynn/client";
import { Router } from "vynn-router";

import { routes } from "./parse-route";
import { AppProps } from "./types";

/**
 * Hydrate Client of Volt Application
 *
 * @param App root application
 */
export const hydrateClient = async (App: (props: AppProps) => JSX.Element) => {
  // const clientManifest = getManifest("client");
  // const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();
  // type Assets = ((typeof rawAssets)[number] & { children: string })[];
  // const assets = (
  //   <>
  //     {(rawAssets as Assets).map(({ tag: Tag, attrs, children }) => (
  //       <Tag {...attrs}>{children}</Tag>
  //     ))}
  //     <NoHydration>{/* <HydrateStreamScript /> */}</NoHydration>
  //   </>
  // );
  // // TODO: Support NoHydration
  // const scripts = (
  //   <NoHydration>
  //     <script></script>
  //     <script></script>
  //   </NoHydration>
  // );
  hydrateApp(() => <Router url={location.pathname} routes={routes} />).mount("#app");
};
