import { options } from "preact";
import { locationStub } from "preact-iso/prerender";
import { renderToPipeableStream } from "preact-render-to-string/stream-node";

import App from "./app";

Object.assign(options, { errorBoundaries: true });

export function render(
  url: string,
  options: NonNullable<Parameters<typeof renderToPipeableStream>[1]>,
) {
  locationStub(url);
  return renderToPipeableStream(<App />, options);
}
