#!/usr/bin/env node
/**
 * Inject PostHog debug-ID metadata into the built JS, upload the matching
 * sourcemaps, then delete EVERY .map file in the output — so
 * `capture_exceptions` in production resolves real stack traces instead of
 * "chunks/Cu5DaGTC.js:16:30809" with "resolved": false, without a single
 * sourcemap ever leaving this machine except to PostHog.
 *
 * The sweep is the load-bearing part, and it is unconditional. `npm run build`
 * is not just the Cloudflare Pages deploy command — android-build.yml,
 * ios-build.yml and capgo-deploy.yml all run it too, none of them have PostHog
 * credentials, and capacitor.config.ts points webDir at this very directory.
 * So a .map file left behind here is not a stale local artifact: `cap sync`
 * copies it into the signed Android AAB and the iOS IPA, and Capgo pushes it
 * as an OTA bundle to already-installed devices. Relying on the PostHog CLI's
 * own --delete-after would leak in exactly the builds that never call it, and
 * would leak CSS sourcemaps even in the build that does — the CLI filters on
 * is_javascript_file (.js/.mjs/.cjs), and Vite emits a .css.map per CSS chunk,
 * of which this project has ~499. trim-deploy-assets.js doesn't touch .map
 * either; it only strips screenshots, thumbnails, and files over 25 MiB.
 *
 * Hence: upload when credentialed and the build made maps, and sweep on every
 * path out of this script. The build makes maps only when its environment
 * sets VITE_SOURCEMAP=true (see build.sourcemap in vite.config.ts); without
 * them there is nothing to upload, so the CLI is not fetched or run.
 *
 * A PostHog outage must never fail a TKA deploy. Symbolicated stack traces are
 * a diagnostic nicety; shipping the app is not. Upload failures log and exit 0.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = ".svelte-kit/cloudflare";

// Pin the CLI version via npx so an upstream flag/behavior change can't
// silently alter a production build. Bump deliberately, not via @latest.
const POSTHOG_CLI = "@posthog/cli@0.8.4";

/**
 * The repo already had ONE name for these credentials before this script
 * existed — POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID / POSTHOG_API_HOST,
 * used by .env.example, seo-measurement.yml, scripts/posthog-query.cjs,
 * scripts/seo/provision-posthog-dashboard.ts, and two admin API routes. A
 * second naming scheme for the same PostHog project would mean a key rotated
 * under the name everyone knows silently stops symbolicating, with no error
 * and no failing test to catch it. So read the canonical names and remap them
 * to whatever the CLI wants internally, right here.
 */
const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
// .env.example stores this bare ("us.posthog.com"); the CLI wants a URL.
const rawHost = process.env.POSTHOG_API_HOST;
const host = rawHost
  ? rawHost.startsWith("http")
    ? rawHost
    : `https://${rawHost}`
  : undefined;

/** Every *.map under `dir`, whatever produced it. */
function listSourcemaps(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // No output dir (build failed earlier) — nothing to sweep.
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourcemaps(full);
    return entry.name.endsWith(".map") ? [full] : [];
  });
}

/** Delete every *.map under `dir`. Returns the count. */
function sweepSourcemaps(dir) {
  const maps = listSourcemaps(dir);
  for (const full of maps) {
    try {
      rmSync(full);
    } catch (error) {
      // A map we cannot delete is a map that could ship. Fail loudly rather
      // than let it ride into an app bundle.
      console.error(`FATAL: could not delete sourcemap ${full}`, error);
      process.exit(1);
    }
  }
  return maps.length;
}

function finish(reason) {
  const removed = sweepSourcemaps(OUTPUT_DIR);
  console.log(`${reason} Swept ${removed} local .map file(s) from ${OUTPUT_DIR}.`);
  process.exit(0);
}

function outputDirExists() {
  try {
    return statSync(OUTPUT_DIR).isDirectory();
  } catch {
    return false;
  }
}

if (!outputDirExists()) {
  console.log(`No ${OUTPUT_DIR} to process; nothing to do.`);
  process.exit(0);
}

if (!apiKey || !projectId) {
  finish(
    "Skipping PostHog sourcemap upload (POSTHOG_PERSONAL_API_KEY / " +
      "POSTHOG_PROJECT_ID not set — expected everywhere except the Cloudflare " +
      "Pages production build)."
  );
}

if (listSourcemaps(OUTPUT_DIR).length === 0) {
  finish(
    "Skipping PostHog sourcemap upload (the build made no sourcemaps; set " +
      "VITE_SOURCEMAP=true in the build environment to make them)."
  );
}

/** Runs the CLI. Returns false on any non-zero exit instead of killing the build. */
function runCli(args) {
  const result = spawnSync("npx", ["--yes", POSTHOG_CLI, ...args], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      POSTHOG_CLI_API_KEY: apiKey,
      POSTHOG_CLI_PROJECT_ID: projectId,
      ...(host ? { POSTHOG_CLI_HOST: host } : {}),
    },
  });
  if (result.status !== 0) {
    console.warn(
      `posthog-cli ${args.join(" ")} failed (exit ${result.status}). ` +
        "Continuing: unsymbolicated stack traces are not a reason to fail a deploy."
    );
    return false;
  }
  return true;
}

console.log("Injecting PostHog sourcemap debug IDs...");
if (runCli(["sourcemap", "inject", "--directory", OUTPUT_DIR])) {
  console.log("Uploading sourcemaps to PostHog...");
  runCli(["sourcemap", "upload", "--directory", OUTPUT_DIR, "--delete-after"]);
}

finish("PostHog sourcemap step complete.");
