import {
  ASYNC_DATA_SSR_KEY,
  ERROR_BOUNDARY_DATA_SSR_KEY,
} from "../const";
import {
  ASYNC_OWNER_ID_RESERVATIONS_KEY,
  getAsyncOwnerIDReservations,
  getAsyncValues,
} from "../context/async-context";
import { getErrorBoundaryValues } from "../context/error-boundary-context";
import { getRenderMode } from "../context/render-mode";
import { serializeServerFunctionValue } from "../server-functions/serialization";

/**
 * Serialize async resource values, owner reservations, and Catch state after
 * string rendering. This deliberately has no dependency on SSR_NODE classes.
 */
export function renderSsrStringUtilities(): string {
  const asyncValues = getAsyncValues();
  const ownerIDReservations = getAsyncOwnerIDReservations();
  const errorValues = getErrorBoundaryValues();

  if (
    (!asyncValues || Object.keys(asyncValues).length === 0) &&
    ownerIDReservations.length === 0 &&
    (!errorValues || errorValues.length === 0)
  ) {
    return "";
  }

  const encodedAsyncValues: Record<string, unknown> = Object.fromEntries(
    Object.entries(asyncValues ?? {}).map(([key, value]) => [
      key,
      serializeServerFunctionValue(value),
    ]),
  );

  if (ownerIDReservations.length > 0) {
    encodedAsyncValues[ASYNC_OWNER_ID_RESERVATIONS_KEY] = ownerIDReservations;
  }

  const values = {
    async: serializeForInlineScript(encodedAsyncValues),
    mode: serializeForInlineScript(getRenderMode()),
    error: serializeForInlineScript(errorValues),
  };

  return `<script>${ASYNC_DATA_SSR_KEY}=${values.async};${ERROR_BOUNDARY_DATA_SSR_KEY}=${values.error};document.currentScript.remove();</script>`.replaceAll(
    "\n",
    "",
  );
}

function serializeForInlineScript(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\\u2028/g, "\\u2028")
    .replace(/\\u2029/g, "\\u2029");
}
