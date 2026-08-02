/**
 * Kernel `_list` — parametric container; statically imported.
 * Element validation is performed by the TypeScript applicator (applyType).
 */

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
export function coerceList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error("expected list");
}
