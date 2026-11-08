export class NotReadyError extends Error {
  constructor(
    public readonly promise: Promise<any>,
    public readonly boundary?: (promise: Promise<any>) => void,
    public blocking = false,
  ) {
    super();
    this.name = "NotReadyError";
  }
}
