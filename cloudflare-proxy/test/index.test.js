import assert from "node:assert/strict";
import test from "node:test";
import worker, { geminiGenerationConfigFromResponseFormat, signInvite, verifyInviteToken } from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://resume.example",
  GEMINI_API_KEY: "secret-key",
  GEMINI_MODEL: "gemini-test",
};

test("signs and verifies time-limited invite claims", async () => {
  const now = Date.now();
  const claims = { v: 1, id: "invite-1", origin: "https://resume.example", nbf: Math.floor(now / 1000) - 1, exp: Math.floor(now / 1000) + 60, calls: 4 };
  const token = await signInvite(claims, "signing-secret");
  assert.deepEqual(await verifyInviteToken(token, "signing-secret", now), claims);
  await assert.rejects(() => verifyInviteToken(`${token}x`, "signing-secret", now), /signature is invalid/);
  await assert.rejects(() => verifyInviteToken(token, "signing-secret", now + 61_000), /expired/);
});

test("rejects invite tokens containing an uncompressed context claim", async () => {
  const now = Date.now();
  const token = await signInvite({
    v: 1,
    id: "legacy-context",
    origin: "https://resume.example",
    nbf: Math.floor(now / 1000) - 1,
    exp: Math.floor(now / 1000) + 60,
    calls: 1,
    context: "Uncompressed context",
  }, "signing-secret");
  await assert.rejects(() => verifyInviteToken(token, "signing-secret", now), /context format is invalid/);
});

test("mints an invited presentation URL from the admin web API", async () => {
  const active = new Date(Date.now() + 5 * 60_000);
  const expires = new Date(active.getTime() + 24 * 60 * 60_000);
  const response = await worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/deck?theme=dark",
      notBefore: active.toISOString(),
      expiresAt: expires.toISOString(),
      calls: 7,
      context: "  Candidate interview for platform role  ",
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });
  assert.equal(response.status, 201);
  const body = await response.json();
  const invited = new URL(body.url);
  assert.equal(invited.origin, "https://resume.example");
  assert.equal(invited.searchParams.get("theme"), "dark");
  assert.equal(invited.searchParams.get("xframe_invite"), body.token);
  assert.equal(body.claims.calls, 7);
  assert.equal(body.claims.context, "Candidate interview for platform role");
  assert.equal((await verifyInviteToken(body.token, "signing-secret", active.getTime())).context, "Candidate interview for platform role");
  const encodedClaims = JSON.parse(Buffer.from(body.token.split(".")[0], "base64url").toString());
  assert.equal(typeof encodedClaims.contextGzip, "string");
  assert.equal(Object.hasOwn(encodedClaims, "context"), false);
});

test("invite page defaults to day selection through five business days", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite"), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="url"[^>]*value="https:\/\/proxy\.example\/"/);
  assert.match(html, /name="calls"[^>]*max="20" value="5"/);
  assert.match(html, /<textarea name="context"[^>]*maxlength="1000"[^>]*rows="16"/);
  assert.match(html, /id="context-length">0<\/span> \/ 1000 characters/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) minmax\(24rem,1\.15fr\)/);
  assert.match(html, /name="notBefore" type="date"/);
  assert.match(html, /name="expiresAt" type="date"/);
  assert.match(html, /name="preciseTime" type="checkbox"/);
  assert.match(html, /addBusinessDays\(today, 5\)/);
  assert.match(html, /applyDayDefaults\(\)/);
  assert.doesNotMatch(html, /preciseTime[^>]*checked/);
});

test("invite context limit can be configured through the environment", async () => {
  const customEnv = { ...env, INVITE_MAX_CONTEXT_CHARS: "1200" };
  const page = await worker.fetch(new Request("https://proxy.example/invite"), customEnv);
  const html = await page.text();
  assert.match(html, /<textarea name="context"[^>]*maxlength="1200"/);
  assert.match(html, /id="context-length">0<\/span> \/ 1200 characters/);

  const request = (context) => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
    }),
  }), { ...customEnv, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });

  assert.equal((await request("x".repeat(1200))).status, 201);
  const tooLong = await request("x".repeat(1201));
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.message, /at most 1200/);
});

