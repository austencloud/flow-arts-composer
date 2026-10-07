import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ORCHESTRATOR = readFileSync(
  resolve("src/lib/shared/3d/effects/EffectOrchestrator3D.svelte"),
  "utf8"
);
const LAYER = readFileSync(
  resolve("src/lib/shared/3d/effects/EffectsLayer.svelte"),
  "utf8"
);
const COORDINATOR = readFileSync(
  resolve(
    "src/lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte"
  ),
  "utf8"
);
const GHOST_HISTORY = readFileSync(
  resolve("src/lib/shared/3d/effects/motion/GhostPropHistory3D.svelte"),
  "utf8"
);
const GHOST_PHANTOM = readFileSync(
  resolve("src/lib/shared/3d/effects/motion/GhostPropPhantom3D.svelte"),
  "utf8"
);
const GHOST_FROST = readFileSync(
  resolve("src/lib/shared/3d/effects/motion/ghost-chrono-frost-3d.ts"),
  "utf8"
);
const BLOOM = readFileSync(
  resolve("src/lib/shared/3d/effects/bloom/bloom-renderer-3d.ts"),
  "utf8"
);
const BLOOM_MATERIAL = readFileSync(
  resolve("src/lib/shared/3d/effects/bloom/bloom-material-3d.ts"),
  "utf8"
);
const ZAP = readFileSync(
  resolve("src/lib/shared/3d/effects/energy/ElectricityArc.svelte"),
  "utf8"
);

describe("scene-level particle batching contract", () => {
  it("publishes TipPositionBridge3D results to the scene manager", () => {
    expect(ORCHESTRATOR).toContain("publishPooledTip");
    expect(ORCHESTRATOR).toContain("tip.velocity");
    expect(ORCHESTRATOR).toContain("pooledFrame.sources.push");
  });

  it("suppresses the per-tip Svelte emitters when scene batches are active", () => {
    expect(ORCHESTRATOR).toContain("pooledEffectsManaged");
    for (const effect of [
      "sparklesEnabled",
      "gooEnabled",
      "bubblesEnabled",
      "petalsEnabled",
      "smokeEnabled",
    ]) {
      expect(LAYER).toMatch(new RegExp(`!pooledEffectsManaged && ${effect}`));
    }
  });

  it("keeps one coordinator at every scene root that mounts effect orchestrators", () => {
    const roots = [
      "src/lib/shared/3d/components/Viewer3DScene.svelte",
      "src/lib/features/coven-hub/components/CovenHub.svelte",
      "src/lib/features/museum/components/game/Museum3DScene.svelte",
      "src/routes/test/effect-grid/EffectGridScene.svelte",
      "src/routes/test/element-motifs/ElementMotifScene.svelte",
    ];
    for (const root of roots) {
      const source = readFileSync(resolve(root), "utf8");
      // A root delivers its single manager to the orchestrators below it
      // through one of two sanctioned seams: Svelte context (synchronous
      // roots) or the explicit `sceneEffectsManagerOverride` prop, which
      // Viewer3DScene uses because 21335f9da9 made the manager stream in
      // behind a dynamic import and it therefore cannot exist at init.
      const suppliesManager =
        source.includes("setSceneEffectsContext") ||
        source.includes("sceneEffectsManagerOverride");
      expect(suppliesManager, `${root} supplies a SceneEffectsManager3D`).toBe(
        true
      );
      // Exactly one coordinator — two would batch the same tips twice.
      expect(
        source.match(/<SceneEffectsCoordinator3D/g) ?? [],
        root
      ).toHaveLength(1);
    }
  });

  it("initializes the scene coordinator with its parent or Threlte's direct Scene value", () => {
    // Trailing args are open by design — the renderer was added as a second
    // parameter. What this guards is the `parent ?? scene` shape and, below,
    // that Threlte's `scene` is read directly rather than through `.current`.
    expect(COORDINATOR).toContain("manager.initialize(parent ?? scene");
    expect(COORDINATOR).not.toContain("scene.current");
  });

  it("keeps a bounded Ghost prop pool and disposes each slot material", () => {
    expect(GHOST_HISTORY).toContain("resolveGhostPoolSize");
    expect(GHOST_HISTORY).toContain("Array.from({ length: poolSize }");
    expect(GHOST_PHANTOM).toContain("<Prop3D");
    expect(GHOST_PHANTOM).not.toMatch(/<T\.(?:Cylinder|Sphere)Geometry/);
    expect(GHOST_PHANTOM).toContain(
      "onDestroy(() => sourceMaterials.dispose())"
    );
    expect(GHOST_FROST).toContain(
      "for (const frost of this.frostBySource.values()) frost.dispose();"
    );
  });

  it("rewrites Zap's fixed GPU buffers instead of replacing geometries", () => {
    expect(ZAP).toContain("createDynamicGeometry");
    expect(ZAP).toContain("writeLineStrip");
    expect(ZAP).toContain("writeLineSegments");
    expect(ZAP).toContain("<T.LineSegments geometry={branchGeometry}>");
    expect(ZAP.match(/new BufferGeometry\(\)/g)).toHaveLength(1);
  });

  it("routes Bloom through one scene batch with real optical controls", () => {
    expect(ORCHESTRATOR).toContain('effect !== "bloom"');
    expect(ORCHESTRATOR).toContain("params: resolvedBloom");
    expect(LAYER).not.toContain("BloomBillboard3D");
    expect(BLOOM).toContain("new InstancedMesh");
    expect(BLOOM).toContain("writeHistory");
    expect(BLOOM_MATERIAL).toContain("vStreak");
    expect(BLOOM_MATERIAL).toContain("vSpikes");
    expect(BLOOM_MATERIAL).toContain("vFalloff");
    expect(
      existsSync(
        resolve(
          "src/lib/shared/3d/effects/post-processing/BloomBillboard3D.svelte"
        )
      )
    ).toBe(false);
  });

  it("routes Fire through the scene batch instead of one renderer per rig", () => {
    expect(ORCHESTRATOR).toContain('effect !== "fire"');
    expect(ORCHESTRATOR).toContain("params: resolvedFire");
    expect(ORCHESTRATOR).toContain(
      'effect === "fire" && sceneEffectsManager === null'
    );
  });

  it("routes Coal through one scene pool and prepares interactive rig effects", () => {
    expect(ORCHESTRATOR).toContain('effect !== "charcoal"');
    expect(ORCHESTRATOR).toContain("params: resolvedCharcoal");
    expect(ORCHESTRATOR).toContain(
      'effect === "charcoal" && sceneEffectsManager === null'
    );
    expect(ORCHESTRATOR).toContain("prepareInteractiveRenderers");
    expect(ORCHESTRATOR).toContain("primeTipCapacity(2)");
  });

  it("keeps Trails, Zap, and Ghost mounted before selection", () => {
    expect(ORCHESTRATOR).toContain(
      'enabled={tip.effect === "trails" && isPlaying}'
    );
    expect(LAYER).toContain("enabled={zapEnabled && isPlaying}");
    expect(LAYER).toContain("{#if ghost3D}");
    expect(ZAP).not.toContain("<T.PointLight");
  });

  it("does not leave the retired duplicate fire emitter in the tree", () => {
    expect(
      existsSync(
        resolve("src/lib/shared/3d/effects/particles/FireEmitter.svelte")
      )
    ).toBe(false);
  });
});
