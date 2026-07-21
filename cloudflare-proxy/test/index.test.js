import assert from "node:assert/strict";
import test from "node:test";
import worker, {
  assertInviteKvContextHeadroom,
  encryptContextFile,
  geminiGenerationConfigFromResponseFormat,
  serveInviteContext,
  signInvite,
  storeContextFile,
  validateContextFileClaims,
  verifyInviteToken,
} from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://resume.example",
  GEMINI_API_KEY: "secret-key",
  GEMINI_MODEL: "gemini-test",
};

/** Minimal Workers KV mock for invite context tests. */
function mockInviteKv(seed = new Map()) {
  const store = new Map(seed);
  return {
    store,
    async put(key, value, options = {}) {
      const bytes = value instanceof Uint8Array
        ? value
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new TextEncoder().encode(String(value));
      store.set(key, { bytes: new Uint8Array(bytes), options });
    },
    async get(key, typeOrOpts) {
      const entry = store.get(key);
      if (!entry) return null;
      const type = typeof typeOrOpts === "string" ? typeOrOpts : typeOrOpts?.type;
      if (type === "arrayBuffer") return entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength);
      if (type === "text") return new TextDecoder().decode(entry.bytes);
      return entry.bytes;
    },
  };
}

function mintEnv(overrides = {}) {
  return {
    ...env,
    INVITE_ADMIN_SECRET: "admin-secret",
    INVITE_SIGNING_SECRET: "signing-secret",
    INVITE_CONTEXTS: mockInviteKv(),
    ...overrides,
  };
}

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

test("mints file-backed context by default and stores ciphertext in Workers KV", async () => {
  const kv = mockInviteKv();
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
  }), mintEnv({ INVITE_CONTEXTS: kv }));
  assert.equal(response.status, 201);
  const body = await response.json();
  const invited = new URL(body.url);
  assert.equal(invited.origin, "https://resume.example");
  assert.equal(invited.searchParams.get("theme"), "dark");
  assert.equal(invited.searchParams.get("xframe_invite"), body.token);
  assert.equal(body.claims.calls, 7);
  assert.equal(body.claims.context, "Candidate interview for platform role");
  assert.equal(body.claims.v, 2);
  assert.match(body.claims.contextFile, /^contexts\/[0-9a-f-]{36}\.ctx$/);
  assert.equal(body.contextStored, true);
  assert.equal(Object.hasOwn(body, "contextArtifact"), false);
  assert.equal(Object.hasOwn(body.claims, "contextKey"), false);

  const stored = kv.store.get(body.claims.contextFile);
  assert.ok(stored);
  assert.deepEqual([...stored.bytes.slice(0, 4)], [0x58, 0x46, 0x43, 0x31]);
  assert.equal(stored.options.expiration, Math.floor(expires.getTime() / 1000));

  const verified = await verifyInviteToken(body.token, "signing-secret", active.getTime());
  assert.equal(verified.contextFile, body.claims.contextFile);
  assert.equal(typeof verified.contextKey, "string");
  assert.equal(Object.hasOwn(verified, "context"), false);

  const encodedClaims = JSON.parse(Buffer.from(body.token.split(".")[0], "base64url").toString());
  assert.equal(typeof encodedClaims.contextFile, "string");
  assert.equal(typeof encodedClaims.contextKey, "string");
  assert.equal(Object.hasOwn(encodedClaims, "contextGzip"), false);
  assert.equal(Object.hasOwn(encodedClaims, "context"), false);

  const served = await serveInviteContext({ INVITE_CONTEXTS: kv }, body.claims.contextFile);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "application/octet-stream");
  const servedBytes = new Uint8Array(await served.arrayBuffer());
  assert.deepEqual([...servedBytes], [...stored.bytes]);
});

