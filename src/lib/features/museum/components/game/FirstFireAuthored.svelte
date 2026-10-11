<script lang="ts">
  /**
   * The Fire wing as the museum walks it: the authored Cinder Court shell plus
   * everything the museum puts INTO it at runtime.
   *
   * The GLB (`static/models/museum/cave/first-fire-cinder-court.glb`) is the
   * finished cave - carved from the same digest-stamped plan physics reads,
   * remeshed, textured and baked in Blender by
   * scripts/build-first-fire-production.py. It carries the rock (one piece per
   * court plus the lane, each under its own lightmap), the three court stones,
   * the trench rings, the torch stems, the coal-memory guides, the water
   * threshold slab and the green growth path to the Earth door. It carries no
   * light of its own: every photon in the Cinder Court comes from something
   * that is burning, which is what lets the extinguish beat take the room to
   * black.
   *
   *   flames      the instanced shader flames on the sixty authored guides.
   *   the state   the procession (dj -> ek -> fl -> blackout -> growth), read
   *               off the visitor's position by the same review owner the
   *               test route uses. It scales each court's BAKED light: a court
   *               burns at full lightmap, banks to coals once the visitor has
   *               walked out of it, and is dark until its turn comes.
   *   lights      three pooled point lights through the room light plan - the
   *               burning court's hero, the water threshold, the growth reveal.
   *   performers  one automaton per court, standing on the court stone and
   *               dancing while its court burns.
   *
   * The GLB is authored about the fire room's plan centre, so it mounts at that
   * centre and nothing else moves. Museum3DScene's generic performer loop skips
   * the three Fire stations because this file owns them.
   */
  import { T, useTask } from "@threlte/core";
  import { Box3, Mesh, MeshStandardMaterial, type Object3D } from "three";
  import GltfAsset from "#lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import MuseumPerformerStation3D from "./MuseumPerformerStation3D.svelte";
  import FirstFireProcessionFlames from "./first-fire/FirstFireProcessionFlames.svelte";
  import FirstFireShrineVolumes from "./first-fire/FirstFireShrineVolumes.svelte";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import type {
    AuthoredPointLight,
    AuthoredPointLightPlanChange,
  } from "../../services/museum-room-light-pool";
  import {
    FIRE_ROOM_ID,
    GROTTO_ROOM_ID,
    buildFirstFireProcessionBay,
  } from "../../data/first-fire-procession-terrain";
  import { buildFirstFireBlenderContract } from "../../data/first-fire-blender-contract";
  import type { FirstFireShrineId } from "../../data/first-fire-procession-plan";
  import { completedFirstFireShrines } from "../../data/first-fire-procession-state";
  import {
    advanceFirstFireGrayboxProof,
    activeFirstFireShrine,
    createFirstFireGrayboxReviewState,
    displayedFirstFireShrine,
    litFirstFireShrine,
    updateFirstFireGrayboxReview,
    visibleFirstFireFlameGroups,
  } from "../../data/first-fire-procession-review";
  import { firstFireCourtEffectId } from "../../data/first-fire-court-vocabulary";
  import {
    FIRST_FIRE_EXPECTED_FLAME_COUNT,
    extractFirstFireFlameAnchors,
    type FirstFireFlameAnchor,
  } from "../../services/first-fire-flame-field";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; the court idles when they are elsewhere. */
    currentRoomId?: string | null;
    /** Where the visitor is, in world metres. Drives the procession. */
    playerPosition: { x: number; y: number; z: number };
    visible?: boolean;
    onLightPlanChange?: AuthoredPointLightPlanChange;
  }
  const {
    grid,
    currentRoomId = null,
    playerPosition,
    visible = true,
    onLightPlanChange,
  }: Props = $props();

  const SHELL_URL = "/models/museum/cave/first-fire-cinder-court.glb";
  const FIRE_ROUTE = new Set([FIRE_ROOM_ID, GROTTO_ROOM_ID]);
  type CourtKey = "lane" | FirstFireShrineId;

  const bay = buildFirstFireProcessionBay(grid);
  const contract = bay ? buildFirstFireBlenderContract(bay.plan, bay.corridor) : null;
  /**
   * The Blender authoring origin: the fire ROOM's plan centre, which is what
   * scripts/export-first-fire-blender-plan.ts hands the exporter. Blender
   * (x, y, z) lands in the museum as (x + ox, z, oz - y).
   */
  const origin: [number, number, number] = contract
    ? [contract.room.planCentre.x, 0, contract.room.planCentre.z]
    : [0, 0, 0];
  const toWorld = (p: { x: number; y: number }) => ({
    x: p.x + origin[0],
    z: origin[2] - p.y,
  });
  const shrineById = (id: FirstFireShrineId | null) =>
    id && contract ? (contract.shrines.find((s) => s.id === id) ?? null) : null;

  // ── The baked light, and how the procession drives it ────────────────────
  // The lightmaps are baked at Cycles exposure and read dark under the
  // museum's ACES at 1.1, so they take the same flat lift the Water shell
  // takes. The emissive-ONLY materials must not: they are tuned here by name,
  // so a colour change is a reload rather than a rebake.
  const LIGHTMAP_BOOST = 2.6;
  /** A finished court after the visitor walks out of its light: banked coals. */
  const COAL_FACTOR = 0.28;
  /** A court whose turn has not come, seen from its dark threshold. */
  const UNLIT_FACTOR = 0.06;
  /** The lane once the fires are out and the growth has come: a memory of heat. */
  const MEMORY_FACTOR = 0.1;
  /** How fast a court's baked light banks or catches, per second. */
  const LIGHT_SLEW = 2.2;
  const EMISSIVE_TUNING: Record<
    string,
    { color?: string; base?: string; intensity: number }
  > = {
    "FF Water Threshold": { color: "#5fb3c9", base: "#05151a", intensity: 0.45 },
    "FF Coal Memory": { color: "#c8380e", base: "#1a0703", intensity: 0.28 },
    // The slabs are moss catching the Earth-door light, not a light source:
    // a lit mossy base with a whisper of emissive, so the door light shades
    // them with its falloff. At 1.1 (and still at 0.38) the emissive won
    // and they tone-mapped to a flat lime plank.
    "FF Earth Growth": { color: "#3f9a32", base: "#173d16", intensity: 0.1 },
    "FF Trench Ember DJ": { color: "#ff3a0c", base: "#1a0503", intensity: 1.35 },
    "FF Trench Ember EK": { color: "#ff4a14", base: "#1a0503", intensity: 1.35 },
    "FF Trench Ember FL": { color: "#ff2e08", base: "#1a0503", intensity: 1.35 },
  };

  /** Which court a material's light belongs to, or null for the untouched ones. */
  function courtOf(materialName: string): CourtKey | null {
    const match =
      /^FF (?:Rock|Court Stone|Trench Ember) (Lane|DJ|EK|FL)$/.exec(materialName);
    if (match) return match[1]!.toLowerCase() as CourtKey;
    if (materialName === "FF Coal Memory") return "lane";
    return null;
  }

  interface DrivenMaterial {
    material: MeshStandardMaterial;
    court: CourtKey;
    /** The intensity the material shows at full burn. */
    full: number;
    current: number;
  }
  let driven: DrivenMaterial[] = [];
  let trenchMeshes: Partial<Record<FirstFireShrineId, Mesh[]>> = {};
  let growthMeshes: Mesh[] = [];
  let flameAnchors = $state<FirstFireFlameAnchor[]>([]);
  /** Top of each court stone, measured off the loaded GLB: the performer stands on it. */
  let stoneTop = $state<Partial<Record<FirstFireShrineId, number>>>({});

  function stageShell(shell: Object3D): void {
    if (!contract) return;
    flameAnchors = extractFirstFireFlameAnchors(shell, contract.fireGuides);
    if (flameAnchors.length !== FIRST_FIRE_EXPECTED_FLAME_COUNT) {
      console.warn(
        `[FirstFireAuthored] Expected ${FIRST_FIRE_EXPECTED_FLAME_COUNT} flame guides, found ${flameAnchors.length}.`
      );
    }
    const seen = new Set<MeshStandardMaterial>();
    const nextDriven: DrivenMaterial[] = [];
    const nextTrenches: Partial<Record<FirstFireShrineId, Mesh[]>> = {};
    const nextGrowth: Mesh[] = [];
    const nextStoneTop: Partial<Record<FirstFireShrineId, number>> = {};
    shell.updateMatrixWorld(true);
    shell.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name;
      // The guides are where the flames go, not what they look like: the
      // shader flames stand on them.
      if (/^FF_FlameGuide_/i.test(name)) {
        mesh.visible = false;
        return;
      }
      mesh.receiveShadow = true;
      let trench = /^FF_Trench_(dj|ek|fl)/i.exec(name);
      if (trench) {
        const id = trench[1]!.toLowerCase() as FirstFireShrineId;
        (nextTrenches[id] ??= []).push(mesh);
        // The node name is the authority for which court a ring belongs to.
        // Give the ring its own material named for that court so the tuning
        // below and the per-court dimming never share state across courts,
        // even if an optimiser pass folded identical materials together.
        if (mesh.material instanceof MeshStandardMaterial) {
          const own = mesh.material.clone();
          own.name = `FF Trench Ember ${id.toUpperCase()}`;
          mesh.material = own;
        }
      }
      if (/^FF_Growth_/i.test(name)) nextGrowth.push(mesh);
      const stone = /^FF_CourtStone_(DJ|EK|FL)/i.exec(name);
      if (stone) {
        nextStoneTop[stone[1]!.toLowerCase() as FirstFireShrineId] =
          new Box3().setFromObject(mesh).max.y;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!(mat instanceof MeshStandardMaterial) || seen.has(mat)) continue;
        seen.add(mat);
        const tune = EMISSIVE_TUNING[mat.name];
        if (tune) {
          if (tune.color) mat.emissive.set(tune.color);
          if (tune.base) mat.color.set(tune.base);
          mat.emissiveIntensity = tune.intensity;
        } else if (mat.emissiveMap) {
          mat.emissiveIntensity = (mat.emissiveIntensity || 1) * LIGHTMAP_BOOST;
        }
        const court = courtOf(mat.name);
        if (court) {
          nextDriven.push({
            material: mat,
            court,
            full: mat.emissiveIntensity,
            current: mat.emissiveIntensity,
          });
        }
      }
    });
    driven = nextDriven;
    trenchMeshes = nextTrenches;
    growthMeshes = nextGrowth;
    stoneTop = nextStoneTop;
    applyCourtLight(1);
  }

  // ── The procession ────────────────────────────────────────────────────────
  let reviewState = $state(createFirstFireGrayboxReviewState());
  /** The wing is live while the visitor is in it or in the grotto next door. */
  const near = $derived(
    visible && currentRoomId !== null && FIRE_ROUTE.has(currentRoomId)
  );
  const phase = $derived(reviewState.procession.phase);
  const blackout = $derived(phase === "fire-extinguished");
  const growthVisible = $derived(phase === "growth-complete");

  // Dev seam, the same idea as window.__docent: the procession phase is not
  // visible from outside the component, and a browser verification pass
  // needs to read it without guessing from screenshots.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    // Getters, so a read happens when the console asks, not inside an effect
    // that would re-run on every frame the visitor moves.
    (window as unknown as { __firstFire?: unknown }).__firstFire = {
      get phase() {
        return phase;
      },
      get near() {
        return near;
      },
      get flameAnchors() {
        return flameAnchors.length;
      },
      get player() {
        return { x: playerPosition.x, z: playerPosition.z };
      },
      get review() {
        return $state.snapshot(reviewState);
      },
      get lights() {
        return lightPlan.map((l) => ({ x: l.x, z: l.z, intensity: l.intensity }));
      },
      /** The graybox route's proof button: one canonical transition per call. */
      advance() {
        reviewState = advanceFirstFireGrayboxProof(reviewState);
        return reviewState.procession.phase;
      },
    };
  }
  const activeShrineId = $derived(activeFirstFireShrine(phase));
  // The performer station must never unmount mid-walk. When `performer` went
  // null at growth-complete the station's reactive reads (effectId, through
  // the rig's tip-effect map) dereferenced null during teardown, and that one
  // TypeError killed the Threlte frame loop: a frozen frame, no recovery short
  // of a reload. So once the fire is out the FL performer stays at its cold
  // court, present and still, the way the Water performers stay mounted and
  // merely go inactive.
  const displayedShrineId = $derived(
    displayedFirstFireShrine(phase) ??
      (phase === "growth-complete" ? ("fl" as const) : null)
  );
  const litShrineId = $derived(litFirstFireShrine(reviewState));
  const visibleFlameGroups = $derived(visibleFirstFireFlameGroups(reviewState));
  const displayedShrine = $derived(shrineById(displayedShrineId));
  const litShrine = $derived(shrineById(litShrineId));
  /** The court the hero light stands in: the burning one, else the one the visitor walks toward. */
  const heroShrineId = $derived.by((): FirstFireShrineId | null => {
    if (litShrineId) return litShrineId;
    if (phase === "approach") return "dj";
    if (phase === "dj-complete") return "ek";
    if (phase === "ek-complete") return "fl";
    return null;
  });
  const heroShrine = $derived(shrineById(heroShrineId));

  /** What fraction of its baked light a court shows in the current phase. */
  function courtFactor(court: CourtKey): number {
    if (blackout) return 0;
    if (growthVisible) return court === "lane" ? MEMORY_FACTOR : COAL_FACTOR;
    if (court === "lane") return 1;
    if (visibleFlameGroups.has(court)) return 1;
    if (completedFirstFireShrines(reviewState.procession).includes(court)) {
      return COAL_FACTOR;
    }
    return UNLIT_FACTOR;
  }

  /** Slew every driven material toward its phase target; `blend` 1 snaps. */
  function applyCourtLight(blend: number): void {
    for (const entry of driven) {
      const target = entry.full * courtFactor(entry.court);
      entry.current += (target - entry.current) * blend;
      entry.material.emissiveIntensity = entry.current;
    }
    for (const [id, meshes] of Object.entries(trenchMeshes)) {
      const on = courtFactor(id as FirstFireShrineId) > UNLIT_FACTOR;
      for (const mesh of meshes) mesh.visible = on;
    }
    for (const mesh of growthMeshes) mesh.visible = growthVisible;
  }

  useTask((delta) => {
    if (!contract) return;
    if (near) {
      reviewState = updateFirstFireGrayboxReview(
        reviewState,
        contract,
        { x: playerPosition.x - origin[0], z: playerPosition.z - origin[2] },
        delta * 1000
      );
    }
    applyCourtLight(Math.min(1, delta * LIGHT_SLEW));
  });

  function yawToward(
    from: { x: number; z: number },
    to: { x: number; z: number }
  ): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  /** Generous: the court IS the room. */
  const PERFORMER_ACTIVE_M = 30;
  const performer = $derived.by(() => {
    const shrine = displayedShrine;
    if (!shrine) return null;
    const centre = toWorld(shrine.blenderCentre);
    const entry = toWorld(shrine.blenderEntry);
    const distance = Math.hypot(
      centre.x - playerPosition.x,
      centre.z - playerPosition.z
    );
    return {
      id: shrine.id,
      key: `${shrine.id}:${stoneTop[shrine.id] ?? "unmeasured"}`,
      stationId: shrine.performerId,
      sequenceId: shrine.sequenceId,
      x: centre.x,
      z: centre.z,
      facing: yawToward(centre, entry),
      active: near && shrine.id === litShrineId && distance < PERFORMER_ACTIVE_M,
      showGrid: shrine.id === activeShrineId,
      standingSurfaceHeight: stoneTop[shrine.id] ?? 0,
      effectId: firstFireCourtEffectId(shrine.id),
    };
  });

  // ── The pooled lights ─────────────────────────────────────────────────────
  // Three slots, always reported so the renderer keeps its fixed PointLights
  // and only their intensities move: the burning court's hero, the cool water
  // threshold behind the visitor, and the green reveal at the Earth door.
  const lightPlan = $derived.by((): AuthoredPointLight[] => {
    if (!contract) return [];
    const hero = heroShrine ? toWorld(heroShrine.blenderCentre) : null;
    const water = toWorld({
      x: contract.doors.water.blender.x + 2.2,
      y: contract.doors.water.blender.y,
    });
    const earth = toWorld({
      x: contract.doors.earth.blender.x - 2.5,
      y: contract.doors.earth.blender.y,
    });
    return [
      {
        x: hero?.x ?? origin[0],
        y: 2.3,
        z: hero?.z ?? origin[2],
        color: "#ff4a18",
        intensity: hero && !blackout && !growthVisible ? 42 : 0,
        distance: 14,
        modulationHz: 3.3,
        modulationDepth: 0.14,
      },
      {
        x: water.x,
        y: 2.6,
        z: water.z,
        color: "#7cc7dd",
        intensity: blackout ? 0 : 10,
        distance: 11,
      },
      {
        x: earth.x,
        y: 2.1,
        z: earth.z,
        color: "#72d957",
        intensity: growthVisible ? 30 : 0,
        distance: 15,
      },
    ];
  });

  $effect(() => {
    if (!contract || !onLightPlanChange) return;
    onLightPlanChange("first-fire", {
      roomIds: [...FIRE_ROUTE],
      lights: lightPlan,
    });
    return () => onLightPlanChange("first-fire", null);
  });
