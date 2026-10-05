#!/usr/bin/env node
/**
 * Write .env for the phone app's over-the-air bundle from the live site's
 * public settings.
 *
 * The web deploy takes its PUBLIC_ settings from the Cloudflare dashboard, and
 * CI has no copy of them. The live site serves the same values at
 * /_app/env.js, so the bundle build copies them from there instead of
 * shipping .env.example's blanks (no analytics, no maps, a "development"
 * label). Other lines come from .env.example unchanged. Logs names, never
 * values.
 *
 *   node scripts/write-live-public-env.mjs [origin]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const origin = process.argv[2] ?? "https://tkaflowarts.com";
const envPath = resolve(repoRoot, ".env");
const examplePath = resolve(repoRoot, ".env.example");

// SvelteKit writes the file as `export const env=${JSON.stringify(public)}`.
const ENV_MODULE_PREFIX = "export const env=";
const PUBLIC_KEY = /^PUBLIC_[A-Z0-9_]+$/;
// Unquoted .env values: Vite expands `$`, and spaces, quotes and `#` would
// change how the line parses.
const SAFE_VALUE = /^[\w\-.:/@+=,~%]*$/;

function fail(message) {
  console.error(`[live-env] ${message}`);
  process.exit(1);
}

if (existsSync(envPath)) {
  fail(".env already exists. This script only fills a fresh CI checkout.");
}

const url = new URL("/_app/env.js", origin);
let body;
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) fail(`${url} answered ${response.status}`);
  body = (await response.text()).trim();
} catch (error) {
  fail(`Could not fetch ${url}: ${error.message}`);
}

if (!body.startsWith(ENV_MODULE_PREFIX)) {
  fail(`${url} is not a SvelteKit env module`);
}
let live;
try {
  live = JSON.parse(body.slice(ENV_MODULE_PREFIX.length).replace(/;$/, ""));
} catch {
  fail(`${url} does not hold a JSON object`);
}

const settings = new Map();
for (const [key, value] of Object.entries(live)) {
  if (!PUBLIC_KEY.test(key)) continue;
  if (typeof value !== "string" || !SAFE_VALUE.test(value)) {
    fail(`${key} from ${url} cannot be written as a plain .env value`);
  }
  settings.set(key, value);
}
if (settings.size === 0) fail(`${url} holds no PUBLIC_ settings`);

// Each live key appears once: Vite keeps a key's last line and
// generate-native-env.mjs its first.
const written = new Set();
const lines = readFileSync(examplePath, "utf8")
  .split(/\r?\n/)
  .flatMap((line) => {
    const key = line.match(/^\s*(PUBLIC_[A-Z0-9_]+)\s*=/)?.[1];
    if (!key || !settings.has(key)) return [line];
    if (written.has(key)) return [];
    written.add(key);
    return [`${key}=${settings.get(key)}`];
  });
for (const [key, value] of settings) {
  if (!written.has(key)) lines.push(`${key}=${value}`);
}

writeFileSync(envPath, `${lines.join("\n").trimEnd()}\n`);
console.log(
  `[live-env] Wrote .env with ${settings.size} live settings from ${url.origin}: ` +
    [...settings.keys()].join(", ")
);
