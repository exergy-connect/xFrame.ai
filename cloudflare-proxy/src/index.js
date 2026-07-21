import { resolveEdgeVoice, synthesizeEdgeTts } from "./edge-tts.js";

const GEMINI_API = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.5-flash";
/** Prefer 3.1; free tier is ~10 RPD per TTS model, so fall back to 2.5 then Edge. */
const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_FALLBACK_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
/** Default max chars for chat/TTS prompt input (`MAX_INPUT_CHARS`). */
const DEFAULT_MAX_INPUT_CHARS = 40_000;
/** Max chars when embedding context in the invite URL/token (`contextStorage: "token"`). */
const DEFAULT_INVITE_MAX_CONTEXT_CHARS = 500;
/** Max chars for plaintext context stored in Workers KV (`contextStorage: "file"`). */
const DEFAULT_INVITE_MAX_KV_CONTEXT_CHARS = 5000;
/**
 * Minimum gap between MAX_INPUT_CHARS and INVITE_MAX_KV_CONTEXT_CHARS so invite
 * context leaves room for the rest of the model prompt.
 */
const MIN_INPUT_KV_CONTEXT_HEADROOM = 25_000;
/** Cloudflare Workers KV per-value size limit (bytes); not configurable. */
const CLOUDFLARE_KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;
const DEFAULT_INVITE_CONTEXT_DIR = "contexts";
/** Magic header for encrypted invite context files (gzip → AES-256-GCM). */
const CONTEXT_FILE_MAGIC = new Uint8Array([0x58, 0x46, 0x43, 0x31]); // XFC1
const CONTEXT_FILE_PATH_RE = /^contexts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.ctx$/;
/** Invite-granted runtime capabilities (aligned with xFrame.present invite-feature). */
const INVITE_FEATURES = new Set(["pdf_extract", "text_to_speech"]);

