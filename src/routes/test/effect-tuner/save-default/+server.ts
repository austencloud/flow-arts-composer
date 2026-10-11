/**
 * Dev-only write-back for the effect tuner.
 *
 * POST { target, effect, intent } writes the live intent to one of two places:
 *
 *   target "default"            → patches DEFAULT_EFFECTS_CONFIG[<effect>] in
 *                                 src/lib/shared/effects/domain/defaults.ts
 *                                 (per-field single-line swap, comment-safe).
 *   target { preset: "<id>" }   → replaces that preset's `patch: { … }` object
 *                                 in <effect>-presets.ts with the full intent.
 *
 * The string transforms live in ./patch-source (pure + unit-tested); this
 * handler does filesystem + dispatch only. Vite then HMR-reloads the touched
 * file so the tuner re-seeds from the new values.
 *
 * Guarded to dev — never reachable in a production build.
 */
import { error, type RequestHandler } from "@sveltejs/kit";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { dev } from "$app/env";
import { patchDefaultsBlock, patchPresetPatch } from "./patch-source";

const DEFAULTS_PATH = resolve(
  process.cwd(),
  "src/lib/shared/effects/domain/defaults.ts",
);

const PRESETS_DIR = resolve(
  process.cwd(),
  "src/lib/shared/animation-engine/components/effects-panel/presets",
);

const EFFECT_IDS = new Set([
  "trails", "fire", "led", "charcoal", "zap", "sparkles", "ghost", "bloom",
  "goo", "bubbles", "petals", "smoke", "ink", "frost", "silk", "pulse",
]);

/** Preset source file for an effect. Only `trails` breaks the `<effect>-presets` rule. */
function presetFile(effect: string): string {
  return resolve(PRESETS_DIR, `${effect === "trails" ? "trail" : effect}-presets.ts`);
}

type Target = "default" | { preset: string };

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) throw error(403, "effect-tuner write-back is dev-only");

  const body = (await request.json()) as {
    target?: Target;
    effect?: string;
    intent?: Record<string, unknown>;
  };
  const { target, effect = "", intent } = body;
  if (!EFFECT_IDS.has(effect)) throw error(400, `unknown effect: "${effect}"`);
  if (!intent || typeof intent !== "object") throw error(400, "missing intent object");
  if (target !== "default" && !(target && typeof target === "object" && "preset" in target)) {
    throw error(400, "target must be \"default\" or { preset }");
  }

  // ── Base default → defaults.ts ──────────────────────────────────────────
  if (target === "default") {
    const src = readFileSync(DEFAULTS_PATH, "utf8");
    let next: string;
    let patched: string[];
    try {
      ({ src: next, patched } = patchDefaultsBlock(src, effect, intent));
    } catch (e) {
      throw error(500, e instanceof Error ? e.message : String(e));
    }
    const changed = next !== src;
    if (changed) writeFileSync(DEFAULTS_PATH, next, "utf8");
    return Response.json({ ok: true, target: "default", file: "defaults.ts", patched, changed });
  }

  // ── Preset → <effect>-presets.ts ────────────────────────────────────────
  const presetId = target.preset;
  if (typeof presetId !== "string" || !presetId) throw error(400, "missing preset id");
  const path = presetFile(effect);
  const src = readFileSync(path, "utf8");
  let next: string;
  try {
    next = patchPresetPatch(src, presetId, intent);
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : String(e));
  }
  const changed = next !== src;
  if (changed) writeFileSync(path, next, "utf8");
  return Response.json({
    ok: true,
    target: { preset: presetId },
    file: `${effect === "trails" ? "trail" : effect}-presets.ts`,
    changed,
  });
};
