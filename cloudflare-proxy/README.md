# xFrame Gemini proxy

Cloudflare Worker for [xFrame.ai](https://github.com/exergy-connect/xFrame.ai) that keeps the long-lived Gemini API key off the client. It exposes:

- `POST /v1/chat/completions`: a limited OpenAI-compatible endpoint for xFrame's runtime LLM and translation filters.
- `POST /v1/live-token`: a constrained, single-use ephemeral token for browser-to-Gemini Live TTS.
- `GET /health`: deployment health check (requires an allowed `Origin`).

## Local setup

```bash
cd cloudflare-proxy
npm install
cp .dev.vars.example .dev.vars
npm test
npm run dev
```

Edit `ALLOWED_ORIGINS` in `wrangler.jsonc`. Origins are exact and comma-separated; do not include a trailing slash. Keep `.dev.vars` out of version control.

Test the REST endpoint:

```bash
curl http://localhost:8787/v1/chat/completions \
  -H 'Origin: http://localhost:8000' \
  -H 'Content-Type: application/json' \
  --data '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Say hello"}]}'
```

## Deploy

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Set a custom domain or route in `wrangler.jsonc` or the Cloudflare dashboard. Point xFrame's runtime LLM base URL at the Worker origin; xFrame appends `/chat/completions`, so use a base such as `https://ai.example.com/v1`. The Worker ignores `Authorization`. Until xFrame gains an explicit proxy mode, its current runtime validation still requires a non-empty API-key field; use a non-secret placeholder such as `cloudflare-proxy`, never the Gemini key.

## Production protection

The model, input size, and maximum output tokens are controlled by Worker configuration. For a public deployment, also:

1. Uncomment the `ratelimits` binding in `wrangler.jsonc` and choose a namespace ID and threshold.
2. Configure Turnstile and store its secret with `npx wrangler secret put TURNSTILE_SECRET_KEY`. Send each client token in `X-Turnstile-Token`.
3. Replace the default `workers.dev` address with a custom domain and narrow `ALLOWED_ORIGINS` to the deployed presentation.
4. Configure Gemini project billing alerts and quotas.

CORS is a browser boundary, not authentication. Rate limiting and/or Turnstile prevent third parties from consuming the Gemini quota by calling the Worker directly.

## Live TTS client contract

Call `/v1/live-token` immediately before opening the socket. Connect to the returned `websocketUrl` with `?access_token=<token>`. Ephemeral tokens require the constrained `v1alpha` Live endpoint and expire quickly; never cache them.