const GEMINI_MALE_VOICES = new Set([
  "Charon", "Orus", "Alnilam", "Fenrir", "Iapetus", "Algenib",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/invite") {
      try {
        assertInviteKvContextHeadroom(env);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, {
          status: error instanceof ClientError ? error.status : 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return invitePage(request, env);
    }
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return originAllowed(origin, env.ALLOWED_ORIGINS)
        ? new Response(null, { status: 204, headers: cors })
        : jsonError(403, "Origin is not allowed");
    }
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) {
      return jsonError(403, "Origin is not allowed");
    }

    if (request.method === "POST" && url.pathname === "/invite/mint") {
      try {
        assertInviteKvContextHeadroom(env);
        return await mintInvite(request, env, cors);
      } catch (error) {
        if (error instanceof ClientError) return jsonError(error.status, error.message, cors);
        console.error("Invite minting failed", error instanceof Error ? error.message : String(error));
        return jsonError(500, "Could not mint invite", cors);
      }
    }
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        assertInviteKvContextHeadroom(env);
      } catch (error) {
        return jsonError(503, error instanceof Error ? error.message : String(error), cors);
      }
      return json({ ok: true }, 200, cors);
    }
    if (request.method !== "POST") {
      return jsonError(405, "Method not allowed", cors);
    }

    const limited = await isRateLimited(request, env);
    if (limited) return jsonError(429, "Rate limit exceeded", cors);

    const turnstileError = await verifyTurnstile(request, env);
    if (turnstileError) return jsonError(403, turnstileError, cors);

    const inviteError = await verifyInvite(request, env, url.pathname);
    if (inviteError) return jsonError(401, inviteError, cors);

    try {
      if (url.pathname === "/v1/chat/completions") {
        return await chatCompletions(request, env, cors);
      }
      if (url.pathname === "/v1/audio/speech") {
        return await audioSpeech(request, env, cors);
      }
      if (url.pathname === "/v1/live-token") {
        return await createLiveToken(env, cors);
      }
      return jsonError(404, "Not found", cors);
    } catch (error) {
      if (error instanceof ClientError) return jsonError(error.status, error.message, cors);
      console.error("Unhandled proxy error", error instanceof Error ? error.message : String(error));
      return jsonError(500, "Proxy request failed", cors);
    }
  },
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ClientError(401, "Invite token is malformed");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function transformBytes(bytes, stream) {
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function compressText(value) {
  return base64UrlEncode(await transformBytes(encoder.encode(value), new CompressionStream("gzip")));
}

async function decompressText(value) {
  try {
    return decoder.decode(await transformBytes(base64UrlDecode(value), new DecompressionStream("gzip")));
  } catch {
    throw new ClientError(401, "Invite context is invalid");
  }
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function inviteContextDir(env) {
  const raw = String(env?.INVITE_CONTEXT_DIR || DEFAULT_INVITE_CONTEXT_DIR).trim().replace(/^\/+|\/+$/g, "");
  return raw || DEFAULT_INVITE_CONTEXT_DIR;
}

/** Build a repo-relative context path for an invite id (must match CONTEXT_FILE_PATH_RE). */
export function contextFilePathForInvite(inviteId, env = {}) {
  const id = String(inviteId || "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new ClientError(500, "Invite id is invalid");
  }
  const dir = inviteContextDir(env);
  if (dir !== DEFAULT_INVITE_CONTEXT_DIR) {
    throw new ClientError(500, `INVITE_CONTEXT_DIR must be "${DEFAULT_INVITE_CONTEXT_DIR}"`);
  }
  return `${dir}/${id}.ctx`;
}

export function validateContextFileClaims(contextFile, contextKey) {
  if (typeof contextFile !== "string" || !CONTEXT_FILE_PATH_RE.test(contextFile)) {
    throw new ClientError(401, "Invite context file is invalid");
  }
  if (typeof contextKey !== "string" || !contextKey) {
    throw new ClientError(401, "Invite context key is invalid");
  }
  let keyBytes;
  try { keyBytes = base64UrlDecode(contextKey); }
  catch { throw new ClientError(401, "Invite context key is invalid"); }
  if (keyBytes.length !== 32) throw new ClientError(401, "Invite context key is invalid");
}

/**
 * Compress and encrypt invite context for static file storage.
 * File layout: XFC1 magic (4) + IV (12) + AES-GCM ciphertext+tag.
 * AAD binds invite id and relative path so swapped files fail decryption.
 */
export async function encryptContextFile(plaintext, inviteId, relativePath) {
  const gzipped = await transformBytes(encoder.encode(plaintext), new CompressionStream("gzip"));
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const aad = encoder.encode(`${inviteId}|${relativePath}`);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    gzipped,
  ));
  return {
    bytes: concatBytes(CONTEXT_FILE_MAGIC, iv, ciphertext),
    contextKey: base64UrlEncode(keyBytes),
  };
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function signInvite(claims, secret) {
  requireSecret(secret, "INVITE_SIGNING_SECRET");
  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${payload}.${base64UrlEncode(await hmac(secret, payload))}`;
}

export async function verifyInviteToken(token, secret, now = Date.now()) {
  requireSecret(secret, "INVITE_SIGNING_SECRET");
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) throw new ClientError(401, "Invite token is malformed");
  const expected = await hmac(secret, payload);
  const actual = base64UrlDecode(signature);
  if (actual.length !== expected.length) throw new ClientError(401, "Invite token signature is invalid");
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected[i] ^ actual[i];
  if (mismatch) throw new ClientError(401, "Invite token signature is invalid");
  let claims;
  try { claims = JSON.parse(decoder.decode(base64UrlDecode(payload))); }
  catch { throw new ClientError(401, "Invite token payload is invalid"); }
  if (claims.context !== undefined) throw new ClientError(401, "Invite context format is invalid");
  const hasGzip = claims.contextGzip !== undefined;
  const hasFile = claims.contextFile !== undefined || claims.contextKey !== undefined;
  if (hasGzip && hasFile) throw new ClientError(401, "Invite context format is invalid");
  if (hasGzip) {
    if (typeof claims.contextGzip !== "string") throw new ClientError(401, "Invite context is invalid");
    claims.context = await decompressText(claims.contextGzip);
    delete claims.contextGzip;
  } else if (hasFile) {
    if (claims.contextFile === undefined || claims.contextKey === undefined) {
      throw new ClientError(401, "Invite context format is invalid");
    }
    validateContextFileClaims(claims.contextFile, claims.contextKey);
  }
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isInteger(claims.nbf) || nowSeconds < claims.nbf) throw new ClientError(401, "Invite is not active yet");
  if (!Number.isInteger(claims.exp) || nowSeconds >= claims.exp) throw new ClientError(401, "Invite has expired");
  if (!Number.isInteger(claims.calls) || claims.calls < 1) throw new ClientError(401, "Invite call allowance is invalid");
  if (typeof claims.origin !== "string" || !claims.origin) throw new ClientError(401, "Invite origin is invalid");
  return claims;
}

/**
 * Store an encrypted invite context blob in Workers KV (`INVITE_CONTEXTS`).
 * Rejects values above the Cloudflare per-value size limit.
 *
 * @param {object} env
 * @param {{ path: string, bytes: Uint8Array, expiration?: number }} opts
 * @returns {Promise<{ stored: true }>}
 */
export async function storeContextFile(env, { path, bytes, expiration }) {
  const kv = env.INVITE_CONTEXTS;
  if (!kv || typeof kv.put !== "function") {
    throw new ClientError(500, "INVITE_CONTEXTS KV binding is not configured");
  }
  if (typeof path !== "string" || !CONTEXT_FILE_PATH_RE.test(path)) {
    throw new ClientError(500, "Invite context path is invalid");
  }
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new ClientError(500, "Invite context bytes are invalid");
  }
  if (bytes.length > CLOUDFLARE_KV_MAX_VALUE_BYTES) {
    throw new ClientError(
      400,
      `Encrypted context exceeds the ${CLOUDFLARE_KV_MAX_VALUE_BYTES}-byte Workers KV value limit`,
    );
  }
  const options = {};
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number.isInteger(expiration)) {
    // KV absolute expiration must be at least 60s in the future.
    if (expiration >= nowSeconds + 60) options.expiration = expiration;
    else options.expirationTtl = 60;
  }
  await kv.put(path, bytes, options);
  return { stored: true };
}

/**
 * Serve a stored invite context from Workers KV (same path contract as static assets).
 *
 * @param {object} env
 * @param {string} path Relative path such as `contexts/<uuid>.ctx`
 * @returns {Promise<Response>}
 */
export async function serveInviteContext(env, path) {
  if (typeof path !== "string" || !CONTEXT_FILE_PATH_RE.test(path)) {
    return new Response("Not found", { status: 404 });
  }
  const kv = env.INVITE_CONTEXTS;
  if (!kv || typeof kv.get !== "function") {
    return new Response("Not found", { status: 404 });
  }
  const value = await kv.get(path, { type: "arrayBuffer" });
  if (value == null) return new Response("Not found", { status: 404 });
  return new Response(value, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeContextStorage(raw) {
  if (raw === undefined || raw === null || raw === "") return "file";
  if (typeof raw !== "string") throw new ClientError(400, "contextStorage must be \"file\" or \"token\"");
  const value = raw.trim().toLowerCase();
  if (value !== "file" && value !== "token") {
    throw new ClientError(400, "contextStorage must be \"file\" or \"token\"");
  }
  return value;
}

/** TTS / Live mint require a signed invite; chat completions stay origin-gated. */
function pathRequiresInvite(pathname) {
  return pathname === "/v1/audio/speech" || pathname === "/v1/live-token";
}

async function verifyInvite(request, env, pathname = new URL(request.url).pathname) {
  if (!env.INVITE_SIGNING_SECRET) return null;
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return pathRequiresInvite(pathname) ? "A signed invite token is required" : null;
  }
  try {
    const claims = await verifyInviteToken(match[1], env.INVITE_SIGNING_SECRET);
    const origin = request.headers.get("Origin");
    if (!origin || origin !== claims.origin) return "Invite is not valid for this origin";
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invite token is invalid";
  }
}

async function mintInvite(request, env, cors = {}) {
  requireSecret(env.INVITE_ADMIN_SECRET, "INVITE_ADMIN_SECRET");
  requireSecret(env.INVITE_SIGNING_SECRET, "INVITE_SIGNING_SECRET");
  const supplied = request.headers.get("Authorization") || "";
  if (supplied !== `Bearer ${env.INVITE_ADMIN_SECRET}`) throw new ClientError(401, "Admin secret is invalid");
  const body = await readJson(request);
  let target;
  try { target = new URL(body.url); } catch { throw new ClientError(400, "url must be an absolute HTTP(S) URL"); }
  if (!["http:", "https:"].includes(target.protocol)) throw new ClientError(400, "url must be an HTTP(S) URL");
  const notBefore = Date.parse(body.notBefore);
  const expiresAt = Date.parse(body.expiresAt);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt)) {
    throw new ClientError(400, "notBefore and expiresAt must be valid dates");
  }
  // Day-mode defaults use local midnight for "today", which can be almost a day ago in UTC.
  if (notBefore < Date.now() - 36 * 60 * 60_000) throw new ClientError(400, "notBefore is too far in the past");
  if (expiresAt <= Math.max(notBefore, Date.now())) throw new ClientError(400, "expiresAt must be after notBefore");
  const maxWindow = positiveInt(env.INVITE_MAX_WINDOW_SECONDS, 30 * 24 * 60 * 60) * 1000;
  if (expiresAt - notBefore > maxWindow) throw new ClientError(400, "Invite time window is too long");
  const calls = Number(body.calls);
  const maxCalls = positiveInt(env.INVITE_MAX_CALLS, 20);
  if (!Number.isInteger(calls) || calls < 1 || calls > maxCalls) {
    throw new ClientError(400, `calls must be between 1 and ${maxCalls}`);
  }
  if (body.context !== undefined && typeof body.context !== "string") {
    throw new ClientError(400, "context must be a string");
  }
  const context = body.context?.trim();
  const contextStorage = normalizeContextStorage(body.contextStorage);
  const maxTokenContextChars = positiveInt(env.INVITE_MAX_CONTEXT_CHARS, DEFAULT_INVITE_MAX_CONTEXT_CHARS);
  const maxKvContextChars = positiveInt(env.INVITE_MAX_KV_CONTEXT_CHARS, DEFAULT_INVITE_MAX_KV_CONTEXT_CHARS);
  if (context && contextStorage === "token" && context.length > maxTokenContextChars) {
    throw new ClientError(400, `context must be at most ${maxTokenContextChars} characters when embedded in the token`);
  }
  if (context && contextStorage === "file" && context.length > maxKvContextChars) {
    throw new ClientError(400, `context must be at most ${maxKvContextChars} characters when stored in KV`);
  }
  const features = normalizeInviteFeatures(body.features);
  const inviteId = crypto.randomUUID();
  const claims = {
    v: context && contextStorage === "file" ? 2 : 1,
    id: inviteId,
    origin: target.origin,
    nbf: Math.floor(notBefore / 1000),
    exp: Math.floor(expiresAt / 1000),
    calls,
    ...(features.length ? { features } : {}),
  };

  let contextStored = false;
  if (context) {
    if (contextStorage === "token") {
      claims.contextGzip = await compressText(context);
    } else {
      const contextFile = contextFilePathForInvite(inviteId, env);
      const encrypted = await encryptContextFile(context, inviteId, contextFile);
      claims.contextFile = contextFile;
      claims.contextKey = encrypted.contextKey;
      await storeContextFile(env, {
        path: contextFile,
        bytes: encrypted.bytes,
        expiration: claims.exp,
      });
      contextStored = true;
    }
  }

  const token = await signInvite(claims, env.INVITE_SIGNING_SECRET);
  target.searchParams.set("xframe_invite", token);
  const {
    contextGzip: _gzip,
    contextKey: _key,
    ...publicClaims
  } = claims;
  const responseBody = {
    url: target.toString(),
    token,
    claims: context ? { ...publicClaims, context } : publicClaims,
    ...(contextStored ? { contextStored: true } : {}),
  };
  return json(responseBody, 201, cors);
}

function invitePage(request, env) {
  const presentationUrl = `${new URL(request.url).origin}/`;
  const maxTokenContextChars = positiveInt(env.INVITE_MAX_CONTEXT_CHARS, DEFAULT_INVITE_MAX_CONTEXT_CHARS);
  const maxKvContextChars = positiveInt(env.INVITE_MAX_KV_CONTEXT_CHARS, DEFAULT_INVITE_MAX_KV_CONTEXT_CHARS);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mint xFrame invite</title><style>
body{font:16px system-ui,sans-serif;max-width:72rem;margin:3rem auto;padding:0 1rem;color:#172033}
form{display:grid;grid-template-columns:minmax(0,1fr) minmax(24rem,1.15fr);gap:1rem 2rem;align-items:start}
.invite-fields{display:grid;gap:1rem}
.context-field{align-self:stretch}
label{display:grid;gap:.35rem;font-weight:650}
label.check{display:flex;align-items:center;gap:.55rem;font-weight:650}
label.check input{width:auto;margin:0;padding:0}
input,textarea,button,select{font:inherit;padding:.7rem;border:1px solid #aab3c3;border-radius:.45rem}
textarea{box-sizing:border-box;width:100%;min-height:25rem;resize:vertical;line-height:1.45}
.context-meta{text-align:right;font-weight:400}
button{background:#2959c8;color:#fff;border:0;font-weight:700;cursor:pointer}
button{grid-column:1/-1}
output{display:block;margin-top:1.5rem;padding:1rem;background:#f3f6fb;border-radius:.5rem;overflow-wrap:anywhere}
small{color:#596579}
@media(max-width:48rem){
  body{margin:1.5rem auto}
  form{grid-template-columns:1fr}
  textarea{min-height:18rem}
  button{grid-column:auto}
}
</style></head><body>
<h1>Mint an invited URL</h1>
<p>Create a signed link that activates runtime AI only during its time window. Call usage is loosely enforced by the recipient's browser cache. Context is stored as an encrypted Workers KV object by default so the invite token stays short.</p>
<form id="mint">
  <div class="invite-fields">
    <label>Presentation URL<input name="url" type="url" required value="${presentationUrl}"></label>
    <label>Active from<input name="notBefore" type="date" required></label>
    <label>Expires at<input name="expiresAt" type="date" required></label>
    <label class="check"><input name="preciseTime" type="checkbox"> Set specific times of day</label>
    <label>Maximum AI calls<input name="calls" type="number" min="1" max="20" value="5" required></label>
    <label>Context storage<select name="contextStorage">
      <option value="file" selected>Encrypted file in Workers KV (default)</option>
      <option value="token">Embed gzip in token</option>
    </select></label>
    <label class="check"><input name="pdfExtract" type="checkbox"> Allow PDF extract</label>
    <label class="check"><input name="textToSpeech" type="checkbox"> Allow text-to-speech</label>
    <label>Admin secret<input name="secret" type="password" required autocomplete="current-password"></label>
  </div>
  <label class="context-field">Context description (optional)
    <textarea name="context" rows="16" placeholder="Purpose or recipient of this invite" aria-describedby="context-count"></textarea>
    <small class="context-meta" id="context-count"><span id="context-length">0</span><span id="context-limit"></span></small>
  </label>
  <button>Mint URL</button>
</form>
<output id="result" hidden></output>
<script>
const form = document.querySelector('#mint');
const fromInput = form.elements.notBefore;
const untilInput = form.elements.expiresAt;
const precise = form.elements.preciseTime;
const contextInput = form.elements.context;
const contextStorage = form.elements.contextStorage;
const contextLength = document.querySelector('#context-length');
const contextLimit = document.querySelector('#context-limit');
const maxTokenContextChars = ${maxTokenContextChars};
const maxKvContextChars = ${maxKvContextChars};
const pad = (n) => String(n).padStart(2, '0');
const dateValue = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dateTimeValue = (d) => dateValue(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
function addBusinessDays(from, days) {
  const d = startOfDay(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return d;
}
function parseLocalDate(value) {
  const [y, m, day] = String(value).split('-').map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}
function applyDayDefaults() {
  const today = startOfDay(new Date());
  const until = addBusinessDays(today, 5);
  fromInput.type = 'date';
  untilInput.type = 'date';
  fromInput.value = dateValue(today);
  untilInput.value = dateValue(until);
}
function applyTimeDefaults() {
  const today = startOfDay(new Date());
  const until = addBusinessDays(today, 5);
  const active = new Date();
  active.setMinutes(0, 0, 0);
  fromInput.type = 'datetime-local';
  untilInput.type = 'datetime-local';
  fromInput.value = dateTimeValue(active);
  untilInput.value = dateTimeValue(endOfDay(until));
}
function syncMode() {
  if (precise.checked) applyTimeDefaults();
  else applyDayDefaults();
}
function syncContextLimit() {
  const tokenMode = contextStorage.value === 'token';
  const limit = tokenMode ? maxTokenContextChars : maxKvContextChars;
  contextInput.setAttribute('maxlength', String(limit));
  contextLimit.textContent = tokenMode
    ? (' / ' + maxTokenContextChars + ' characters (token limit)')
    : (' / ' + maxKvContextChars + ' characters (KV limit)');
  contextLength.textContent = contextInput.value.length;
}
precise.addEventListener('change', syncMode);
contextStorage.addEventListener('change', syncContextLimit);
contextInput.addEventListener('input', () => { contextLength.textContent = contextInput.value.length; });
applyDayDefaults();
syncContextLimit();
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const out = document.querySelector('#result');
  out.hidden = false;
  out.textContent = 'Minting…';
  try {
    const fromRaw = String(data.get('notBefore') || '');
    const untilRaw = String(data.get('expiresAt') || '');
    const notBefore = precise.checked ? new Date(fromRaw) : startOfDay(parseLocalDate(fromRaw));
    const expiresAt = precise.checked ? new Date(untilRaw) : endOfDay(parseLocalDate(untilRaw));
    const features = [];
    if (data.get('pdfExtract') === 'on') features.push('pdf_extract');
    if (data.get('textToSpeech') === 'on') features.push('text_to_speech');
    const response = await fetch('/invite/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.get('secret') },
      body: JSON.stringify({
        url: data.get('url'),
        notBefore: notBefore.toISOString(),
        expiresAt: expiresAt.toISOString(),
        calls: Number(data.get('calls')),
        context: String(data.get('context') || ''),
        contextStorage: String(data.get('contextStorage') || 'file'),
        ...(features.length ? { features } : {}),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'Request failed');
    const safeUrl = String(body.url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    let html = '<strong>Invited URL</strong><br><a rel="noreferrer" href="'
      + safeUrl + '">' + safeUrl
      + '</a><br><small>Copy this link. The token is a credential.</small>';
    if (body.contextStored && body.claims?.contextFile) {
      const safePath = String(body.claims.contextFile).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      html += '<br><small>Context stored in Workers KV at ' + safePath + '.</small>';
    }
    out.innerHTML = html;
  } catch (error) {
    out.textContent = error.message;
  }
});
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Validate and normalize optional invite `features` against the known allowlist. */
function normalizeInviteFeatures(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ClientError(400, "features must be an array of strings");
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new ClientError(400, "features must be an array of strings");
    }
    const feature = entry.trim();
    if (!INVITE_FEATURES.has(feature)) {
      throw new ClientError(400, `Unknown invite feature: ${feature}`);
    }
    if (seen.has(feature)) continue;
    seen.add(feature);
    out.push(feature);
  }
  return out;
}

export async function chatCompletions(request, env, cors = {}) {
  requireSecret(env.GEMINI_API_KEY, "GEMINI_API_KEY");
  const body = await readJson(request);
  if (body.stream === true) throw new ClientError(400, "Streaming is not supported");
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new ClientError(400, "messages must be a non-empty array");
  }

  const configuredModel = env.GEMINI_MODEL || DEFAULT_MODEL;
  if (body.model && body.model !== configuredModel) {
    throw new ClientError(400, `Only model ${configuredModel} is allowed`);
  }

  const maxChars = positiveInt(env.MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const messages = normalizeMessages(body.messages, maxChars);
  const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  if (contents.length === 0) throw new ClientError(400, "At least one user message is required");

  const requestedTokens = positiveInt(body.max_tokens, positiveInt(env.MAX_OUTPUT_TOKENS, 2048));
  const maxOutputTokens = Math.min(requestedTokens, positiveInt(env.MAX_OUTPUT_TOKENS, 2048));
  const structured = geminiGenerationConfigFromResponseFormat(body.response_format);
  const generationConfig = {
    maxOutputTokens,
    ...structured,
  };
  const started = Date.now();
  console.log("[xFrame proxy] chat/completions", {
    model: configuredModel,
    messageCount: messages.length,
    systemChars: systemText.length,
    userChars: contents.reduce((sum, entry) => sum + (entry.parts[0]?.text?.length || 0), 0),
    maxOutputTokens,
    responseFormatType: body.response_format?.type ?? null,
    structuredOutputs: {
      responseMimeType: generationConfig.responseMimeType ?? null,
      hasResponseJsonSchema: Boolean(generationConfig.responseJsonSchema),
      schemaKeys: generationConfig.responseJsonSchema && typeof generationConfig.responseJsonSchema === "object"
        ? Object.keys(generationConfig.responseJsonSchema)
        : [],
    },
    systemPreview: previewText(systemText, 400),
    userPreview: previewText(contents[0]?.parts?.[0]?.text || "", 400),
  });

  const upstream = await fetch(
    `${GEMINI_API}/v1beta/models/${encodeURIComponent(configuredModel)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        contents,
        generationConfig,
      }),
    },
  );
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error("[xFrame proxy] Gemini generateContent failed", {
      status: upstream.status,
      errorStatus: payload?.error?.status || "unknown",
      message: payload?.error?.message || "Gemini request failed",
      ms: Date.now() - started,
    });
    return jsonError(upstream.status, payload?.error?.message || "Gemini request failed", cors);
  }

  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!content) {
    console.error("[xFrame proxy] Gemini returned no content", {
      finishReason: payload.candidates?.[0]?.finishReason || null,
      ms: Date.now() - started,
    });
    return jsonError(502, "Gemini returned no content", cors);
  }
  console.log("[xFrame proxy] Gemini ok", {
    model: configuredModel,
    ms: Date.now() - started,
    finishReason: payload.candidates?.[0]?.finishReason || null,
    promptTokens: payload.usageMetadata?.promptTokenCount || 0,
    completionTokens: payload.usageMetadata?.candidatesTokenCount || 0,
    outputChars: content.length,
    outputPreview: previewText(content, 400),
  });
  return json({
    id: crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: configuredModel,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason(payload) }],
    usage: {
      prompt_tokens: payload.usageMetadata?.promptTokenCount || 0,
      completion_tokens: payload.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: payload.usageMetadata?.totalTokenCount || 0,
    },
  }, 200, cors);
}

