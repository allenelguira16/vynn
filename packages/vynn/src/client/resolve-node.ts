import { JSX } from "../jsx";
// import { type Template } from "./$$tmpl";

export function resolveNode(child: () => JSX.Element): Node[] {
  return resolveElement(child());
}

function resolveElement(element: JSX.Element): Node[] {
  if (element === null || element === undefined || element === false) {
    return [document.createTextNode("")];
  }

  if (typeof element === "string" || typeof element === "number") {
    return [new Text(String(element))];
  }

  if (element instanceof Node) {
    return [element];
  }

  return element.flatMap(resolveElement);
}