test("mints invite features and rejects unknown feature ids", async () => {
  const request = (features) => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      features,
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });

  const withFeature = await request(["pdf_extract"]);
  assert.equal(withFeature.status, 201);
  const body = await withFeature.json();
  assert.deepEqual(body.claims.features, ["pdf_extract"]);
  const verified = await verifyInviteToken(body.token, "signing-secret", Date.now() + 2_000);
  assert.deepEqual(verified.features, ["pdf_extract"]);

  const withTts = await request(["text_to_speech"]);
  assert.equal(withTts.status, 201);
  assert.deepEqual((await withTts.json()).claims.features, ["text_to_speech"]);

  const withBoth = await request(["pdf_extract", "text_to_speech"]);
  assert.equal(withBoth.status, 201);
  assert.deepEqual((await withBoth.json()).claims.features, ["pdf_extract", "text_to_speech"]);

  const omitted = await request(undefined);
  assert.equal(omitted.status, 201);
  assert.equal(Object.hasOwn((await omitted.json()).claims, "features"), false);

  const unknown = await request(["not_a_feature"]);
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error.message, /Unknown invite feature/);
});

test("invite page exposes Allow PDF extract and text-to-speech checkboxes", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite"), env);
  const html = await response.text();
  assert.match(html, /name="pdfExtract" type="checkbox"/);
  assert.match(html, /Allow PDF extract/);
  assert.match(html, /name="textToSpeech" type="checkbox"/);
  assert.match(html, /Allow text-to-speech/);
  assert.match(html, /features\.length \? \{ features \} : \{\}/);
});

test("omits blank invite context and rejects invalid context descriptions", async () => {
  const request = (context) => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });

  const blank = await request("   ");
  assert.equal(blank.status, 201);
  assert.equal(Object.hasOwn((await blank.json()).claims, "context"), false);

  const nonString = await request({ description: "no" });
  assert.equal(nonString.status, 400);
  assert.match((await nonString.json()).error.message, /context must be a string/);

  const tooLong = await request("x".repeat(1001));
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.message, /at most 1000/);
});

test("rejects invite activation times that are too far in the past", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() - 37 * 60 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /past/);
});

test("allows minting invites that activate immediately", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });
  assert.equal(response.status, 201);
});

test("allows minting invites from local midnight today through end of a business-day window", async () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  let left = 5;
  while (left > 0) {
    end.setDate(end.getDate() + 1);
    const weekday = end.getDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  end.setHours(23, 59, 59, 999);
  const response = await worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: start.toISOString(),
      expiresAt: end.toISOString(),
      calls: 5,
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });
  assert.equal(response.status, 201);
});

test("requires a signed invite for TTS but allows origin-gated chat without one", async (t) => {
  const protectedEnv = { ...env, INVITE_SIGNING_SECRET: "signing-secret" };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  });

  const chat = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
  }), protectedEnv);
  assert.equal(chat.status, 200);

  const ttsMissing = await worker.fetch(new Request("https://proxy.example/v1/audio/speech", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({ input: "Hello", voice: "Charon" }),
  }), protectedEnv);
  assert.equal(ttsMissing.status, 401);
  assert.match((await ttsMissing.json()).error.message, /invite/i);

  const now = Math.floor(Date.now() / 1000);
  const wrongOriginToken = await signInvite({ v: 1, id: "x", origin: "https://other.example", nbf: now - 1, exp: now + 60, calls: 1 }, "signing-secret");
  const wrongOrigin = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: `Bearer ${wrongOriginToken}` },
    body: JSON.stringify({ model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
  }), protectedEnv);
  assert.equal(wrongOrigin.status, 401);
  assert.match((await wrongOrigin.json()).error.message, /origin/);
});

