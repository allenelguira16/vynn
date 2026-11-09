/**
 * Internal constants shared by Vynn's server-function runtime.
 *
 * This module is intentionally not exposed as a package subpath.
 */

/** Default HTTP endpoint used by Vynn server-function RPC calls. */
export const DEFAULT_SERVER_FUNCTION_ENDPOINT = "/__vynn/server-function";

/** Default maximum request body size: 1 MiB. */
export const DEFAULT_MAX_SERVER_FUNCTION_REQUEST_BYTES = 1024 * 1024;

/** Absolute maximum request body size: 25 MiB. */
export const MAX_SERVER_FUNCTION_REQUEST_BYTES = 25 * 1024 * 1024;

/** Generated server-function identifier format. */
export const SERVER_FUNCTION_ID_RE = /^vynn_[a-f0-9]{20}$/;
