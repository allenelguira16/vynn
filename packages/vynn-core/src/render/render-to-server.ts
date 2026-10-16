import { characterCodeToRegularExpressionFlag } from "typescript/unstable/ast";
import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { escapeHtml } from "../utils/escape-html";
import { setRenderMode } from "../utils/render-mode";
import { resolveNode, SSR_NODE } from "./resolve-node";
import { NotReadyError } from "../components/boundary";

export function renderToServer(
  App: () => JSX.Element,
  mode: "sync" | "async" | "stream",
) {
  setRenderMode(mode);

  const owner = createOwner();
  return runWithOwner(owner, () => {
    if (mode === "sync") {
      try {
        return resolveSync(App);
      } finally {
        disposeOwner(owner);
      }
    }

    if (mode === "async") {
      return resolveAsync(App).finally(() => {
        disposeOwner(owner);
      });
    }

    // if (mode === "stream") {
    //   return resolveStream(App);
    // }
  });
}

function resolveSync(App: () => JSX.Element) {
  function resolve(app: SSR_NODE[]) {
    let string = "";

    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("value" in node && node.type === "#text") {
        // console.log(node);
        string += escapeHtml(node.value);
      } else if ("value" in node && node.type === "#comment") {
        string += `<!--${node.value}-->`;
      } else if ("children" in node) {
        let attr = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attr = !!attr.length ? ` ${attr}` : attr;
        string += `<${node.type}${attr}>${resolve(node.children)}</${node.type}>`;
      }
    }

    return string;
  }

  return resolve(App() as unknown as SSR_NODE[]);
}

async function resolveAsync(App: () => JSX.Element): Promise<string> {
  async function resolve(app: SSR_NODE[]): Promise<string> {
    let html = "";
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if (node instanceof Function) {
        html += await resolve(
          resolveNode(
            node as unknown as () => JSX.Element,
          ) as unknown as SSR_NODE[],
        );
      } else if ("value" in node && node.type === "#text") {
        html += escapeHtml(node.value);
      } else if ("fallback" in node) {
        // html += await resolve(node.content());
        try {
          console.log(node.content());
        } catch (error) {
          // console.log(node)
          if (error instanceof NotReadyError) {
            await error.promise;
            console.log(node.content());
          }
        }
        // // console.log(node.children);
        // let attributes = Object.entries(node.attributes)
        //   .map(([key, value]) => `${key}="${value}"`)
        //   .join(" ");
        // attributes = attributes ? ` ${attributes}` : "";

        // // console.log();
        // html += `<${node.type}${attributes}>${await resolve(node.children)}</${node.type}>`;
      } else if ("children" in node) {
        // console.log(node.children);
        let attributes = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attributes = attributes ? ` ${attributes}` : "";

        // console.log();
        html += `<${node.type}${attributes}>${await resolve(node.children)}</${node.type}>`;
      } else if (node instanceof Promise) {
        html += await resolve(await node);
      }
    }

    return html;
    //   let html = "";
    //   for (const node of app.flat(Infinity).filter(Boolean)) {
    //     if (node.type === "#async" && "resolve" in node) {
    //       html += await resolve(await node.resolve());
    //       // console.log(await node.resolve());
    //     } else if ("value" in node && node.type === "#text") {
    //       html += escapeHtml(node.value);
    //     } else if ("value" in node && node.type === "#comment") {
    //       html += `<!--${node.value}-->`;
    //     } else if ("children" in node) {
    //       let attributes = Object.entries(node.attributes)
    //         .map(([key, value]) => `${key}="${value}"`)
    //         .join(" ");
    //       attributes = attributes ? ` ${attributes}` : "";
    //       html += `<${node.type}${attributes}>`;
    //       const children = (await Promise.all(
    //         node.children,
    //       )) as unknown as JSX.Element[];
    //       // console.log();
    //       html += await resolve(
    //         resolveNode(() => children) as unknown as SSR_NODE[],
    //       );
    //       html += `</${node.type}>`;
    //     }
    //   }
    //   return html;
  }

  return resolve(resolveNode(App) as unknown as SSR_NODE[]);

  // return "" as string;
}

// export type StreamContext = {
//   asyncID: 0;
//   queue: (
//     promise: Promise<any>,
//     asyncID: number,
//     children: () => JSX.Element,
//   ) => void;
// };

// async function resolveStream(App: () => JSX.Element) {
//   function resolve(app: SSR_NODE[]) {
//     // console.log(app);
//     return resolveSync(() => app as unknown as JSX.Element);
//   }

//   return new ReadableStream<string>({
//     async start(controller) {
//       let isPending = false;
//       setOwnerContext<StreamContext>("stream-context", {
//         // controller,
//         async queue(promise, asyncID, children) {
//           try {
//             isPending = true;

//             await promise;
//             children();
//           } catch (error) {
//             // console.log(error);
//             if (error instanceof Promise) {
//               this.queue(error, asyncID, children);
//             } else {
//               throw error;
//             }
//           }
//           // controller.enqueue
//         },
//         asyncID: 0,
//       });

//       const result = resolve(App() as unknown as SSR_NODE[]);

//       // console.log(result);
//       controller.enqueue(result);

//       // controller.close();
//     },
//     cancel() {
//       console.log("cancelled");
//     },
//   });
// }
