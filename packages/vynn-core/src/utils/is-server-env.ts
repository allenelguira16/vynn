// let renderMode: "sync" | "async" | "stream" | undefined;

// export function getRenderMode() {
//   return renderMode;
// }

// export function setRenderMode(type: "sync" | "async" | "stream") {
//   renderMode = type;
// }

export const IS_SERVER_ENV = typeof window === "undefined";
