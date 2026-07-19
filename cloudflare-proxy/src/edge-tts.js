/**
 * Microsoft Edge Read Aloud TTS for Cloudflare Workers.
 * Uses fetch() WebSocket upgrade (Workers can set Sec-WebSocket-Version / Origin).
 */

export const DEFAULT_EDGE_VOICE = "en-US-EmmaMultilingualNeural";
export const DEFAULT_EDGE_LOCALE = "en-US";

const READALOUD_BASE =
  "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VOICE_LIST_URL = `https://${READALOUD_BASE}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
const SYNTHESIS_URL = `https://${READALOUD_BASE}/edge/v1`;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const VOICE_CACHE_TTL_MS = 60 * 60_000;

/** Last-resort voices when the Edge voice list is unavailable. */
const STATIC_EDGE_VOICES = {
  "en-US": { male: "en-US-GuyNeural", female: "en-US-EmmaMultilingualNeural" },
  "en-GB": { male: "en-GB-RyanNeural", female: "en-GB-SoniaNeural" },
  "nl-NL": { male: "nl-NL-MaartenNeural", female: "nl-NL-ColetteNeural" },
  "de-DE": { male: "de-DE-ConradNeural", female: "de-DE-KatjaNeural" },
  "fr-FR": { male: "fr-FR-HenriNeural", female: "fr-FR-DeniseNeural" },
  "es-ES": { male: "es-ES-AlvaroNeural", female: "es-ES-ElviraNeural" },
  "ja-JP": { male: "ja-JP-KeitaNeural", female: "ja-JP-NanamiNeural" },
};

const BASE_HEADERS = {
  "User-Agent":
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) `
    + `Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  "Accept-Language": "en-US,en;q=0.9",
};

const VOICE_HEADERS = {
  ...BASE_HEADERS,
  Authority: "speech.platform.bing.com",
  "Sec-CH-UA": `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR_VERSION}", "Chromium";v="${CHROMIUM_MAJOR_VERSION}"`,
  "Sec-CH-UA-Mobile": "?0",
  Accept: "*/*",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
};

let voiceCache = { at: 0, voices: null };

const UPGRADE_HEADERS = {
  ...BASE_HEADERS,
  "Accept-Encoding": "gzip, deflate, br, zstd",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Sec-WebSocket-Version": "13",
  Upgrade: "websocket",
};

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function removeInvalidXmlCharacters(text) {
  return String(text).replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    " ",
  );
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
}

function connectionId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function muid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function secMsGec() {
  const winEpoch = 11_644_473_600;
  let ticks = Date.now() / 1000;
  ticks += winEpoch;
  ticks -= ticks % 300;
  ticks *= 1e9 / 100;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildSpeechConfigMessage() {
  return (
    `X-Timestamp:${timestamp()}\r\n`
    + "Content-Type:application/json; charset=utf-8\r\n"
    + "Path:speech.config\r\n\r\n"
    + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
  );
}

function localeFromVoice(voice) {
  const match = /^([a-z]{2,})-([A-Z]{2,})-/i.exec(String(voice || ""));
  if (!match) return DEFAULT_EDGE_LOCALE;
  return `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
}

function normalizeLocale(value) {
  const raw = String(value || "").trim().replace(/_/g, "-");
  if (!raw) return DEFAULT_EDGE_LOCALE;
  const parts = raw.split("-").filter(Boolean);
  if (parts.length === 1) return parts[0].toLowerCase();
  return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}${parts.length > 2 ? `-${parts.slice(2).join("-")}` : ""}`;
}

function buildSsmlMessage(requestId, voice, text, locale) {
  const lang = escapeXml(normalizeLocale(locale || localeFromVoice(voice)));
  const ssml = (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>`
    + `<voice name='${escapeXml(voice)}'>`
    + `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>`
    + `${escapeXml(removeInvalidXmlCharacters(text))}`
    + `</prosody></voice></speak>`
  );
  return (
    `X-RequestId:${requestId}\r\n`
    + "Content-Type:application/ssml+xml\r\n"
    + `X-Timestamp:${timestamp()}Z\r\n`
    + "Path:ssml\r\n\r\n"
    + ssml
  );
}

function staticEdgeVoice(locale, gender) {
  const normalized = normalizeLocale(locale);
  const lang = normalized.split("-")[0];
  const bucket = STATIC_EDGE_VOICES[normalized]
    || Object.entries(STATIC_EDGE_VOICES).find(([key]) => key.toLowerCase().startsWith(`${lang}-`))?.[1]
    || STATIC_EDGE_VOICES[DEFAULT_EDGE_LOCALE];
  return gender === "male" ? bucket.male : bucket.female;
}

/** Fetch and cache Edge Read Aloud voices. */
export async function listEdgeVoices(options = {}) {
  if (voiceCache.voices && Date.now() - voiceCache.at < VOICE_CACHE_TTL_MS) {
    return voiceCache.voices;
  }
  const fetchImpl = options.fetchImpl || fetch;
  const token = await secMsGec();
  const url = `${VOICE_LIST_URL}&Sec-MS-GEC=${token}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
  const response = await fetchImpl(url, { headers: VOICE_HEADERS });
  if (!response.ok) {
    throw new Error(`Edge voice list failed (${response.status})`);
  }
  const voices = await response.json();
  if (!Array.isArray(voices)) throw new Error("Edge voice list response invalid");
  voiceCache = { at: Date.now(), voices };
  return voices;
}

/** @internal test helper */
export function clearEdgeVoiceCache() {
  voiceCache = { at: 0, voices: null };
}

/**
 * Pick an Edge ShortName for locale + gender.
 * Preference: explicit edgeVoice → exact locale → language prefix → en-US static fallback.
 */
export async function resolveEdgeVoice(options = {}) {
  if (typeof options.edgeVoice === "string" && options.edgeVoice.trim()) {
    return options.edgeVoice.trim();
  }
  const locale = normalizeLocale(options.locale || DEFAULT_EDGE_LOCALE);
  const gender = options.gender === "male" ? "male" : "female";
  const edgeGender = gender === "male" ? "Male" : "Female";
  const index = Number.isInteger(options.voiceIndex) && options.voiceIndex >= 0
    ? options.voiceIndex
    : 0;

  try {
    const voices = await listEdgeVoices({ fetchImpl: options.fetchImpl });
    const lang = locale.split("-")[0].toLowerCase();
    const exact = voices.filter((voice) =>
      String(voice.Locale || "").toLowerCase() === locale.toLowerCase()
      && String(voice.Gender || "") === edgeGender);
    if (exact[index]?.ShortName) return exact[index].ShortName;
    if (exact[0]?.ShortName) return exact[0].ShortName;

    const byLang = voices.filter((voice) =>
      String(voice.Locale || "").toLowerCase().startsWith(`${lang}-`)
      && String(voice.Gender || "") === edgeGender);
    if (byLang[0]?.ShortName) return byLang[0].ShortName;
  } catch {
    // Fall through to static map when the list endpoint is unavailable.
  }
  return staticEdgeVoice(locale, gender);
}

function parseTextHeaders(message) {
  const separator = message.indexOf("\r\n\r\n");
  const headerText = separator >= 0 ? message.slice(0, separator) : message;
  const headers = {};
  for (const line of headerText.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon)] = line.slice(colon + 1).trim();
  }
  return headers;
}

