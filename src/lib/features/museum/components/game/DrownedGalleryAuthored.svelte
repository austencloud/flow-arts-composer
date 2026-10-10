<script lang="ts">
  /**
   * The Water wing as the museum walks it: the authored shell plus everything
   * the museum puts INTO it at runtime.
   *
   * The GLB (`static/models/museum/cave/drowned-gallery.glb`) is the finished
   * cave — carved from the same hash-stamped plan physics reads, remeshed,
   * textured and baked in Blender by scripts/build-drowned-gallery-production.py.
   * It carries rock, the cut-stone slabs, rails, the gilded threshold, the
   * apse lamps and the glowworm dome. It deliberately carries nothing else:
   *
   *   water        rendered here, because a baked mirror exports black.
   *   pedestals    the museum-wide standard (PedestalMesh), sized by the
   *                eye-line rule off the layout's own fixtures.
   *   consoles     one lectern per case, aimed at and pressed with E.
   *   performers   the three cases, standing ON their pedestals and driven by
   *                the console state, so a press changes the dance and the
   *                drawing under it together.
   *
   * Every coordinate here is a layout coordinate, which is a museum world
   * coordinate. The GLB is authored about the bay centre, so it mounts at that
   * centre and nothing else moves. Museum3DScene's generic performer loop
   * skips the three Water stations because this file owns them.
   */
  import { T, useThrelte } from "@threlte/core";
  import { onDestroy, onMount } from "svelte";
  import {
    BackSide,
    BoxGeometry,
    DoubleSide,
    MeshStandardMaterial,
    Vector3,
    Mesh,
    Object3D,
  } from "three";
  import GltfAsset from "#lib/shared/3d/environments/primitives/GltfAsset.svelte";
  import ReflectivePool from "#lib/shared/3d/environments/primitives/ReflectivePool.svelte";
  import PedestalMesh from "../graybox/PedestalMesh.svelte";
  import ConsoleMesh from "../graybox/ConsoleMesh.svelte";
  import MuseumPerformerStation3D from "./MuseumPerformerStation3D.svelte";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import type { AuthoredPointLightPlanChange } from "../../services/museum-room-light-pool";
  import {
    buildDrownedGalleryLayout,
    type WorldRect,
    APPROACH_ROOM_ID,
    GALLERY_ROOM_ID,
    GROTTO_ROOM_ID,
    WATERLINE_Y,
    GROTTO_WATERLINE_Y,
    GALLERY_FLOOR_Y,
    GALLERY_ROOF_Y,
    CAUSEWAY_Y,
    SHELF_Y,
  } from "../../data/drowned-gallery-terrain";
  import { pedestalFaceDataUri } from "../../services/pedestal-face";
  import {
    boundSteps,
    effectiveSteps,
  } from "../../services/exhibit-console-sequence";
  import {
    CONSOLE_BUTTON_D,
    CONSOLE_FACE,
    CONSOLE_FACE_TILT,
    CONSOLE_FULL_M,
    CONSOLE_WAKE_M,
    applyVerb,
    consoleColumnX,
    consoleFaceSize,
    consoleFaceY,
    consoleRowY,
    defaultSettings,
    isHybrid,
    isModified,
    verbsFor,
    type ConsoleVerb,
    type PerformerSettings,
  } from "../../domain/exhibit-console";
  import {
    createSequenceData,
    type SequenceData,
  } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; lights idle when they are elsewhere. */
    currentRoomId?: string | null;
    /** Where the visitor is, in world metres. Drives console wake and performer activity. */
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

  const SHELL_URL = "/models/museum/cave/drowned-gallery.glb";

  const WATER_TINT = "#7fd4e8";
  const FIRELIGHT = "#ffb35c";
  const CAVE_GLOW = "#7fe8c8";
  const PEDESTAL_PROP = "staff";

  const layout = buildDrownedGalleryLayout(grid);

  const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
  const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;
  const sx = (r: WorldRect) => r.maxX - r.minX;
  const sz = (r: WorldRect) => r.maxZ - r.minZ;
  const inRect = (r: WorldRect, x: number, z: number) =>
    x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

  /**
   * The Blender authoring origin: the centre of the three ROOMS' union, never
   * of `bayBounds`. The bay's bbox also holds the corridors the museum routes
   * to its neighbours, and those differ between the standalone cave plan the
   * exporter compiles and the full museum (which adds a 4 m dogleg south of
   * the approach door). A bbox origin would mount the GLB 2 m off the terrain
   * that physics reads. scripts/export-drowned-gallery-blender-plan.ts derives
   * `origin` the same way.
   */
  const origin = layout
    ? ((): [number, number, number] => {
        const rooms = [layout.approach, layout.gallery, layout.grotto];
        const minX = Math.min(...rooms.map((r) => r.minX));
        const maxX = Math.max(...rooms.map((r) => r.maxX));
        const minZ = Math.min(...rooms.map((r) => r.minZ));
        const maxZ = Math.max(...rooms.map((r) => r.maxZ));
        return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
      })()
    : ([0, 0, 0] as [number, number, number]);

  // ── Water ─────────────────────────────────────────────────────────────────
  const unitBox = new BoxGeometry(1, 1, 1);
  const waterSurface = new MeshStandardMaterial({
    color: "#0d3a52",
    emissive: "#0d3a52",
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.55,
    roughness: 0.12,
    metalness: 0.1,
    side: DoubleSide,
    depthWrite: false,
  });
  const waterVolume = new MeshStandardMaterial({
    color: "#0d3a52",
    transparent: true,
    opacity: 0.28,
    side: BackSide,
    depthWrite: false,
  });
  const waterfall = new MeshStandardMaterial({
    color: "#bfe4f0",
    emissive: "#bfe4f0",
    emissiveIntensity: 0.06,
    transparent: true,
    opacity: 0.2,
    side: DoubleSide,
    depthWrite: false,
  });
  const stone = new MeshStandardMaterial({ color: "#4f463a", roughness: 0.9 });

  // The lightmaps are baked at Cycles exposure and read dark under the
  // museum's ACES at 1.1, so they take a flat lift. The emissive-ONLY
  // materials — the glowworms and the three apse lamps — must not take it:
  // lifted 2.6x every one of them clipped to a white block and the colour the
  // asset carries was lost. They are tuned here by name instead, which also
  // means a colour change is a reload, not a four-minute rebake.
  //
  // The gilded threshold used to be on that list. It was a metal at 0.7 with
  // nothing but a flat emissive to draw, because the museum sets no
  // scene.environment and a metal without one has neither diffuse nor
  // reflection — it read as a cream cardboard cutout. It carries a baked
  // lightmap of its own now and takes the ordinary lift with the rock.
  const LIGHTMAP_BOOST = 2.6;
  // `base` darkens the albedo so the pooled point lights cannot wash the body
  // of a lamp back to a lit white box; what the visitor sees is the glow.
  const EMISSIVE_TUNING: Record<
    string,
    { color?: string; base?: string; intensity: number }
  > = {
    "DG Glowworm": { color: "#7fe4ff", base: "#061418", intensity: 1.0 },
    "DG Alcove Firelight": { color: "#ff9a3a", base: "#2a1a10", intensity: 0.75 },
  };
  function tuneShellMaterials(shell: Object3D): void {
    const seen = new Set<MeshStandardMaterial>();
    shell.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
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
      }
    });
  }
  onDestroy(() => {
    unitBox.dispose();
    waterSurface.dispose();
    waterVolume.dispose();
    waterfall.dispose();
    stone.dispose();
  });

  /** Brimming grotto bodies are mirrors; everything else is the waterline. */
  const grottoWater = (layout?.waterPlanes ?? [])
    .filter((plane) => plane.surfaceY === GROTTO_WATERLINE_Y)
    .map((plane, index) => ({
      id: `grotto-water-${index}`,
      isChannel: layout ? inRect(layout.channel, cx(plane), cz(plane)) : false,
      width: sx(plane),
      depth: sz(plane),
      position: [cx(plane), plane.surfaceY, cz(plane)] as [number, number, number],
    }));
  const waterlinePlanes = (layout?.waterPlanes ?? [])
    .filter((plane) => plane.surfaceY !== GROTTO_WATERLINE_Y)
    .map((plane, index) => ({
      id: `waterline-${index}`,
      position: [cx(plane), plane.surfaceY - 0.02, cz(plane)] as [number, number, number],
      scale: [sx(plane), 0.04, sz(plane)] as [number, number, number],
    }));
  const waterVolumes = (layout?.waterVolumes ?? []).map((volume) => ({
    id: volume.id,
    position: [
      cx(volume.rect),
      (volume.floorY + volume.surfaceY - 0.05) / 2,
      cz(volume.rect),
    ] as [number, number, number],
    scale: [
      sx(volume.rect),
      Math.max(0.05, volume.surfaceY - 0.05 - volume.floorY),
      sz(volume.rect),
    ] as [number, number, number],
  }));
  /** A thin veil from the fissure above the causeway into the channel, not a wall. */
  const WATERFALL_TOP_Y = CAUSEWAY_Y + 2.4;
  const waterfallSheet = layout
    ? {
        position: [
          layout.waterfall.minX + 0.25,
          (GROTTO_WATERLINE_Y + WATERFALL_TOP_Y) / 2,
          cz(layout.waterfall),
        ] as [number, number, number],
        scale: [0.12, WATERFALL_TOP_Y - GROTTO_WATERLINE_Y, Math.min(1.6, sz(layout.waterfall))] as [
          number,
          number,
          number,
        ],
      }
    : null;

  // ── The Order's furniture ─────────────────────────────────────────────────
  const fixtures = layout?.exhibitFixtures ?? [];
  const isPedestal = (kind: string) =>
    kind === "pedestal" || kind === "opener-pedestal";

  const pedestalSpecs = fixtures
    .filter((fixture) => isPedestal(fixture.kind))
    .map((fixture) => ({
      id: fixture.id,
      caseWord: fixture.caseWord ?? null,
      sequenceId: fixture.sequenceId ?? null,
      opener: fixture.kind === "opener-pedestal",
      position: [fixture.centre.x, fixture.baseY, fixture.centre.z] as [
        number,
        number,
        number,
      ],
      height: fixture.height,
      diameter: fixture.size.x,
    }));

  /** Opener dais and label plinth: plain stone, the pedestal stands on the dais. */
  const massing = fixtures
    .filter((fixture) => fixture.kind === "opener-dais" || fixture.kind === "opener-plinth")
    .map((fixture) => ({
      id: fixture.id,
      position: [
        fixture.centre.x,
        fixture.baseY + fixture.height / 2,
        fixture.centre.z,
      ] as [number, number, number],
      scale: [fixture.size.x, fixture.height, fixture.size.z] as [
        number,
        number,
        number,
      ],
      rotation: [0, fixture.facing, 0] as [number, number, number],
    }));

  /**
   * What each performer is currently doing. Modifications persist for as long
   * as the visitor is in the wing; the pedestal under the performer reports it.
   */
  const performerSettings = $state<Record<string, PerformerSettings>>(
    Object.fromEntries(
      pedestalSpecs
        .filter((spec) => spec.caseWord)
        .map((spec) => [spec.caseWord!, defaultSettings(PEDESTAL_PROP)])
    )
  );

  function faceUriFor(
    sequenceId: string,
    propType: string,
    opener: boolean,
    steps?: readonly StepData[]
  ): string | null {
    try {
      return pedestalFaceDataUri({
        sequenceId,
        propType,
        tint: WATER_TINT,
        handPathOnly: opener,
        ...(steps ? { steps } : {}),
      });
    } catch (error) {
      console.error("[pedestal]", error);
      return null;
    }
  }

  const pedestalFaces = $state<Record<string, string | null>>(
    Object.fromEntries(
      pedestalSpecs.map((spec) => [
        spec.id,
        spec.sequenceId
          ? faceUriFor(spec.sequenceId, PEDESTAL_PROP, spec.opener)
          : null,
      ])
    )
  );

  function safeBoundSteps(sequenceId: string): readonly StepData[] {
    try {
      return boundSteps(sequenceId);
    } catch (error) {
      console.error("[water case]", error);
      return [];
    }
  }

  const caseSteps = $state<Record<string, readonly StepData[]>>(
    Object.fromEntries(
      pedestalSpecs
        .filter((spec) => spec.caseWord && spec.sequenceId && !spec.opener)
        .map((spec) => [spec.caseWord!, safeBoundSteps(spec.sequenceId!)])
    )
  );

  $effect(() => {
    let cancelled = false;
    for (const spec of pedestalSpecs) {
      if (!spec.sequenceId || !spec.caseWord) continue;
      const settings = performerSettings[spec.caseWord];
      if (!settings) continue;
      const { propType, reversed, handsSwapped } = settings;
      const sequenceId = spec.sequenceId;
      const caseWord = spec.caseWord;
      void effectiveSteps(sequenceId, settings)
        .then((steps) => {
          if (cancelled) return;
          if (!spec.opener) caseSteps[caseWord] = steps;
          pedestalFaces[spec.id] = faceUriFor(sequenceId, propType, spec.opener, steps);
        })
        .catch((error) => console.error("[pedestal]", error));
      void reversed;
      void handsSwapped;
    }
    return () => {
      cancelled = true;
    };
  });

  const pedestals = $derived(
    pedestalSpecs.map((spec) => {
      const settings = spec.caseWord ? performerSettings[spec.caseWord] : undefined;
      return {
        id: spec.id,
        position: spec.position,
        height: spec.height,
        diameter: spec.diameter,
        faceUri: settings && !settings.traceVisible ? null : pedestalFaces[spec.id],
        animated: spec.opener,
      };
    })
  );

  const consoleSpecs = fixtures
    .filter((fixture) => fixture.kind === "case-console")
    .map((fixture) => {
      const sequenceId = fixture.sequenceId!;
      const hybrid = isHybrid(safeBoundSteps(sequenceId));
      const showcase = fixtures.find(
        (other) => other.kind === "case-showcase" && other.caseWord === fixture.caseWord
      )!;
      return {
        id: fixture.id,
        caseWord: fixture.caseWord!,
        position: [fixture.centre.x, fixture.baseY, fixture.centre.z] as [
          number,
          number,
          number,
        ],
        height: fixture.height,
        footprint: fixture.size,
        verbs: verbsFor(hybrid),
        keyLight: [
          showcase.centre.x,
          showcase.baseY + showcase.height + 0.9,
          showcase.centre.z + 1.5,
        ] as [number, number, number],
      };
    });

  const consoles = $derived(
    consoleSpecs.map((spec) => {
      const settings = performerSettings[spec.caseWord];
      const distance = Math.hypot(
        spec.position[0] - playerPosition.x,
        spec.position[2] - playerPosition.z
      );
      const awake = Math.min(
        1,
        Math.max(0, (CONSOLE_WAKE_M - distance) / (CONSOLE_WAKE_M - CONSOLE_FULL_M))
      );
      const engaged: Record<string, boolean> = settings
        ? {
            trace: !settings.traceVisible,
            prop: settings.propType.toLowerCase() !== PEDESTAL_PROP,
            reverse: settings.reversed,
            "swap-hands": settings.handsSwapped,
          }
        : {};
      return {
        ...spec,
        awake,
        engaged,
        modified: settings ? isModified(settings, PEDESTAL_PROP) : false,
      };
    })
  );

  // ── The performers ────────────────────────────────────────────────────────
  function scenePropType(word: string): PropType {
    return word.toLowerCase() === "fan" ? PropType.FAN : PropType.STAFF;
  }

  const performerSpecs = fixtures
    .filter((fixture) => fixture.kind === "case-showcase")
    .flatMap((fixture) => {
      const caseWord = fixture.caseWord!;
      const pedestal = pedestalSpecs.find(
        (spec) => spec.caseWord === caseWord && !spec.opener
      );
      if (!pedestal?.sequenceId) return [];
      return [
        {
          id: `cave-water-${caseWord.toLowerCase()}`,
          caseWord,
          sequenceId: pedestal.sequenceId,
          worldX: fixture.centre.x,
          worldY: fixture.baseY,
          worldZ: fixture.centre.z,
          facing: fixture.facing,
        },
      ];
    });

  /** Generous: these three ARE the room. */
  const PERFORMER_ACTIVE_M = 30;

  // The sequence object is built apart from the distance gate on purpose. The
  // station reloads (and restarts) its performer on every NEW sequence object,
  // so building it inside the same derived as `active` — which reads the
  // player's position — handed the rig a fresh object on every step the visitor
  // took and the figure never got past its first beat.
  const performerSequences = $derived(
    Object.fromEntries(
      performerSpecs.map((spec) => {
        const settings = performerSettings[spec.caseWord];
        const steps = caseSteps[spec.caseWord] ?? [];
        const propType = scenePropType(settings?.propType ?? PEDESTAL_PROP);
        return [
          spec.caseWord,
          createSequenceData({
            id: `drowned-gallery-${spec.caseWord}`,
            name: spec.caseWord,
            word: spec.caseWord,
            steps,
            isCircular: true,
            intendedProp: {
              leftPropType: propType,
              rightPropType: propType,
              catDogMode: false,
            },
          }) satisfies SequenceData,
        ];
      })
    ) as Record<string, SequenceData>
  );

  const performers = $derived(
    performerSpecs.map((spec) => {
      const distance = Math.hypot(
        spec.worldX - playerPosition.x,
        spec.worldZ - playerPosition.z
      );
      return {
        ...spec,
        active: visible && distance < PERFORMER_ACTIVE_M,
        sequenceData: performerSequences[spec.caseWord]!,
      };
    })
  );

  // ── Pressing a console ────────────────────────────────────────────────────
  const threlte = useThrelte();
  const aimOrigin = new Vector3();
  const aimDirection = new Vector3();

  function controlWorldPoint(
    spec: (typeof consoleSpecs)[number],
    lx: number,
    ly: number,
    lz: number
  ): { x: number; y: number; z: number } {
    const angle = CONSOLE_FACE_TILT - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const faceY = consoleFaceY(spec.height, spec.footprint);
    return {
      x: spec.position[0] + lx,
      y: spec.position[1] + faceY + (ly * cos - lz * sin),
      z: spec.position[2] + (ly * sin + lz * cos),
    };
  }

  interface ConsoleTarget {
    caseWord: string;
    verb: ConsoleVerb | "restore";
    point: { x: number; y: number; z: number };
  }

  const consoleTargets: ConsoleTarget[] = consoleSpecs.flatMap((spec) => {
    const { w: faceW, h: faceH } = consoleFaceSize(spec.footprint);
    const buttonY = consoleRowY(CONSOLE_FACE.buttonV, faceH);
    const restoreY = consoleRowY(CONSOLE_FACE.restoreBarV, faceH);
    const buttons = spec.verbs.map((verb, index) => ({
      caseWord: spec.caseWord,
      verb,
      point: controlWorldPoint(
        spec,
        consoleColumnX(index, spec.verbs.length, faceW),
        buttonY,
        0.045
      ),
    }));
    return [
      ...buttons,
      {
        caseWord: spec.caseWord,
        verb: "restore" as const,
        point: controlWorldPoint(spec, 0, restoreY, 0.035),
      },
    ];
  });

  const AIM_RADIUS = CONSOLE_BUTTON_D * 1.1;
  const REACH_M = 1.9;

  function aimedControl(): ConsoleTarget | null {
    const camera = threlte.camera.current;
    if (!camera) return null;
    camera.getWorldPosition(aimOrigin);
    camera.getWorldDirection(aimDirection);
    let best: ConsoleTarget | null = null;
    let bestOffset = Infinity;
    for (const target of consoleTargets) {
      const dx = target.point.x - aimOrigin.x;
      const dy = target.point.y - aimOrigin.y;
      const dz = target.point.z - aimOrigin.z;
      const along = dx * aimDirection.x + dy * aimDirection.y + dz * aimDirection.z;
      if (along <= 0.15 || along > REACH_M) continue;
      const offset = Math.hypot(
        dx - aimDirection.x * along,
        dy - aimDirection.y * along,
        dz - aimDirection.z * along
      );
      if (offset > AIM_RADIUS || offset >= bestOffset) continue;
      bestOffset = offset;
      best = target;
    }
    return best;
  }

  function pressAimedControl(): boolean {
    const target = aimedControl();
    if (!target) return false;
    const current = performerSettings[target.caseWord];
    if (!current) return false;
    performerSettings[target.caseWord] =
      target.verb === "restore"
        ? defaultSettings(PEDESTAL_PROP)
        : applyVerb(current, target.verb);
    return true;
  }

  onMount(() => {
    const onPress = (event: KeyboardEvent) => {
      if (event.key !== "e" && event.key !== "E") return;
      if (!visible || !lit) return;
      if (pressAimedControl()) event.preventDefault();
    };
    window.addEventListener("keydown", onPress);
    return () => window.removeEventListener("keydown", onPress);
  });

  // ── Runtime lights (the pooled point lights, same plan as the graybox) ───
  const WATER_ROUTE = new Set([APPROACH_ROOM_ID, GALLERY_ROOM_ID, GROTTO_ROOM_ID]);
  const lit = $derived(
    visible && currentRoomId !== null && WATER_ROUTE.has(currentRoomId)
  );

  const fixtureLights = layout
    ? [
        {
          x: cx(layout.approach),
          y: WATERLINE_Y + 1.2,
          z: layout.approach.minZ + 1,
          color: "#4a8aa8",
          intensity: 6,
          distance: 14,
        },
        {
          x: cx(layout.descentStair),
          y: WATERLINE_Y + 0.6,
          z: layout.descentStair.minZ + 1,
          color: "#4a8aa8",
          intensity: 5,
          distance: 12,
        },
        {
          x: cx(layout.northRun),
          y: GALLERY_ROOF_Y - 0.5,
          z: layout.westRun.minZ,
          color: "#5fbfd8",
          intensity: 6,
          distance: 16,
        },
        {
          x: cx(layout.northRun),
          y: GALLERY_ROOF_Y - 0.5,
          z: layout.eastBend.maxZ,
          color: "#5fbfd8",
          intensity: 6,
          distance: 16,
        },
        {
          x: layout.bloomAnchor.x,
          y: GALLERY_FLOOR_Y + 1.2,
          z: layout.bloomAnchor.z,
          color: CAVE_GLOW,
          intensity: 8,
          distance: 18,
        },
        {
          x: cx(layout.surfacingUpper),
          y: CAUSEWAY_Y + 1.6,
          z: layout.surfacingUpper.minZ + 1,
          color: FIRELIGHT,
          intensity: 10,
          distance: 22,
        },
        {
          x: cx(layout.apron),
          y: CAUSEWAY_Y + 4.5,
          z: cz(layout.apron),
          color: "#6f93a6",
          intensity: 8,
          distance: 34,
        },
        {
          x: cx(layout.waterfall),
          y: CAUSEWAY_Y + 2.2,
          z: cz(layout.waterfall),
          color: "#bfe9ff",
          intensity: 6,
          distance: 16,
        },
        ...layout.alcoves.map((anchor) => ({
          x: anchor.x,
          y: SHELF_Y + 2.0,
          z: layout.shore.minZ + 1.6,
          color: FIRELIGHT,
          intensity: 12,
          distance: 20,
        })),
      ]
    : [];

  // The key-light lift on the performer each console owns rises with the
  // visitor's approach. It travels through the pooled plan so the renderer keeps
  // its three fixed PointLights; a per-station light would grow the shader
  // signature with every console that woke up.
  const lightPlan = $derived([
    ...fixtureLights,
    ...consoles
      .filter((station) => station.awake > 0)
      .map((station) => ({
        x: station.keyLight[0],
        y: station.keyLight[1],
        z: station.keyLight[2],
        color: "#ffe2c0",
        intensity: station.awake * 9,
        distance: 8,
      })),
  ]);

  $effect(() => {
    if (!layout || !onLightPlanChange) return;
    onLightPlanChange("drowned-gallery", {
      roomIds: [...WATER_ROUTE],
      lights: lightPlan,
    });
    return () => onLightPlanChange("drowned-gallery", null);
  });
