import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://resume.example",
  GEMINI_API_KEY: "secret-key",
  GEMINI_MODEL: "gemini-test",
};

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

test("issues constrained single-use Live tokens", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /v1alpha\/auth_tokens\?key=secret-key$/);
    const body = JSON.parse(init.body);
    assert.equal(body.authToken.uses, 1);
    assert.deepEqual(body.authToken.liveConnectConstraints.config.responseModalities, ["AUDIO"]);
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
