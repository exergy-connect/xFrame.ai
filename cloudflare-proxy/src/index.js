const GEMINI_API = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export default {
  async fetch(request, env) {
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

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, cors);
    }
    if (request.method !== "POST") {
      return jsonError(405, "Method not allowed", cors);
    }

    const limited = await isRateLimited(request, env);
    if (limited) return jsonError(429, "Rate limit exceeded", cors);

    const turnstileError = await verifyTurnstile(request, env);
    if (turnstileError) return jsonError(403, turnstileError, cors);

    try {
      if (url.pathname === "/v1/chat/completions") {
        return await chatCompletions(request, env, cors);
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

  const maxChars = positiveInt(env.MAX_INPUT_CHARS, 30_000);
  const messages = normalizeMessages(body.messages, maxChars);
  const systemText = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages.filter((m) => m.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  if (contents.length === 0) throw new ClientError(400, "At least one user message is required");

  const requestedTokens = positiveInt(body.max_tokens, positiveInt(env.MAX_OUTPUT_TOKENS, 2048));
  const maxOutputTokens = Math.min(requestedTokens, positiveInt(env.MAX_OUTPUT_TOKENS, 2048));
  const generationConfig = { maxOutputTokens };
  const responseMimeType = body.response_format?.type === "json_object" ? "application/json" : undefined;
  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;

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
    console.error("Gemini generateContent failed", upstream.status, payload?.error?.status || "unknown");
    return jsonError(upstream.status, payload?.error?.message || "Gemini request failed", cors);
  }

  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!content) return jsonError(502, "Gemini returned no content", cors);
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