test("mints gzip context into the token when contextStorage is token", async () => {
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
      contextStorage: "token",
    }),
  }), mintEnv());
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.claims.context, "Candidate interview for platform role");
  assert.equal((await verifyInviteToken(body.token, "signing-secret", active.getTime())).context, "Candidate interview for platform role");
  const encodedClaims = JSON.parse(Buffer.from(body.token.split(".")[0], "base64url").toString());
  assert.equal(typeof encodedClaims.contextGzip, "string");
  assert.equal(Object.hasOwn(encodedClaims, "contextFile"), false);
  assert.equal(Object.hasOwn(body, "contextStored"), false);
});

test("file-mode mint fails when INVITE_CONTEXTS is missing", async () => {
  const active = new Date(Date.now() + 5 * 60_000);
  const expires = new Date(active.getTime() + 24 * 60 * 60_000);
  const response = await worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: active.toISOString(),
      expiresAt: expires.toISOString(),
      calls: 3,
      context: "Needs KV",
    }),
  }), {
    ...env,
    INVITE_ADMIN_SECRET: "admin-secret",
    INVITE_SIGNING_SECRET: "signing-secret",
  });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error.message, /INVITE_CONTEXTS/);
});

test("storeContextFile rejects oversize values", async () => {
  const kv = mockInviteKv();
  const path = "contexts/00000000-0000-4000-8000-000000000099.ctx";
  const oversize = new Uint8Array(25 * 1024 * 1024 + 1);
  await assert.rejects(
    () => storeContextFile(
      { INVITE_CONTEXTS: kv },
      { path, bytes: oversize, expiration: Math.floor(Date.now() / 1000) + 3600 },
    ),
    /26214400-byte Workers KV value limit/,
  );
  assert.equal(kv.store.size, 0);
});

test("storeContextFile requires the KV binding", async () => {
  await assert.rejects(
    () => storeContextFile({}, {
      path: "contexts/00000000-0000-4000-8000-000000000001.ctx",
      bytes: new Uint8Array([1, 2, 3]),
      expiration: Math.floor(Date.now() / 1000) + 3600,
    }),
    /INVITE_CONTEXTS/,
  );
});

test("validateContextFileClaims rejects malformed paths and keys", () => {
  assert.throws(() => validateContextFileClaims("../secrets.ctx", "abcd"), /context file is invalid/);
  assert.throws(() => validateContextFileClaims("contexts/not-a-uuid.ctx", "abcd"), /context file is invalid/);
  const path = "contexts/00000000-0000-4000-8000-000000000001.ctx";
  assert.throws(() => validateContextFileClaims(path, "short"), /context key is invalid/);
  const key = Buffer.alloc(32, 7).toString("base64url");
  validateContextFileClaims(path, key);
});

test("encryptContextFile produces XFC1 ciphertext and a 32-byte key", async () => {
  const path = "contexts/00000000-0000-4000-8000-000000000002.ctx";
  const { bytes, contextKey } = await encryptContextFile("hello context", "00000000-0000-4000-8000-000000000002", path);
  assert.deepEqual([...bytes.slice(0, 4)], [0x58, 0x46, 0x43, 0x31]);
  assert.equal(Buffer.from(contextKey, "base64url").length, 32);
  assert.ok(bytes.length > 16);
});

test("verifyInviteToken accepts file claims without loading the file", async () => {
  const now = Date.now();
  const path = "contexts/11111111-1111-4111-8111-111111111111.ctx";
  const key = Buffer.alloc(32, 9).toString("base64url");
  const token = await signInvite({
    v: 2,
    id: "11111111-1111-4111-8111-111111111111",
    origin: "https://resume.example",
    nbf: Math.floor(now / 1000) - 1,
    exp: Math.floor(now / 1000) + 60,
    calls: 2,
    contextFile: path,
    contextKey: key,
  }, "signing-secret");
  const claims = await verifyInviteToken(token, "signing-secret", now);
  assert.equal(claims.contextFile, path);
  assert.equal(claims.contextKey, key);
  assert.equal(Object.hasOwn(claims, "context"), false);
});

