/**
 * Kernel `_javascript` — load user JS modules from a locator.
 * This module itself is statically imported by the engine.
 */

/**
 * @param {string} href file: URL to a .js module
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadJavascriptModule(href) {
  const mod = await import(href);
  return /** @type {Record<string, unknown>} */ (mod);
}
