/**
 * Kernel `_dict` — parametric map; statically imported.
 * Entry validation is performed by the TypeScript applicator (applyType).
 */

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function coerceDict(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  throw new Error("expected dict (mapping)");
}