test("verifyInviteToken rejects mixed gzip and file context claims", async () => {
  const now = Date.now();
  const token = await signInvite({
    v: 2,
    id: "22222222-2222-4222-8222-222222222222",
    origin: "https://resume.example",
    nbf: Math.floor(now / 1000) - 1,
    exp: Math.floor(now / 1000) + 60,
    calls: 1,
    contextGzip: "e30",
    contextFile: "contexts/22222222-2222-4222-8222-222222222222.ctx",
    contextKey: Buffer.alloc(32, 1).toString("base64url"),
  }, "signing-secret");
  await assert.rejects(() => verifyInviteToken(token, "signing-secret", now), /context format is invalid/);
});

test("invite page defaults to day selection through five business days", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite"), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="url"[^>]*value="https:\/\/proxy\.example\/"/);
  assert.match(html, /name="calls"[^>]*max="20" value="5"/);
  assert.match(html, /<textarea name="context"[^>]*rows="16"/);
  assert.doesNotMatch(html, /<textarea name="context"[^>]*maxlength=/);
  assert.match(html, /maxTokenContextChars = 500/);
  assert.match(html, /maxKvContextChars = 5000/);
  assert.match(html, /syncContextLimit\(\)/);
  assert.match(html, /KV limit/);
  assert.doesNotMatch(html, /maxKvContextBytes/);
  assert.doesNotMatch(html, /encrypted bytes/);
  assert.match(html, /grid-template-columns:minmax\(0,1fr\) minmax\(24rem,1\.15fr\)/);
  assert.match(html, /name="notBefore" type="date"/);
  assert.match(html, /name="expiresAt" type="date"/);
  assert.match(html, /name="preciseTime" type="checkbox"/);
  assert.match(html, /name="contextStorage"/);
  assert.match(html, /<option value="file" selected>/);
  assert.match(html, /Workers KV/);
  assert.match(html, /addBusinessDays\(today, 5\)/);
  assert.match(html, /applyDayDefaults\(\)/);
  assert.doesNotMatch(html, /preciseTime[^>]*checked/);
});

test("invite token context limit can be configured through the environment", async () => {
  const customEnv = { ...env, INVITE_MAX_CONTEXT_CHARS: "1200" };
  const page = await worker.fetch(new Request("https://proxy.example/invite"), customEnv);
  const html = await page.text();
  assert.match(html, /maxTokenContextChars = 1200/);

  const request = (context, contextStorage = "token") => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
      contextStorage,
    }),
  }), mintEnv({ ...customEnv }));

  assert.equal((await request("x".repeat(1200))).status, 201);
  const tooLong = await request("x".repeat(1201));
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.message, /at most 1200/);

  // File mode uses INVITE_MAX_KV_CONTEXT_CHARS, not the token char limit.
  assert.equal((await request("x".repeat(1201), "file")).status, 201);
});

test("invite KV context limit can be configured through the environment", async () => {
  const customEnv = { ...env, INVITE_MAX_KV_CONTEXT_CHARS: "800" };
  const page = await worker.fetch(new Request("https://proxy.example/invite"), customEnv);
  const html = await page.text();
  assert.match(html, /maxKvContextChars = 800/);

  const request = (context, contextStorage = "file") => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
      contextStorage,
    }),
  }), mintEnv({ ...customEnv }));

  assert.equal((await request("x".repeat(800))).status, 201);
  const tooLong = await request("x".repeat(801));
  assert.equal(tooLong.status, 400);
  assert.match((await tooLong.json()).error.message, /at most 800/);

  // Token mode is unaffected by the KV char limit.
  assert.equal((await request("x".repeat(500), "token")).status, 201);
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

test("mints opportunity flag with invite context claims", async () => {
  const request = (opportunity, context = "Enterprise Architect role") => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
      contextStorage: "token",
      ...(opportunity === undefined ? {} : { opportunity }),
    }),
  }), { ...env, INVITE_ADMIN_SECRET: "admin-secret", INVITE_SIGNING_SECRET: "signing-secret" });

  const withFlag = await request(true);
  assert.equal(withFlag.status, 201);
  const body = await withFlag.json();
  assert.equal(body.claims.opportunity, true);
  assert.equal(body.claims.context, "Enterprise Architect role");
  const verified = await verifyInviteToken(body.token, "signing-secret", Date.now() + 2_000);
  assert.equal(verified.opportunity, true);

  const omitted = await request(undefined);
  assert.equal(omitted.status, 201);
  assert.equal(Object.hasOwn((await omitted.json()).claims, "opportunity"), false);

  const falseFlag = await request(false);
  assert.equal(falseFlag.status, 201);
  assert.equal(Object.hasOwn((await falseFlag.json()).claims, "opportunity"), false);

  const invalid = await request("yes");
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error.message, /opportunity must be a boolean/);
});

