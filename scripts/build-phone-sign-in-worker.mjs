#!/usr/bin/env node
// Bundles the phone's sign-in notification logic into one classic script,
// static/phone-sign-in-worker.js, which static/sw.js and
// static/firebase-messaging-sw.js load with importScripts.
//
// The output is generated and gitignored, like static/svg-precache-manifest.json.
// A committed bundle can drift from its TypeScript; this one is rebuilt by every
// build, before `vite build` copies static/. scripts/stamp-service-worker.js
// refuses to finish if it is missing from the output, because the workers load it
// inside a try/catch and would otherwise fall back quietly to the review page.
//
// Runs alone too: node scripts/build-phone-sign-in-worker.mjs

import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = resolve(root, "src/lib/shared/auth/phone-sign-in/worker-entry.ts");
const FILE_NAME = "phone-sign-in-worker.js";

/** Builds the script. Returns its path. Throws on any failure. */
export async function buildPhoneSignInWorker(outDir = resolve(root, "static")) {
  await build({
    configFile: false,
    root,
    logLevel: "error",
    publicDir: false,
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      lib: {
        entry: ENTRY,
        formats: ["iife"],
        // Required for the format, unused: the entry assigns to `self` itself.
        name: "phoneSignInWorkerBundle",
        fileName: () => FILE_NAME,
      },
      outDir,
      // outDir is static/, which holds the whole site's assets.
      emptyOutDir: false,
      minify: true,
      target: "es2020",
      sourcemap: false,
    },
  });

  const path = resolve(outDir, FILE_NAME);
  const source = readFileSync(path, "utf8");
  const scope = {};
  // A classic worker script runs at the top level with `self` in scope. One that
  // needs anything else at load would only fail on people's phones.
  new Function("self", source)(scope);
  if (typeof scope.phoneSignInWorker?.showPush !== "function") {
    throw new Error(`${FILE_NAME} did not set up phoneSignInWorker when run`);
  }
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = await buildPhoneSignInWorker();
    console.log(`Built ${FILE_NAME}: ${(statSync(path).size / 1024).toFixed(1)} KB`);
  } catch (cause) {
    console.error(`build-phone-sign-in-worker failed: ${cause?.message ?? cause}`);
    process.exit(1);
  }
}
