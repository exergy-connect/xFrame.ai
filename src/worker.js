/**
 * xframe-ai Worker: Gemini proxy API + static résumé assets.
 * API routes are handled by cloudflare-proxy; everything else is ASSETS.
 */
import proxy, { serveInviteContext } from "../cloudflare-proxy/src/index.js";

const CONTEXT_PATH_RE = /^\/contexts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ctx$/;

function isApiPath(pathname) {
  return pathname === "/health" || pathname === "/invite" || pathname.startsWith("/invite/") || pathname.startsWith("/v1/");
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && CONTEXT_PATH_RE.test(pathname)) {
      return serveInviteContext(env, pathname.slice(1));
    }
    if (isApiPath(pathname)) {
      return proxy.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
