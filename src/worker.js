/**
 * xframe-ai Worker: Gemini proxy API + static résumé assets.
 * API routes are handled by cloudflare-proxy; everything else is ASSETS.
 */
import proxy from "../cloudflare-proxy/src/index.js";

function isApiPath(pathname) {
  return pathname === "/health" || pathname.startsWith("/v1/");
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (isApiPath(pathname)) {
      return proxy.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
