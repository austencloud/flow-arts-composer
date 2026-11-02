import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/**
 * Composer modules the engine still reaches through the `#lib/*` alias. Each
 * one is a subsystem too large to move for the Poi Mirror demo (the animation
 * engine, effects, pictograph rendering, mandala services) or Composer glue
 * (route morphs, settings, panels). The list may only shrink. Adding to it is
 * a design decision, not a convenience. The count beside each entry is how
 * many imports reached it on 2026-11-01.
 */
const ALLOWED = new Set<string>([
  "#lib/features/browse/sequences", // 1
  "#lib/features/choreo-card/domain", // 6
  "#lib/features/choreo-card/services", // 13
  "#lib/features/lab/vtg-lab", // 2
  "#lib/shared/animation-engine/components", // 1
  "#lib/shared/animation-engine/domain", // 7
  "#lib/shared/animation-engine/services", // 2
  "#lib/shared/animation-engine/state", // 8
  "#lib/shared/animation-panel/components", // 4
  "#lib/shared/animation-panel/pill-nav", // 4
  "#lib/shared/animation-panel/state", // 1
  "#lib/shared/application/state", // 4
  "#lib/shared/components/DifficultyBadge.svelte", // 2
  "#lib/shared/components/DualSourceCrossfade.svelte", // 2
  "#lib/shared/components/LazyMount.svelte", // 1
  "#lib/shared/components/LevelSelector.svelte", // 2
  "#lib/shared/components/panel", // 6
  "#lib/shared/coordinators/sequence-handoff.svelte", // 1
  "#lib/shared/create/services", // 9
  "#lib/shared/effects/renderers", // 1
  "#lib/shared/effects/services", // 4
  "#lib/shared/effects/state", // 1
  "#lib/shared/effects/translators", // 1
  "#lib/shared/effort/domain", // 1
  "#lib/shared/foundation/domain", // 9
  "#lib/shared/foundation/ui", // 2
  "#lib/shared/foundation/utils", // 2
  "#lib/shared/keyboard/get-escape-layer-manager", // 3
  "#lib/shared/keyboard/get-keyboard-shortcut-manager", // 1
  "#lib/shared/loop-labeler/get-loop-display-resolver", // 1
  "#lib/shared/mandala/domain", // 18
  "#lib/shared/mandala/services", // 5
  "#lib/shared/navigation/services", // 1
  "#lib/shared/panels/PanelGroup.svelte", // 1
  "#lib/shared/pictograph/grid", // 2
  "#lib/shared/pictograph/prop", // 8
  "#lib/shared/pictograph/shared", // 4
  "#lib/shared/sequence-viewer/context", // 2
  "#lib/shared/sequence-viewer/domain", // 1
  "#lib/shared/sequence-viewer/services", // 2
  "#lib/shared/sequence-viewer/state", // 1
  "#lib/shared/sequence-viewer/tunnel", // 1
  "#lib/shared/settings/components", // 4
  "#lib/shared/share/services", // 1
  "#lib/shared/timeline/adapters", // 1
  "#lib/shared/timeline/StepStrip.svelte", // 1
  "#lib/shared/timeline/unified-playback-context", // 1
  "#lib/shared/timeline/UnifiedTimeline.svelte", // 2
  "#lib/shared/toast/state", // 1
  "#lib/shared/transitions/claimed-view-transition-name", // 3
  "#lib/shared/transitions/layout-flip", // 1
  "#lib/shared/transitions/results-morph", // 1
  "#lib/shared/ui/components", // 7
]);

const IMPORT = /(?:from\s+|import\s*\(\s*)["'](#lib\/[^"']+)["']/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|svelte)$/.test(name) ? [full] : [];
  });
}

const sources = files(ROOT).filter((f) => !f.includes("__tests__"));

describe("@tka/shape-engine's Composer imports", () => {
  it("only reach the frozen allowlist", () => {
    const seen = new Set<string>();
    for (const f of sources) {
      for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) {
        const key = m[1]!.replace(/\.js$/, "").split("/").slice(0, 4).join("/");
        if (!ALLOWED.has(key)) seen.add(`${relative(ROOT, f)} -> ${m[1]}`);
      }
    }
    expect([...seen]).toEqual([]);
  });

  it("never imports i18n or the Composer's transition wrappers", () => {
    const hits = sources.filter((f) =>
      /#lib\/shared\/(i18n|transitions\/(motion|transitions))\b/.test(
        readFileSync(f, "utf8")
      )
    );
    expect(hits).toEqual([]);
  });

  it("never imports itself by package name", () => {
    const hits = sources.filter((f) =>
      /["']@tka\/shape-engine(\/|["'])/.test(readFileSync(f, "utf8"))
    );
    expect(hits).toEqual([]);
  });
});
