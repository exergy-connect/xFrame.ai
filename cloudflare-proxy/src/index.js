import { resolveEdgeVoice, synthesizeEdgeTts } from "./edge-tts.js";

const GEMINI_API = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.5-flash";
/** Prefer 3.1; free tier is ~10 RPD per TTS model, so fall back to 2.5 then Edge. */
const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_FALLBACK_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

const GEMINI_MALE_VOICES = new Set([
  "Charon", "Orus", "Alnilam", "Fenrir", "Iapetus", "Algenib",
]);

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

  const maxChars = positiveInt(env.MAX_INPUT_CHARS, 30_000);
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