test("invite page exposes opportunity checkbox with context, not as a feature", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/invite"), env);
  const html = await response.text();
  assert.match(html, /name="pdfExtract" type="checkbox"/);
  assert.match(html, /Allow PDF extract/);
  assert.match(html, /name="textToSpeech" type="checkbox"/);
  assert.match(html, /Allow text-to-speech/);
  assert.match(html, /name="opportunity" type="checkbox"/);
  assert.match(html, /Specific opportunity/);
  assert.match(html, /opportunity: true/);
  assert.doesNotMatch(html, /features\.push\('opportunity'\)/);
  assert.match(html, /features\.length \? \{ features \} : \{\}/);
});

test("omits blank invite context and rejects invalid context descriptions", async () => {
  const request = (context, contextStorage) => worker.fetch(new Request("https://proxy.example/invite/mint", {
    method: "POST",
    headers: { Origin: "https://resume.example", "Content-Type": "application/json", Authorization: "Bearer admin-secret" },
    body: JSON.stringify({
      url: "https://resume.example/",
      notBefore: new Date(Date.now() + 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      calls: 5,
      context,
      ...(contextStorage ? { contextStorage } : {}),
    }),
  }), mintEnv());

  const blank = await request("   ");
  assert.equal(blank.status, 201);
  assert.equal(Object.hasOwn((await blank.json()).claims, "context"), false);

  const nonString = await request({ description: "no" });
  assert.equal(nonString.status, 400);
  assert.match((await nonString.json()).error.message, /context must be a string/);

  // Default file mode uses INVITE_MAX_KV_CONTEXT_CHARS (5000), not the token limit.
  const longFile = await request("x".repeat(1001));
  assert.equal(longFile.status, 201);
  const tooLongFile = await request("x".repeat(5001));
  assert.equal(tooLongFile.status, 400);
  assert.match((await tooLongFile.json()).error.message, /at most 5000/);

  const tooLongToken = await request("x".repeat(501), "token");
  assert.equal(tooLongToken.status, 400);
  assert.match((await tooLongToken.json()).error.message, /at most 500/);

  assert.equal((await request("x".repeat(500), "token")).status, 201);
  assert.equal((await request("x".repeat(5000))).status, 201);
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

test("assertInviteKvContextHeadroom requires 25000 chars under MAX_INPUT_CHARS", () => {
  assert.doesNotThrow(() => assertInviteKvContextHeadroom({
    MAX_INPUT_CHARS: "40000",
    INVITE_MAX_KV_CONTEXT_CHARS: "5000",
  }));
  assert.doesNotThrow(() => assertInviteKvContextHeadroom({
    MAX_INPUT_CHARS: "40000",
    INVITE_MAX_KV_CONTEXT_CHARS: "15000",
  }));
  assert.throws(
    () => assertInviteKvContextHeadroom({
      MAX_INPUT_CHARS: "40000",
      INVITE_MAX_KV_CONTEXT_CHARS: "15001",
    }),
    /at least 25000 less/,
  );
  assert.throws(
    () => assertInviteKvContextHeadroom({
      MAX_INPUT_CHARS: "30000",
      INVITE_MAX_KV_CONTEXT_CHARS: "5001",
    }),
    /got headroom 24999/,
  );
});

test("health rejects configs where KV context leaves too little prompt headroom", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/health", {
    headers: { Origin: "https://resume.example" },
  }), {
    ...env,
    MAX_INPUT_CHARS: "40000",
    INVITE_MAX_KV_CONTEXT_CHARS: "20000",
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /INVITE_MAX_KV_CONTEXT_CHARS/);
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
