# xFrame Gemini proxy

API module for [xFrame.ai](https://github.com/exergy-connect/xFrame.ai) that keeps the long-lived Gemini API key off the client. It is **bundled into the `xframe-ai` Worker** (see root [`wrangler.jsonc`](../wrangler.jsonc) and [`src/worker.js`](../src/worker.js)), which also serves the résumé static assets.

Endpoints (same origin as the deck, e.g. `https://xframe-ai.jvb127.workers.dev`):

- `GET /invite`: admin web interface for minting signed presentation URLs.
- `POST /invite/mint`: admin-secret-protected minting API. The signed token limits its presentation origin, activation/expiry window, and browser-enforced AI call allowance.
- `POST /v1/chat/completions`: limited OpenAI-compatible chat for xFrame's runtime LLM and translation filters. Forwards `response_format` of type `json_object` / `json_schema` to Gemini structured outputs (`responseMimeType` + `responseJsonSchema`).
- `POST /v1/audio/speech`: exact-recitation narration. Cascades Gemini 3.1 Flash TTS → Gemini 2.5 Flash TTS → Microsoft Edge Read Aloud (each Gemini free tier is ~10 RPD).
- `POST /v1/live-token`: constrained, single-use ephemeral token for Gemini Live (conversational voice agents — not slide narration).
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
npx wrangler secret put INVITE_SIGNING_SECRET
npx wrangler secret put INVITE_ADMIN_SECRET
# Optional: commit encrypted invite context files into the presentation repo
npx wrangler secret put CONTEXT_COMMIT_TOKEN
npx wrangler deploy
```

Open `/invite`, enter the target presentation URL, allowed time window, AI-call allowance, optional context description, context storage mode, optional **Allow PDF extract** / **Allow text-to-speech** features, and `INVITE_ADMIN_SECRET`, then share the resulting URL.

**Context storage (default: encrypted file):**
- Context is trimmed and limited by `INVITE_MAX_CONTEXT_CHARS` (1,000 characters when unset or invalid).
- **File mode (default):** gzip → AES-256-GCM into `contexts/<invite-id>.ctx`. The signed token carries only `contextFile` (relative path) and `contextKey` (decode key). When `CONTEXT_COMMIT_TOKEN` and `CONTEXT_COMMIT_REPO` are set, minting fires a GitHub `repository_dispatch` (`invite-context`) so [`.github/workflows/invite-context.yml`](../.github/workflows/invite-context.yml) commits the file under `docs/examples/resume/` and redeploys. Without those secrets, the mint response includes a downloadable artifact for manual placement.
- **Token mode (`contextStorage: "token"`):** keeps the previous behaviour — gzip-compressed context embedded as `contextGzip` in the token; verification transparently expands it to `context`.

Optional `features` (for example `["pdf_extract", "text_to_speech"]`) are stored on the signed claims; unknown feature ids are rejected. `INVITE_SIGNING_SECRET` requires a signed invite for `/v1/audio/speech` and `/v1/live-token` (Gemini TTS / Live). `/v1/chat/completions` stays origin-gated (and rate-limited) so résumé adaptation works without an invite; when an invite Bearer is sent, it is still verified. Use separate, long random values for the invite secrets. During migration, omitting `INVITE_SIGNING_SECRET` leaves the existing origin-based behavior in place.

Configure file commits with:

| Name | Kind | Purpose |
| --- | --- | --- |
| `CONTEXT_COMMIT_TOKEN` | secret | GitHub PAT that can create `repository_dispatch` events |
| `CONTEXT_COMMIT_REPO` | var | `owner/repo` (default in wrangler: `exergy-connect/xFrame.ai`) |
| `CONTEXT_COMMIT_REF` | optional secret/var | Branch for the workflow checkout |
| `INVITE_CONTEXT_DIR` | var | Must stay `contexts` (path contract with the presentation runtime) |

The proxy cryptographically enforces invite signature, activation/expiry window, and presentation origin for TTS/Live. The call allowance is intentionally loose: xFrame records each uncached invited AI request in that browser's `localStorage`. Clearing site data or switching browsers resets the local counter; use a Cloudflare rate-limit binding when a hard server-side quota is required.

Point xFrame's runtime LLM base URL at the Worker origin with a `/v1` suffix, e.g. `https://xframe-ai.jvb127.workers.dev/v1`. For the Cloudflare proxy preset, use a non-secret placeholder such as `cloudflare-proxy` in the BYOA form (never the Gemini key). Omit `Authorization` for uninvited chat; send `Authorization: Bearer <xframe_invite>` when an invite is present or when calling TTS/Live.

## Production protection

The model, input size, and maximum output tokens are controlled by Worker configuration. For a public deployment, also:

1. Uncomment the `ratelimits` binding in `wrangler.jsonc` and choose a namespace ID and threshold.
2. Configure Turnstile and store its secret with `npx wrangler secret put TURNSTILE_SECRET_KEY`. Send each client token in `X-Turnstile-Token`.
3. Narrow `ALLOWED_ORIGINS` to the deployed presentation origins you serve.
4. Configure Gemini project billing alerts and quotas.

CORS is a browser boundary, not authentication. Rate limiting and/or Turnstile prevent third parties from consuming the Gemini quota by calling the Worker directly. Same-origin calls from the résumé on `xframe-ai` still send an `Origin` header that must be listed.

## Narration TTS client contract

Call `POST /v1/audio/speech` with JSON:

```json
{ "input": "<script>", "voice": "Charon", "gender": "male", "locale": "nl-NL", "provider": "auto" }
```

Cascade (`provider: "auto"`, default):

1. `GEMINI_TTS_MODEL` (default `gemini-3.1-flash-tts-preview`)
2. `GEMINI_TTS_FALLBACK_MODEL` (default `gemini-2.5-flash-preview-tts`) on quota/5xx
3. Microsoft Edge Read Aloud — voice chosen from `locale` + `gender` (Edge voice list, with static fallbacks)

Response: `{ audio, mimeType, voice, locale?, model, provider }` where `audio` is base64 (Gemini PCM/L16 or Edge `audio/mpeg`).

Do **not** use `/v1/live-token` for presentation narration — Live Native Audio is a conversational agent and will often greet like a phone attendant instead of reading the script.

## Live token client contract (agents only)

Call `/v1/live-token` immediately before opening the socket. Connect to the returned `websocketUrl` with `?access_token=<token>`. Ephemeral tokens require the constrained `v1alpha` Live endpoint and expire quickly; never cache them.
