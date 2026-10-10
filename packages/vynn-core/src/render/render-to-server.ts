import { createOwner, disposeOwner, runWithOwner } from "../life-cycle/owner";
import { JSX } from "../types/jsx";
import { setRenderMode } from "../utils/render-mode";
import { SSR_NODE } from "./resolve-node";

export function renderToServer(
  App: () => JSX.Element,
  mode: "sync" | "async" | "stream",
) {
  setRenderMode(mode);

  const owner = createOwner();
  return runWithOwner(owner, () => {
    // const app = App() as unknown as SSR_NODE[];

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

    for (const node of app.filter(Boolean)) {
      if (Array.isArray(node)) {
        string += resolve(node);
      } else if ("children" in node) {
        let attr = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attr = !!attr.length ? ` ${attr}` : attr;
        string += `<${node.type}${attr}>${resolve(node.children)}</${node.type}>`;
      } else if (node.type === "#text") {
        string += node.value;
      }
    }

    return string;
  }

  return resolve(App() as unknown as SSR_NODE[]);
}

// const asyncContext = new Map<SSR_NODE, Promise<JSX.Element>>();
const asyncPromises: Promise<SSR_NODE>[] = [];

export function registerAsyncPromises(
  _fallback: JSX.Element,
  promises: Promise<JSX.Element>,
) {
  // asyncContext.set(node as unknown as SSR_NODE, promises);
  asyncPromises.push(promises as unknown as Promise<SSR_NODE>);
}

function resolveAsync(App: () => JSX.Element) {
  // console.log(asyncPromises);

  async function resolve(app: SSR_NODE[]) {
    // console.log(asyncPromises);
    let string = "";
    for (const node of app.flat(Infinity).filter(Boolean)) {
      if ("value" in node && node.type === "#text") {
        // console.log(node);
        string += node.value;
      } else if ("loader" in node && node.type === "#async") {
        await node.pending;

        console.log(node.content());
      } else if ("children" in node) {
        let attr = Object.entries(node.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        attr = !!attr.length ? ` ${attr}` : attr;
        string += `<${node.type}${attr}>${await resolve(node.children)}</${node.type}>`;
      } else {
        // console.log(node);
      }
    }

    return string;
  }

  return resolve(App() as unknown as SSR_NODE[]);
}

// // let id = 0;
// const asyncPromiseContext = new Map<number, Promise<JSX.Element>>();

// // export function getAsyncID() {
// //   return id;
// // }
// let controller: ReadableStreamDefaultController<string>;
// let asyncID = 0;

// export function registerAsyncPromise(promise: Promise<JSX.Element>) {
//   // const id = getOwnerContext<number>("async-id")!;
//   asyncPromiseContext.set(asyncID, promise);
//   asyncID++;
// }

// export function getAsyncID() {
//   return asyncID;
// }

// // export function getController() {
// //   return controller;
// // }

// async function resolveStream(App: () => JSX.Element) {
//   return new ReadableStream<string>({
//     async start(controller) {
//       // const owner = getCurrentOwner()!;
//       // controller = baseController;
//       setOwnerContext("controller", controller);
//       // setOwnerContext("async-id", 0);
//       // console.log();
//       // controller = baseController;
//       // console.log(await resolveAsync(app));

//       // queueMicrotask(() => {
//       controller.enqueue(resolveSync(App));

//       // async function queue() {
//       //   // const asyncID = getOwnerContext<number>("async-id")!;
//       //   const promise = asyncPromiseContext.get(asyncID);

//       //   console.log(promise);
//       //   // console.log(asyncID);
//       //   if (promise) {
//       //     // let resolved = await promise;
//       //     // resolved = resolveSync(() => resolved);
//       //     // console.log(resolved);
//       //     // controller.enqueue(`
//       //     //   <template async-id="${asyncID}">${resolved}</template>
//       //     //   <script type="text/javascript">
//       //     //     const html = document.querySelector('template[async-id="${asyncID}"]').content.cloneNode(true)
//       //     //     const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
//       //     //     let start = null;
//       //     //     let end = null;
//       //     //     while (walker.nextNode()) {
//       //     //       const node = walker.currentNode;
//       //     //       if (node.nodeValue === "$:${asyncID}") start = node;
//       //     //       if (node.nodeValue === "/:${asyncID}") end = node;
//       //     //     }
//       //     //     if (start && end) {
//       //     //       const range = document.createRange();
//       //     //       range.setStartAfter(start);
//       //     //       range.setEndBefore(end);
//       //     //       range.deleteContents();
//       //     //       range.insertNode(html);
//       //     //       start.remove();
//       //     //       end.remove();
//       //     //     }
//       //     //   </script>
//       //     // `);
//       //     // // setOwnerContext("async-id", asyncID + 1);
//       //     // await queue();
//       //   } else {
//       //     controller.close();
//       //   }
//       // }

//       // await queue();

//       // });

//       controller.close();
//     },
//     cancel() {
//       console.log("cancelled");
//     },
//   });
// }
