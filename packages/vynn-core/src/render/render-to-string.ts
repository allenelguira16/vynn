import { JSX } from "../types/jsx";
import { SSR_NODE } from "./resolve-node";

export const pending = new Set<Promise<any>>();

export function registerSSRPromise(promise: Promise<any>) {
  pending.add(promise);
}

export async function renderToString(App: () => JSX.Element) {
  const app = App() as unknown as SSR_NODE[];

  // console.log("start");
  const resolved = await resolve(app);
  // console.log("end");

  return resolved;
}

async function resolve(app: SSR_NODE[]) {
  let string = "";
  for (const node of app.filter(Boolean)) {
    if (Array.isArray(node)) {
      string += await resolve(node);
    } else if ("children" in node) {
      let attr = Object.entries(node.attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      attr = !!attr.length ? ` ${attr}` : attr;
      string += `<${node.type}${attr}>${await resolve(await Promise.all(node.children))}</${node.type}>`;
    } else if (node.type === "#text") {
      string += node.value;
    } else if ((node as any) instanceof Promise) {
      string += await resolve(await node);
    }
  }

  return string;
}
