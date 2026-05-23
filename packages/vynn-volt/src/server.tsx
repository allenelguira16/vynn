/// <reference types="vinxi/types/server" />

import { eventHandler } from "vinxi/http";
import { getManifest } from "vinxi/manifest";
import { JSX } from "vynn";
import { HydrateStreamScript, renderToStream } from "vynn/server";
import { renderToString } from "vynn/server";
import { Router } from "vynn-router";

import { routes } from "./parse-route";
import { AppProps } from "./types";

/**
 * Server render of Volt Application
 *
 * @param App root application
 * @returns string or stream depending of mode
 */
export const renderServer = (
  App: (props: AppProps) => JSX.Element,
  mode: "ssr" | "stream" = "stream",
) => {
  return eventHandler(async (event) => {
    const clientManifest = getManifest("client");

    const rawAssets = await clientManifest.inputs[clientManifest.handler].assets();

    type Assets = ((typeof rawAssets)[number] & { children: string })[];
    const assets = () => (
      <>
        {(rawAssets as Assets).map(({ tag: Tag, attrs, children }) => (
          <Tag {...attrs}>{children}</Tag>
        ))}
        <HydrateStreamScript />
      </>
    );

    const manifest = await (clientManifest.json() as Promise<object>);

    const scripts = (
      <>
        <script html={`window.manifest = ${JSON.stringify(manifest)}`} />
        <script type="module" src={clientManifest.inputs[clientManifest.handler].output.path} />
      </>
    );

    const Component = () => (
      <>
        {`<!DOCTYPE html>`}
        <App assets={assets} scripts={scripts}>
          <Router url={event.path} routes={routes} />
        </App>
      </>
    );

    event.node.res.setHeader("Content-Type", "text/html");

    if (mode === "stream") {
      const stream = renderToStream(Component);

      return stream;
    } else {
      const html = renderToString(Component);

      return html;
    }
  });
};
