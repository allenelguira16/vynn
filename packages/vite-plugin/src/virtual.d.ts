declare module "virtual:vynn/server-functions" {
  /**
   * Dispatch a Vynn server-function RPC request.
   *
   * Returns null when the request URL does not match the configured endpoint.
   * Otherwise returns the HTTP response for the RPC request.
   */
  export function handleServerFunctionRequest(
    request: Request,
  ): Promise<Response | null>;
}
