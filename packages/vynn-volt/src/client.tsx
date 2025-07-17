/// <reference types="vinxi/types/client" />
import "vinxi/client";

import { getManifest } from "vinxi/manifest";
import { JSX, NoHydration } from "vynn";
import { hydrateApp } from "vynn/client";
import { HydrateStreamScript } from "vynn/server";
import { Router } from "vynn-router";

import { routes } from "./parse-route";
import { AppProps } from "./types";

/**
 * Hydrate Client of Volt Application
 *
 * @param App root application
 */
export const hydrateClient = async (App: (props: AppProps) => JSX.Element) => {
  const clientManifest = getManifest("client");

  const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();

  type Assets = ((typeof rawAssets)[number] & { children: string })[];
  const assets = (
    <>
      {(rawAssets as Assets).map(({ tag: Tag, attrs, children }) => (
        <Tag {...attrs}>{children}</Tag>
      ))}
      <NoHydration>
        <HydrateStreamScript />
      </NoHydration>
    </>
  );

  // TODO: Support NoHydration
  const scripts = <NoHydration></NoHydration>;

  hydrateApp(() => (
    <App assets={assets} scripts={scripts}>
      <div id="app">
        <Router url={location.pathname} routes={routes} />
      </div>
    </App>
  )).mount(document);
};
