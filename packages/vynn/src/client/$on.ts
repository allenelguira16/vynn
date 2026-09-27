export function $on<K extends keyof HTMLElementEventMap>(
  element: Node,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
) {
  // console.log("REGISTER EVENT", event);

  element.addEventListener(event, (e) => {
    // console.log("EVENT FIRED", event);
    handler(e as HTMLElementEventMap[K]);
  });
}