function parseBinaryAudioFrame(data) {
  if (data.length < 2) throw new Error("binary websocket frame missing header length");
  const headerLength = (data[0] << 8) | data[1];
  if (data.length < 2 + headerLength) throw new Error("binary websocket frame truncated");
  const headers = parseTextHeaders(new TextDecoder().decode(data.slice(2, 2 + headerLength)));
  return { headers, body: data.slice(2 + headerLength) };
}

function toUint8ArraySync(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Synthesize MP3 audio via Edge Read Aloud.
 * @returns {{ audio: Uint8Array, mimeType: string, voice: string }}
 */
export async function synthesizeEdgeTts(text, options = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) throw new Error("Edge TTS text must not be empty");
  const locale = normalizeLocale(options.locale || DEFAULT_EDGE_LOCALE);
  const voice = (options.voice || DEFAULT_EDGE_VOICE).trim() || DEFAULT_EDGE_VOICE;
  const fetchImpl = options.fetchImpl || fetch;

  const token = await secMsGec();
  const url = new URL(SYNTHESIS_URL);
  url.searchParams.set("TrustedClientToken", TRUSTED_CLIENT_TOKEN);
  url.searchParams.set("Sec-MS-GEC", token);
  url.searchParams.set("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION);
  url.searchParams.set("ConnectionId", connectionId());

  const response = await fetchImpl(url.toString(), {
    headers: {
      ...UPGRADE_HEADERS,
      Cookie: `muid=${muid()};`,
    },
  });
  const socket = response.webSocket;
  if (response.status !== 101 || !socket) {
    throw new Error(`Edge TTS WebSocket upgrade failed (${response.status})`);
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    let settled = false;
    let audioReceived = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error);
      else if (!audioReceived) reject(new Error("Edge TTS returned no audio"));
      else resolve();
    };

    const ingestAudio = (binary) => {
      const { headers, body } = parseBinaryAudioFrame(binary);
      if (headers.Path !== "audio") {
        throw new Error(`unexpected Edge TTS binary path: ${headers.Path}`);
      }
      if (headers["Content-Type"] !== "audio/mpeg") {
        if (body.length === 0) return;
        throw new Error(`unexpected Edge TTS content type: ${headers["Content-Type"]}`);
      }
      if (body.length) {
        audioReceived = true;
        chunks.push(body);
      }
    };

    socket.addEventListener("message", (event) => {
      try {
        if (typeof event.data === "string") {
          const path = parseTextHeaders(event.data).Path;
          if (path === "turn.end") {
            finish();
            return;
          }
          if (path === "response" || path === "turn.start" || path === "audio.metadata") return;
          finish(new Error(`unexpected Edge TTS path: ${path}`));
          return;
        }
        // Keep binary handling synchronous so turn.end in the same tick cannot race ahead.
        const binary = toUint8ArraySync(event.data);
        if (!binary && typeof Blob !== "undefined" && event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => {
            if (settled) return;
            try {
              ingestAudio(new Uint8Array(buffer));
            } catch (error) {
              finish(error instanceof Error ? error : new Error(String(error)));
            }
          }, (error) => finish(error instanceof Error ? error : new Error(String(error))));
          return;
        }
        if (!binary) {
          finish(new Error("unsupported Edge TTS websocket message"));
          return;
        }
        ingestAudio(binary);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.addEventListener("close", () => {
      if (audioReceived) finish();
      else finish(new Error("Edge TTS closed before audio"));
    });
    socket.addEventListener("error", () => finish(new Error("Edge TTS WebSocket error")));

    socket.accept();
    socket.send(buildSpeechConfigMessage());
    socket.send(buildSsmlMessage(connectionId(), voice, trimmed, locale));
  });

  return {
    audio: concatBytes(chunks),
    mimeType: "audio/mpeg",
    voice,
    locale,
  };
}