</script>

{#if contract}
  <T.Group {visible}>
    <GltfAsset url={SHELL_URL} position={origin} onReady={stageShell} />

    {#if near && flameAnchors.length > 0}
      <FirstFireProcessionFlames
        anchors={flameAnchors}
        visibleGroups={visibleFlameGroups}
        pooledLights={0}
        position={origin}
      />
    {/if}

    {#if near && litShrine}
      {@const centre = toWorld(litShrine.blenderCentre)}
      <FirstFireShrineVolumes
        shrineId={litShrine.id}
        position={[centre.x, 0, centre.z]}
      />
    {/if}

    {#if performer}
      <!-- Keyed on the measurement too: the station reads standingSurfaceHeight
           once at mount, so a rig mounted before the GLB resolved would keep the
           stale height for the rest of the walk. -->
      {#key performer.key}
        <MuseumPerformerStation3D
          stationId={performer.stationId}
          worldX={performer.x}
          worldY={0}
          worldZ={performer.z}
          facingAngle={performer.facing}
          sequenceId={performer.sequenceId}
          autoPlay={true}
          active={performer.active}
          showGrid={performer.showGrid}
          showPlatform={false}
          standingSurfaceHeight={performer.standingSurfaceHeight}
          effectId={performer.effectId}
        />
      {/key}
    {/if}
  </T.Group>
{/if}
