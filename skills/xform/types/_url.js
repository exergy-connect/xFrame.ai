/**
 * Kernel `_url` — statically imported by the engine (not loaded via _templates).
 */

/**
 * @typedef {{
 *   scheme: string;
 *   host: string;
 *   path: string[];
 *   query: string;
 *   fragment: string;
 *   href: string;
 * }} UrlSemantic
 */

/**
 * @param {string} authored
 * @param {string} [baseDir]
 * @returns {UrlSemantic}
 */
export function from__url_string(authored, baseDir) {
  if (typeof authored !== "string" || authored.trim() === "") {
    throw new Error("expected non-empty _url string");
  }
  const trimmed = authored.trim();

  // Document-relative `file://./…` — resolve against baseDir.
  if (trimmed === "file://." || trimmed.startsWith("file://./")) {
    const rel = trimmed === "file://." ? "" : trimmed.slice("file://./".length);
    const root = baseDir || ".";
    const resolved = joinPath(root, rel || ".");
    const asDir =
      trimmed.endsWith("/") || rel === "" || rel.endsWith("/")
        ? resolved.endsWith("/")
          ? resolved
          : `${resolved}/`
        : resolved;
    return from__url_string(pathToBaseUrl(asDir));
  }

  let url;
  try {
    url = baseDir
      ? new URL(trimmed, pathToBaseUrl(baseDir))
      : new URL(trimmed);
  } catch {
    throw new Error(`invalid _url: ${trimmed}`);
  }
  const pathParts = url.pathname
    .split("/")
    .filter((segment, index) => !(index === 0 && segment === ""));
  return {
    scheme: url.protocol.replace(/:$/, ""),
    host: url.host,
    path: pathParts,
    query: url.search.startsWith("?") ? url.search.slice(1) : url.search,
    fragment: url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
    href: url.href,
  };
}

/**
 * @param {UrlSemantic} url
 * @returns {string}
 */
export function to__url_string(url) {
  if (url && typeof url.href === "string") {
    return url.href;
  }
  throw new Error("expected _url semantic object with href");
}

/**
 * @param {UrlSemantic} base
 * @param {string} instanceId
 * @param {string} ext  e.g. ".xpt" or ".js"
 * @returns {string} resolved href
 */
export function resolveArtifactUrl(base, instanceId, ext) {
  const extension = ext.startsWith(".") ? ext : `.${ext}`;
  const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
  return new URL(`${instanceId}${extension}`, baseHref).href;
}

/**
 * @param {string} baseDir
 * @returns {string}
 */
function pathToBaseUrl(baseDir) {
  const normalized = baseDir.replace(/\\/g, "/");
  const withSlash = normalized.endsWith("/") ? normalized : `${normalized}/`;
  if (withSlash.startsWith("file:")) {
    return withSlash;
  }
  const abs = withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
  return `file://${abs}`;
}

/**
 * @param {string} root
 * @param {string} rel
 * @returns {string}
 */
function joinPath(root, rel) {
  const a = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const b = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!b || b === ".") {
    return a;
  }
  if (b.startsWith("/")) {
    return b;
  }
  return `${a}/${b}`;
}