test("rejects requests from unapproved origins", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/health", {
    headers: { Origin: "https://attacker.example" },
  }), env);
  assert.equal(response.status, 403);
});

test("serves health checks to approved browser origins", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/health", {
    headers: { Origin: "https://resume.example" },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://resume.example");
  assert.deepEqual(await response.json(), { ok: true });
});

test("answers CORS preflight for chat completions with Authorization", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "OPTIONS",
    headers: {
      Origin: "https://resume.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://resume.example");
  assert.match(response.headers.get("Access-Control-Allow-Headers") || "", /Authorization/i);
});

test("translates Gemini output to an OpenAI-compatible response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /models\/gemini-test:generateContent\?key=secret-key$/);
    const body = JSON.parse(init.body);
    assert.equal(body.systemInstruction.parts[0].text, "Be concise");
    assert.equal(body.contents[0].parts[0].text, "Hello");
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 },
    });
  };
  const response = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-test", messages: [
      { role: "system", content: "Be concise" },
      { role: "user", content: "Hello" },
    ] }),
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content, "Hi");
  assert.equal(body.usage.total_tokens, 3);
});

test("maps OpenAI json_schema response_format onto Gemini structured outputs", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const schema = {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  };
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
    return Response.json({
      candidates: [{ content: { parts: [{ text: '{"text":"ok"}' }] }, finishReason: "STOP" }],
    });
  };
  const response = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-test",
      messages: [{ role: "user", content: "Adapt this" }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "adapted_narrative", strict: true, schema },
      },
    }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, '{"text":"ok"}');
});

test("geminiGenerationConfigFromResponseFormat handles json_object and rejects bad schemas", () => {
  assert.deepEqual(
    geminiGenerationConfigFromResponseFormat({ type: "json_object" }),
    { responseMimeType: "application/json" },
  );
  assert.deepEqual(geminiGenerationConfigFromResponseFormat(undefined), {});
  assert.throws(
    () => geminiGenerationConfigFromResponseFormat({ type: "json_schema", json_schema: { name: "x" } }),
    /response_format\.json_schema\.schema/,
  );
});

test("rejects models that are not configured server-side", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "expensive-model", messages: [{ role: "user", content: "Hello" }] }),
  }), env);
  assert.equal(response.status, 400);
});

test("returns an error when GEMINI_API_KEY is not configured", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
  }), { ...env, GEMINI_API_KEY: "" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { message: "GEMINI_API_KEY is not configured", type: "proxy_error" },
  });
});

test("synthesizes narration audio via Gemini Flash TTS", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const pcm = Buffer.from([0x00, 0x01, 0x02, 0x03]).toString("base64");
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /models\/gemini-tts-primary:generateContent\?key=secret-key$/);
    const body = JSON.parse(init.body);
    assert.equal(body.contents[0].parts[0].text, "Hello from the deck");
    assert.deepEqual(body.generationConfig.responseModalities, ["AUDIO"]);
    assert.equal(
      body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      "Charon",
    );
    return Response.json({
      candidates: [{
        content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: pcm } }] },
        finishReason: "STOP",
      }],
    });
  };
  const response = await worker.fetch(new Request("https://proxy.example/v1/audio/speech", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({
      input: "Hello from the deck",
      voice: "Charon",
    }),
  }), {
    ...env,
    GEMINI_TTS_MODEL: "gemini-tts-primary",
    GEMINI_TTS_FALLBACK_MODEL: "gemini-tts-secondary",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    audio: pcm,
    mimeType: "audio/L16;rate=24000",
    voice: "Charon",
    model: "gemini-tts-primary",
    provider: "gemini",
  });
});

