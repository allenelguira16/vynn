export class NotReadyError extends Error {
  constructor(public readonly promise: Promise<any>) {
    super();
    this.name = "NotReadyError";
  }
}
