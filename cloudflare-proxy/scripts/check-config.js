#!/usr/bin/env node
/**
 * Pre-deploy check: INVITE_MAX_KV_CONTEXT_CHARS must leave ≥25k chars under MAX_INPUT_CHARS.
 *
 * Usage:
 *   node scripts/check-config.js [path/to/wrangler.jsonc]
 * Defaults to ./wrangler.jsonc relative to this package (standalone proxy),
 * or pass the repo-root wrangler.jsonc when deploying xframe-ai.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertInviteKvContextHeadroom } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(process.argv[2] || resolve(__dirname, "../wrangler.jsonc"));

function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/(^|[^:\\])\/\/.*$/gm, "$1");
  return JSON.parse(noLine);
}

const raw = readFileSync(configPath, "utf8");
const config = parseJsonc(raw);
const vars = config.vars || {};

try {
  assertInviteKvContextHeadroom(vars);
} catch (error) {
  console.error(`[check-config] ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const maxInput = Number(vars.MAX_INPUT_CHARS);
const maxKv = Number(vars.INVITE_MAX_KV_CONTEXT_CHARS);
console.log(
  `[check-config] OK ${configPath}: MAX_INPUT_CHARS=${maxInput}, `
  + `INVITE_MAX_KV_CONTEXT_CHARS=${maxKv}, headroom=${maxInput - maxKv}`,
);
