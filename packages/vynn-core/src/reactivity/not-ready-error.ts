export class NotReadyError extends Error {
  constructor(
    public readonly promise: Promise<any>,
    public readonly handledByBoundary = false,
  ) {
    super();
    this.name = "NotReadyError";
  }
}
