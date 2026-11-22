export class NotReadyError extends Error {
  constructor(
    public readonly promise: Promise<unknown>,
    public readonly boundary?: (promise: Promise<unknown>) => void,
  ) {
    super();
    this.name = "NotReadyError";
  }
}
