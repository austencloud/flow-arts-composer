import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ORCHESTRATOR = resolve(
  "src/lib/shared/3d/effects/EffectOrchestrator3D.svelte"
);

describe("EffectOrchestrator3D mounts EffectsLayer", () => {
  const source = readFileSync(ORCHESTRATOR, "utf8");

  it("imports EffectsLayer", () => {
    expect(source).toMatch(
      /import\s+EffectsLayer\s+from\s+"\.\/EffectsLayer\.svelte"/
    );
  });

  it("renders EffectsLayer in its template", () => {
    expect(source).toMatch(/<EffectsLayer\b/);
  });

  it("passes the prop states EffectsLayer needs", () => {
    const tag = source.slice(source.indexOf("<EffectsLayer"));
    for (const prop of [
      "leftPropState",
      "rightPropState",
      "isPlaying",
      "staffLength",
      "currentStep",
    ]) {
      expect(tag).toContain(prop);
    }
  });

  it("passes rig-local tip motion instead of letting the layer track prop centers", () => {
    const tag = source.slice(source.indexOf("<EffectsLayer"));
    expect(tag).toContain("leftTipData");
    expect(tag).toContain("rightTipData");
  });

  it("passes both hand anchors so Ghost captures the live prop centers", () => {
    const tag = source.slice(source.indexOf("<EffectsLayer"));
    expect(tag).toContain("leftHandPos");
    expect(tag).toContain("rightHandPos");
  });
});

/**
 * The 2D/3D channel guard.
 *
 * EffectsLayer used to decide which effect was live by reading the
 * effects-config CONTEXT (`config.tipEffectMap["*"].effect`). That map is the
 * 2D/global selection. The 3D selection travels down the prop channel that
 * EffectOrchestrator3D resolves via resolveEffect(tipEffectMap,
 * globalTipEffectMap) for trails/led/charcoal/fire. With the layer mounted,
 * reading the context meant the 2D choice rendered on the 3D props: picking Goo
 * in 2D while the 3D picker said LED produced gooey LEDs.
 */
const LAYER = resolve("src/lib/shared/3d/effects/EffectsLayer.svelte");

describe("EffectsLayer follows the 3D effect selection, not the 2D one", () => {
  const layerSource = readFileSync(LAYER, "utf8");
  const orchestratorSource = readFileSync(ORCHESTRATOR, "utf8");

  it("does not gate any effect on the effects-config context map", () => {
    // The fallback for unplumbed callers may still reference the map, but no
    // effect may be gated by comparing it to an effect id.
    expect(layerSource).not.toMatch(/tipEffectMap\["\*"\]\?\.effect === "/);
  });

  it("takes the active effects as a prop", () => {
    expect(layerSource).toMatch(/activeEffects\??:/);
  });

  it("is handed the orchestrator's resolved effects", () => {
    const tag = orchestratorSource.slice(
      orchestratorSource.indexOf("<EffectsLayer")
    );
    expect(tag).toContain("activeEffects");
  });

  it("does not share the process-wide legacy motion history", () => {
    expect(layerSource).not.toContain("getEffectState");
    expect(layerSource).not.toContain("updatePositions(");
  });

  it("forwards each hand anchor to its matching Ghost renderer", () => {
    expect(layerSource).toMatch(
      /propState=\{leftPropState\}[\s\S]*?handAnchor=\{leftHandPos\}/
    );
    expect(layerSource).toMatch(
      /propState=\{rightPropState\}[\s\S]*?handAnchor=\{rightHandPos\}/
    );
  });

  it("resolves those from the same maps the imperative renderers use", () => {
    expect(orchestratorSource).toMatch(
      /resolveEffect\(0,\s*effectKeyIndex,\s*tipEffectMap,\s*globalTipEffectMap/
    );
    expect(orchestratorSource).toMatch(
      /resolveEffect\(1,\s*effectKeyIndex,\s*tipEffectMap,\s*globalTipEffectMap/
    );
    for (const propIndex of [0, 1]) {
      expect(orchestratorSource).toMatch(
        new RegExp(
          `resolveEffect\\(\\s*${propIndex},\\s*tip\\.effectKeyIndex,\\s*tipEffectMap,\\s*globalTipEffectMap`
        )
      );
    }
  });

  it("takes its tip slots from the prop in hand, not a hardcoded four", () => {
    // A club has one end. Enumerating [[0,0],[0,1],[1,0],[1,1]] lit effects for
    // ends the prop does not have.
    expect(orchestratorSource).toMatch(
      /resolveScaledPropTipAnchors3D\(\s*leftPropType,\s*staffHalfLength,\s*propScale,\s*propBuild\s*\)/
    );
    expect(orchestratorSource).toMatch(
      /resolveScaledPropTipAnchors3D\(\s*rightPropType,\s*staffHalfLength,\s*propScale,\s*propBuild\s*\)/
    );
  });
});
