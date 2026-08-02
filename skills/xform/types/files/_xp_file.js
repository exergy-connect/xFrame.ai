/**
 * Kernel `_xp_file` — load .xp / .xpt text (parse handled by compiler).
 * Statically imported; not resolved via _type._templates.
 */

/**
 * @param {string} href file: or https: URL
 * @param {(url: string) => string} readText
 * @returns {string}
 */
export function loadXpFile(href, readText) {
  return readText(href);
}