/**
 * Narration TTS cascade (exact recitation, not Live dialog):
 *   1. Gemini 3.1 Flash TTS (~10 free RPD)
 *   2. Gemini 2.5 Flash TTS (~10 free RPD, separate quota)
 *   3. Microsoft Edge Read Aloud (no Gemini key / unlimited for this use)
 */
export async function audioSpeech(request, env, cors = {}) {
  const body = await readJson(request);
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) throw new ClientError(400, "input must be a non-empty string");

  const maxChars = positiveInt(env.MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const style = typeof body.style === "string" ? body.style.trim() : "";
  const prompt = style ? `${style}\n\n${input}` : input;
  if (prompt.length > maxChars) {
    throw new ClientError(413, `Message content exceeds ${maxChars} characters (got ${prompt.length})`);
  }

  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "auto";
  if (provider && !["auto", "gemini", "edge"].includes(provider)) {
    throw new ClientError(400, 'provider must be "auto", "gemini", or "edge"');
  }

  const geminiVoice = typeof body.voice === "string" && body.voice.trim()
    ? body.voice.trim()
    : "Kore";
  const locale = typeof body.locale === "string" && body.locale.trim()
    ? body.locale.trim()
    : (typeof body.language === "string" && body.language.trim() ? body.language.trim() : "en-US");
  const gender = body.gender === "male" || GEMINI_MALE_VOICES.has(geminiVoice)
    ? "male"
    : body.gender === "female"
      ? "female"
      : "female";
  const voiceIndex = Number.isInteger(body.voice_index) ? body.voice_index
    : Number.isInteger(body.voiceIndex) ? body.voiceIndex
      : 0;
  const edgeVoice = await resolveEdgeVoice({
    locale,
    gender,
    voiceIndex,
    edgeVoice: typeof body.edgeVoice === "string" ? body.edgeVoice : undefined,
  });
  const models = geminiTtsModels(env, body.model);
  const started = Date.now();
  const attempts = [];
  console.log("[xFrame proxy] audio/speech", {
    provider,
    models,
    locale,
    gender,
    geminiVoice,
    edgeVoice,
    inputChars: input.length,
    styleChars: style.length,
    preview: previewText(input, 240),
  });

  if (provider !== "edge" && typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim()) {
    for (const model of models) {
      const result = await tryGeminiTts({
        apiKey: env.GEMINI_API_KEY,
        model,
        voice: geminiVoice,
        prompt,
      });
      attempts.push(result.attempt);
      if (result.ok) {
        console.log("[xFrame proxy] Gemini TTS ok", {
          model,
          voice: geminiVoice,
          mimeType: result.mimeType,
          ms: Date.now() - started,
          attempts,
        });
        return json({
          audio: result.audio,
          mimeType: result.mimeType,
          voice: geminiVoice,
          model,
          provider: "gemini",
        }, 200, cors);
      }
      console.warn("[xFrame proxy] Gemini TTS attempt failed", result.attempt);
      if (!result.retryable) {
        return jsonError(result.status || 502, result.message || "Gemini TTS request failed", cors);
      }
    }
  } else if (provider === "gemini") {
    throw new ClientError(503, "GEMINI_API_KEY is not configured");
  }

  if (provider === "gemini") {
    const last = attempts[attempts.length - 1];
    return jsonError(last?.status || 502, last?.message || "Gemini TTS request failed", cors);
  }

  try {
    const edge = await synthesizeEdgeTts(input, { voice: edgeVoice, locale });
    const audio = bytesToBase64(edge.audio);
    console.log("[xFrame proxy] Edge TTS ok", {
      voice: edge.voice,
      locale: edge.locale,
      mimeType: edge.mimeType,
      ms: Date.now() - started,
      audioBytes: edge.audio.byteLength,
      attempts,
    });
    return json({
      audio,
      mimeType: edge.mimeType,
      voice: edge.voice,
      locale: edge.locale,
      model: "edge-tts",
      provider: "edge",
    }, 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[xFrame proxy] Edge TTS failed", {
      ms: Date.now() - started,
      error: message,
      attempts,
    });
    if (attempts.length) {
      const last = attempts[attempts.length - 1];
      return jsonError(
        last.status || 502,
        `Gemini TTS exhausted and Edge fallback failed: ${message}`,
        cors,
      );
    }
    return jsonError(502, `Edge TTS failed: ${message}`, cors);
  }
}

