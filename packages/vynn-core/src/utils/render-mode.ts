let renderMode: "sync" | "async" | "stream" | undefined;

export function getRenderMode() {
  return renderMode;
}

export function setRenderMode(type: "sync" | "async" | "stream") {
  renderMode = type;
}
