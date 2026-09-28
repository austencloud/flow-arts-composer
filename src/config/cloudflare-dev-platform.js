import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SHARED_EMULATORS = Symbol.for("tka.cloudflare-dev-platform.emulators");

/** @typedef {{ fingerprint: string, emulator: import("@sveltejs/kit").Emulator }} SharedEmulator */

// Process-wide, because SvelteKit re-imports svelte.config.js on every restart.
/** @returns {Map<string, SharedEmulator>} */
function sharedEmulators() {
  const store =
    /** @type {Record<symbol, Map<string, SharedEmulator> | undefined>} */ (
      /** @type {unknown} */ (globalThis)
    );
  return (store[SHARED_EMULATORS] ??= new Map());
}

// Files that decide what getPlatformProxy starts: wrangler config and local
// vars, plus svelte.config.js, which holds the adapter options.
const PLATFORM_INPUT =
  /^(?:svelte\.config\.js|wrangler\.(?:toml|json|jsonc)|\.dev\.vars(?:\..+)?|\.env(?:\..+)?)$/;

/** @param {string} root */
function fingerprintPlatformInputs(root) {
  return readdirSync(root)
    .filter((name) => PLATFORM_INPUT.test(name))
    .sort()
    .map((name) => {
      const stats = statSync(path.join(root, name), { throwIfNoEntry: false });
      return stats ? `${name}:${stats.size}:${stats.mtimeMs}` : name;
    })
    .join("|");
}

/**
 * Makes requests wait in line until one platform start succeeds. The adapter
 * caches that platform, so every later request gets it immediately.
 *
 * @param {import("@sveltejs/kit").Emulator} emulator
 * @returns {import("@sveltejs/kit").Emulator}
 */
function startPlatformOnce(emulator) {
  const getPlatform = emulator.platform?.bind(emulator);
  if (!getPlatform) return emulator;

  let started = false;
  /** @type {Promise<unknown>} */
  let startQueue = Promise.resolve();

  return {
    ...emulator,
    platform(details) {
      if (started) return getPlatform(details);

      const attempt = startQueue.then(() => getPlatform(details));
      startQueue = attempt.then(
        () => {
          started = true;
        },
        () => {}
      );
      return attempt;
    },
  };
}

/**
 * Shares one Cloudflare platform emulator across the dev process.
 *
 * @sveltejs/adapter-cloudflare starts a getPlatformProxy (a workerd process)
 * for every request that arrives before the first one resolves, and SvelteKit
 * asks for a new emulator on every Vite restart without disposing the old one.
 * After a restart, each open tab therefore started its own workerd and none
 * were ever stopped. This keeps one emulator until wrangler config, local vars
 * or svelte.config.js change. The adapter does not expose the proxy's dispose,
 * so a replaced emulator stays alive until the dev process exits.
 *
 * @param {import("@sveltejs/kit").Adapter} adapter
 * @param {{ root?: string }} [options] Directory wrangler reads from.
 * @returns {import("@sveltejs/kit").Adapter}
 */
export function shareCloudflareDevPlatform(
  adapter,
  { root = process.cwd() } = {}
) {
  const emulate = adapter.emulate?.bind(adapter);
  if (!emulate) return adapter;

  return {
    ...adapter,
    async emulate() {
      const shared = sharedEmulators();
      const fingerprint = fingerprintPlatformInputs(root);
      const current = shared.get(root);
      if (current?.fingerprint === fingerprint) return current.emulator;

      const emulator = startPlatformOnce(await emulate());
      shared.set(root, { fingerprint, emulator });
      return emulator;
    },
  };
}