function geminiTtsModels(env, requested) {
  const primary = env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL;
  const secondary = env.GEMINI_TTS_FALLBACK_MODEL || DEFAULT_TTS_FALLBACK_MODEL;
  const models = [];
  if (typeof requested === "string" && requested.trim()) {
    const want = requested.trim();
    if (want !== primary && want !== secondary) {
      throw new ClientError(400, `Only models ${primary} or ${secondary} are allowed`);
    }
    models.push(want);
  }
  for (const model of [primary, secondary]) {
    if (model && !models.includes(model)) models.push(model);
  }
  return models;
}

function isGeminiTtsRetryable(status, payload) {
  if (status === 429 || status === 503 || status >= 500) return true;
  const code = String(payload?.error?.status || "").toUpperCase();
  if (code === "RESOURCE_EXHAUSTED" || code === "UNAVAILABLE" || code === "INTERNAL") return true;
  const message = String(payload?.error?.message || "").toLowerCase();
  return message.includes("quota") || message.includes("rate limit") || message.includes("resource exhausted");
}

async function tryGeminiTts({ apiKey, model, voice, prompt }) {
  const started = Date.now();
  try {
    const upstream = await fetch(
      `${GEMINI_API}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice },
              },
            },
          },
        }),
      },
    );
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return {
        ok: false,
        retryable: isGeminiTtsRetryable(upstream.status, payload),
        status: upstream.status,
        attempt: {
          provider: "gemini",
          model,
          status: upstream.status,
          errorStatus: payload?.error?.status || null,
          message: payload?.error?.message || "Gemini TTS request failed",
          ms: Date.now() - started,
        },
        message: payload?.error?.message || "Gemini TTS request failed",
      };
    }
    const inline = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      return {
        ok: false,
        retryable: true,
        status: 502,
        attempt: {
          provider: "gemini",
          model,
          status: 502,
          message: "Gemini TTS returned no audio",
          finishReason: payload.candidates?.[0]?.finishReason || null,
          ms: Date.now() - started,
        },
        message: "Gemini TTS returned no audio",
      };
    }
    return {
      ok: true,
      audio: inline.data,
      mimeType: inline.mimeType || "audio/L16;rate=24000",
      attempt: {
        provider: "gemini",
        model,
        status: 200,
        ms: Date.now() - started,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      retryable: true,
      status: 502,
      attempt: {
        provider: "gemini",
        model,
        status: 502,
        message,
        ms: Date.now() - started,
      },
      message,
    };
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function createLiveToken(env, cors = {}) {
  requireSecret(env.GEMINI_API_KEY, "GEMINI_API_KEY");
  const model = env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  const now = Date.now();
  const expireMs = positiveInt(env.LIVE_TOKEN_EXPIRE_MS, 30 * 60_000);
  const newSessionExpireMs = positiveInt(env.LIVE_TOKEN_NEW_SESSION_EXPIRE_MS, 60_000);
  // Wire format matches @google/genai tokens.create (fields at top level; constraints
  // land on bidiGenerateContentSetup after the SDK unwraps liveConnectConstraints.setup).
  const modelResource = model.startsWith("models/") ? model : `models/${model}`;
  const upstream = await fetch(`${GEMINI_API}/v1alpha/auth_tokens?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + expireMs).toISOString(),
      newSessionExpireTime: new Date(now + newSessionExpireMs).toISOString(),
      bidiGenerateContentSetup: {
        model: modelResource,
        generationConfig: { responseModalities: ["AUDIO"] },
      },
    }),
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error("Gemini auth token request failed", upstream.status, payload?.error?.status || "unknown");
    return jsonError(upstream.status, payload?.error?.message || "Token request failed", cors);
  }
  return json({
    token: payload.name,
    model,
    expiresAt: payload.expireTime,
    newSessionExpiresAt: payload.newSessionExpireTime,
    websocketUrl: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained",
  }, 200, cors);
}