test("cascades Gemini TTS quota exhaustion to the fallback model then Edge", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const { clearEdgeVoiceCache } = await import("../src/edge-tts.js");
  clearEdgeVoiceCache();
  const calls = [];
  const ssmlPayloads = [];
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);

  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("gemini-tts-primary:generateContent")) {
      return Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, { status: 429 });
    }
    if (href.includes("gemini-tts-secondary:generateContent")) {
      return Response.json({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, { status: 429 });
    }
    if (href.includes("/voices/list")) {
      return Response.json([
        { ShortName: "nl-NL-MaartenNeural", Gender: "Male", Locale: "nl-NL" },
        { ShortName: "nl-NL-ColetteNeural", Gender: "Female", Locale: "nl-NL" },
        { ShortName: "en-US-GuyNeural", Gender: "Male", Locale: "en-US" },
      ]);
    }
    if (href.includes("speech.platform.bing.com") && href.includes("/edge/v1")) {
      const socket = {
        accepted: false,
        listeners: {},
        accept() { this.accepted = true; },
        addEventListener(type, handler) {
          (this.listeners[type] ||= []).push(handler);
        },
        send(payload) {
          const text = String(payload);
          if (!text.includes("Path:ssml")) return;
          ssmlPayloads.push(text);
          queueMicrotask(() => {
            const header = "Content-Type:audio/mpeg\r\nPath:audio\r\n";
            const headerBytes = new TextEncoder().encode(header);
            const frame = new Uint8Array(2 + headerBytes.length + mp3.length);
            frame[0] = (headerBytes.length >> 8) & 0xff;
            frame[1] = headerBytes.length & 0xff;
            frame.set(headerBytes, 2);
            frame.set(mp3, 2 + headerBytes.length);
            for (const handler of this.listeners.message || []) {
              handler({ data: frame });
            }
            for (const handler of this.listeners.message || []) {
              handler({ data: "Path:turn.end\r\n\r\n" });
            }
          });
        },
        close() {},
      };
      // Workers accept status 101 + webSocket; Node's Response ctor does not.
      return { status: 101, webSocket: socket };
    }
    throw new Error(`unexpected fetch: ${href}`);
  };

  const response = await worker.fetch(new Request("https://proxy.example/v1/audio/speech", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json" },
    body: JSON.stringify({
      input: "Fallback narration",
      voice: "Charon",
      gender: "male",
      locale: "nl-NL",
    }),
  }), {
    ...env,
    GEMINI_TTS_MODEL: "gemini-tts-primary",
    GEMINI_TTS_FALLBACK_MODEL: "gemini-tts-secondary",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, "edge");
  assert.equal(body.model, "edge-tts");
  assert.equal(body.voice, "nl-NL-MaartenNeural");
  assert.equal(body.locale, "nl-NL");
  assert.equal(body.mimeType, "audio/mpeg");
  assert.equal(body.audio, Buffer.from(mp3).toString("base64"));
  assert.match(ssmlPayloads[0] || "", /xml:lang='nl-NL'/);
  assert.match(ssmlPayloads[0] || "", /nl-NL-MaartenNeural/);
  assert.equal(calls.filter((url) => url.includes("generateContent")).length, 2);
  assert.equal(calls.some((url) => url.includes("/voices/list")), true);
  assert.equal(calls.some((url) => url.includes("/edge/v1")), true);
});

test("issues constrained single-use Live tokens", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /v1alpha\/auth_tokens\?key=secret-key$/);
    const body = JSON.parse(init.body);
    assert.equal(body.uses, 1);
    assert.equal(body.bidiGenerateContentSetup.model, "models/gemini-live-test");
    assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
    assert.equal(body.authToken, undefined);
    return Response.json({ name: "auth_tokens/temporary", expireTime: "later" });
  };
  const response = await worker.fetch(new Request("https://proxy.example/v1/live-token", {
    method: "POST",
    headers: { Origin: "https://resume.example" },
  }), { ...env, GEMINI_LIVE_MODEL: "gemini-live-test" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.token, "auth_tokens/temporary");
  assert.equal(body.model, "gemini-live-test");
  assert.match(body.websocketUrl, /BidiGenerateContentConstrained$/);
});