</script>

{#if layout}
  <T.Group {visible}>
    <!-- The lightmap rides the emissive channel. It was baked for Cycles at AgX
         exposure 0.4; under the museum's ACES 1.1 it needs this much lift to read
         as the same room. -->
    <GltfAsset url={SHELL_URL} position={origin} onReady={tuneShellMaterials} />

    {#each grottoWater as entry (entry.id)}
      <ReflectivePool
        width={entry.width}
        depth={entry.depth}
        position={entry.position}
        deepColor="#04141b"
        shallowColor="#0f3a45"
        reflectionTint={0xb9d2d6}
        shoreFade={1.1}
        rippleScale={1.25}
        rippleStrength={0.09}
        foamWidth={0.2}
        flowSpeed={0.8}
        waveAmplitudeStart={entry.isChannel ? 0 : 1}
        waveAmplitudeEnd={1}
      />
    {/each}

    {#each waterlinePlanes as plane (plane.id)}
      <T.Mesh
        geometry={unitBox}
        material={waterSurface}
        position={plane.position}
        scale={plane.scale}
      />
    {/each}
    {#each waterVolumes as volume (volume.id)}
      <T.Mesh
        geometry={unitBox}
        material={waterVolume}
        position={volume.position}
        scale={volume.scale}
      />
    {/each}
    {#if waterfallSheet}
      <T.Mesh
        geometry={unitBox}
        material={waterfall}
        position={waterfallSheet.position}
        scale={waterfallSheet.scale}
      />
    {/if}

    {#each massing as block (block.id)}
      <T.Mesh
        geometry={unitBox}
        material={stone}
        position={block.position}
        scale={block.scale}
        rotation={block.rotation}
      />
    {/each}

    {#each pedestals as pedestal (pedestal.id)}
      <PedestalMesh
        position={pedestal.position}
        height={pedestal.height}
        diameter={pedestal.diameter}
        faceUri={pedestal.faceUri}
        tint={WATER_TINT}
        animated={pedestal.animated && lit}
      />
    {/each}

    {#each performers as performer (performer.id)}
      <MuseumPerformerStation3D
        stationId={performer.id}
        worldX={performer.worldX}
        worldY={performer.worldY}
        worldZ={performer.worldZ}
        facingAngle={performer.facing}
        sequenceData={performer.sequenceData}
        autoPlay={true}
        active={performer.active}
        showGrid={false}
        showPlatform={false}
        standingSurfaceHeight={0}
      />
    {/each}

    {#each consoles as station (station.id)}
      <ConsoleMesh
        position={station.position}
        height={station.height}
        footprint={station.footprint}
        verbs={station.verbs}
        engaged={station.engaged}
        awake={station.awake}
        modified={station.modified}
        tint={WATER_TINT}
      />
    {/each}
  </T.Group>
{/if}