function previewText(value, max = 400) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (+${text.length - max} chars)`;
}

function normalizeMessages(messages, maxChars) {
  let total = 0;
  return messages.map((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw new ClientError(400, "Each message needs a supported role and string content");
    }
    total += message.content.length;
    if (total > maxChars) throw new ClientError(413, `Message content exceeds ${maxChars} characters (got ${total})`);
    return { role: message.role, content: message.content };
  });
}

/**
 * Map OpenAI/OpenRouter `response_format` onto Gemini `generationConfig`.
 * xFrame prompt front matter uses `type: "json_schema"`; without this mapping the
 * schema is silently dropped and the model ignores structured-output constraints.
 */
export function geminiGenerationConfigFromResponseFormat(responseFormat) {
  if (!responseFormat || typeof responseFormat !== "object" || Array.isArray(responseFormat)) {
    return {};
  }
  const type = responseFormat.type;
  if (type === "json_object") {
    return { responseMimeType: "application/json" };
  }
  if (type === "json_schema") {
    const jsonSchema = responseFormat.json_schema;
    const schema = jsonSchema && typeof jsonSchema === "object" && !Array.isArray(jsonSchema)
      ? jsonSchema.schema
      : undefined;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      throw new ClientError(400, "response_format.json_schema.schema must be an object");
    }
    return {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    };
  }
  return {};
}

async function verifyTurnstile(request, env) {
  if (!env.TURNSTILE_SECRET_KEY) return null;
  const token = request.headers.get("X-Turnstile-Token");
  if (!token) return "Turnstile token is required";
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || undefined,
    }),
  });
  const verification = await result.json();
  return verification.success ? null : "Turnstile validation failed";
}

async function isRateLimited(request, env) {
  if (!env.RATE_LIMITER) return false;
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await env.RATE_LIMITER.limit({ key });
  return !result.success;
}

function originAllowed(origin, configured) {
  if (!origin) return false;
  const allowed = String(configured || "").split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(origin, configured) {
  if (!originAllowed(origin, configured)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // Authorization is ignored by the Worker but xFrame's BYOA client always sends it.
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Turnstile-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new ClientError(415, "Content-Type must be application/json");
  try { return await request.json(); } catch { throw new ClientError(400, "Request body must be valid JSON"); }
}

function finishReason(payload) {
  const reason = payload.candidates?.[0]?.finishReason;
  return reason === "MAX_TOKENS" ? "length" : "stop";
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Ensure invite KV context leaves at least MIN_INPUT_KV_CONTEXT_HEADROOM chars
 * under MAX_INPUT_CHARS for the rest of the prompt. Used at deploy check and runtime.
 *
 * @param {Record<string, unknown>} env
 * @throws {ClientError} when the configured gap is too small
 */
export function assertInviteKvContextHeadroom(env) {
  const maxInputChars = positiveInt(env?.MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const maxKvContextChars = positiveInt(
    env?.INVITE_MAX_KV_CONTEXT_CHARS,
    DEFAULT_INVITE_MAX_KV_CONTEXT_CHARS,
  );
  const headroom = maxInputChars - maxKvContextChars;
  if (headroom < MIN_INPUT_KV_CONTEXT_HEADROOM) {
    throw new ClientError(
      503,
      `INVITE_MAX_KV_CONTEXT_CHARS (${maxKvContextChars}) must be at least `
      + `${MIN_INPUT_KV_CONTEXT_HEADROOM} less than MAX_INPUT_CHARS (${maxInputChars}); `
      + `got headroom ${headroom}`,
    );
  }
}

function requireSecret(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ClientError(503, `${name} is not configured`);
  }
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function jsonError(status, message, headers = {}) {
  return json({ error: { message, type: "proxy_error" } }, status, headers);
}

class ClientError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
