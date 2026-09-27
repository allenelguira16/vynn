// import { type State } from "../reactivity/$state";
// import { $effect } from "../reactivity/$effect";
// import { resolveNode } from "./resolve-node";
// import { $$loop } from "./$$loop";

// export type Template = {
//   element: Node;

//   on<K extends keyof HTMLElementEventMap>(
//     event: K,
//     handler: (event: HTMLElementEventMap[K]) => void,
//   ): Template;

//   attr(name: string, value: () => string | null | undefined): Template;
// };

// const elements: Node[] = [];

// export function getCurrentElement() {
//   return elements.pop();
// }

export function $tmpl(key: keyof HTMLElementTagNameMap) {
  const element = document.createElement(key);
  // elements.push(element);
  return element;
  // let html: Node = document.createElement(key);

  // if (key === "comment") {
  //   html = document.createComment("");
  // }

  // if (key === "fragment") {
  //   html = document.createDocumentFragment();
  // }

  // if (key === "text") {
  //   html = document.createTextNode("");
  // }

  // let element = html.cloneNode();

  // const template: Template = {
  //   element,
  //   on: (event, handler) => {
  //     element.addEventListener(event, handler as EventListener);
  //     return template;
  //   },
  //   attr: (name, value) => {
  //     if (!(element instanceof HTMLElement)) return template;

  //     $effect(() => {
  //       const attribute = value();
  //       if (attribute === null || attribute === undefined) {
  //         element.removeAttribute(name);
  //       } else {
  //         element.setAttribute(name, attribute);
  //       }
  //     });

  //     return template;
  //   },
  // };

  // return template.element;
}
