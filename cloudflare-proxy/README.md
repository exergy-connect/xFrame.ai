# xFrame Gemini proxy

API module for [xFrame.ai](https://github.com/exergy-connect/xFrame.ai) that keeps the long-lived Gemini API key off the client. It is **bundled into the `xframe-ai` Worker** (see root [`wrangler.jsonc`](../wrangler.jsonc) and [`src/worker.js`](../src/worker.js)), which also serves the résumé static assets.

Endpoints (same origin as the deck, e.g. `https://xframe-ai.jvb127.workers.dev`):

- `POST /v1/chat/completions`: limited OpenAI-compatible chat for xFrame's runtime LLM and translation filters. Forwards `response_format` of type `json_object` / `json_schema` to Gemini structured outputs (`responseMimeType` + `responseJsonSchema`).
- `POST /v1/live-token`: constrained, single-use ephemeral token for browser-to-Gemini Live TTS.
- `GET /health`: deployment health check (requires an allowed `Origin`).

Optional standalone deploy of this folder alone (`name`: `xframe-gemini-proxy`) is still supported via this directory's `wrangler.jsonc`, but the primary production target is root `xframe-ai`.

## Local setup

```bash
cd cloudflare-proxy
npm install
cp .dev.vars.example .dev.vars
npm test
npm run dev
```

For the combined Worker (assets + API):

```bash
# from repo root
npx wrangler dev
```

Edit `ALLOWED_ORIGINS` in the root `wrangler.jsonc` (and optionally this folder's copy). Origins are exact and comma-separated; do not include a trailing slash. Keep `.dev.vars` out of version control.

Test the REST endpoint (against `wrangler dev` or the deployed Worker):

```bash
curl https://xframe-ai.jvb127.workers.dev/v1/chat/completions \
  -H 'Origin: https://xframe-ai.jvb127.workers.dev' \
  -H 'Content-Type: application/json' \
  --data '{"model":"gemini-3.1-flash-lite","messages":[{"role":"user","content":"Say hello"}]}'
```

## Deploy

From the **repo root** (recommended):

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Point xFrame's runtime LLM base URL at the Worker origin with a `/v1` suffix, e.g. `https://xframe-ai.jvb127.workers.dev/v1`. The Worker ignores `Authorization`. Until xFrame gains an explicit proxy mode, its runtime validation still requires a non-empty API-key field; use a non-secret placeholder such as `cloudflare-proxy`, never the Gemini key.

## Production protection

The model, input size, and maximum output tokens are controlled by Worker configuration. For a public deployment, also:

1. Uncomment the `ratelimits` binding in `wrangler.jsonc` and choose a namespace ID and threshold.
2. Configure Turnstile and store its secret with `npx wrangler secret put TURNSTILE_SECRET_KEY`. Send each client token in `X-Turnstile-Token`.
3. Narrow `ALLOWED_ORIGINS` to the deployed presentation origins you serve.
4. Configure Gemini project billing alerts and quotas.

CORS is a browser boundary, not authentication. Rate limiting and/or Turnstile prevent third parties from consuming the Gemini quota by calling the Worker directly. Same-origin calls from the résumé on `xframe-ai` still send an `Origin` header that must be listed.

## Live TTS client contract

Call `/v1/live-token` immediately before opening the socket. Connect to the returned `websocketUrl` with `?access_token=<token>`. Ephemeral tokens require the constrained `v1alpha` Live endpoint and expire quickly; never cache them.
