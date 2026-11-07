#!/usr/bin/env node
// Writes a per-deploy build id into the built service worker.
//
// Browsers decide whether to install a new worker by comparing sw.js byte for
// byte. static/sw.js used to ship identical on every deploy, so a person's
// browser kept the worker, and the /app shell it cached, from their very first
// visit. On a slow connection that worker served the old shell, whose lazy
// chunks the server had dropped, and the app crashed mid-session. Stamping a
// fresh id makes each deploy's sw.js different, so the browser installs the
// new worker, which re-caches /app and its boot chunks over the stale copy.
//
// Runs right after `vite build`, against .svelte-kit/cloudflare/sw.js:
//   node scripts/stamp-service-worker.js [path/to/sw.js]

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_ID_PLACEHOLDER = "__TKA_BUILD_ID__";

// The id lands inside a JS string literal, so anything outside this set could
// break the worker's syntax.
const SAFE_BUILD_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Replace the placeholder in a service worker's source with `buildId`.
 * Throws when the placeholder is absent: that means the worker was not copied
 * into the build output, or this step already ran on it, and either way the
 * deploy would ship a worker that browsers treat as unchanged.
 */
export function stampServiceWorker(source, buildId) {
  if (typeof buildId !== "string" || !SAFE_BUILD_ID.test(buildId)) {
    throw new Error(
      `stamp-service-worker: build id ${JSON.stringify(buildId)} must match ${SAFE_BUILD_ID}`
    );
  }
  if (!source.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `stamp-service-worker: ${BUILD_ID_PLACEHOLDER} not found in sw.js (not copied into the build, or already stamped)`
    );
  }
  return source.split(BUILD_ID_PLACEHOLDER).join(buildId);
}

/**
 * One id per build, different across builds. Cloudflare Pages names the commit
 * it is building; elsewhere the short HEAD plus the build time keeps two local
 * builds of the same commit apart.
 */
export function resolveBuildId(
  env = process.env,
  now = Date.now(),
  readHead = readGitShortHead
) {
  const sha = env.CF_PAGES_COMMIT_SHA?.trim();
  if (sha) return sha;
  const head = readHead();
  return head ? `${head}-${now}` : String(now);
}

function readGitShortHead() {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // No git (a tarball build): the timestamp alone still differs per build.
    return "";
  }
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(
    process.argv[2] ??
      path.join(here, "..", ".svelte-kit", "cloudflare", "sw.js")
  );
  let source;
  try {
    source = fs.readFileSync(target, "utf8");
  } catch (err) {
    console.error(
      `[stamp-service-worker] cannot read ${target}: ${err.message}`
    );
    process.exit(1);
  }
  // sw.js loads this inside a try/catch, so a build without it would ship and
  // quietly lose one-tap sign-in. scripts/build-phone-sign-in-worker.mjs makes it.
  const signInWorker = path.join(path.dirname(target), "phone-sign-in-worker.js");
  if (!fs.existsSync(signInWorker)) {
    console.error(`[stamp-service-worker] missing ${signInWorker}`);
    process.exit(1);
  }
  const buildId = resolveBuildId();
  try {
    fs.writeFileSync(target, stampServiceWorker(source, buildId));
  } catch (err) {
    console.error(`[stamp-service-worker] ${err.message}`);
    process.exit(1);
  }
  console.log(
    `[stamp-service-worker] ${path.relative(process.cwd(), target)} -> ${buildId}`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
