<script lang="ts">
  /**
   * Graybox shell for the Sundial — the Vulcan Cave sun bay.
   *
   * EVERY radius, elevation and blocked region below comes off
   * buildSundialLayout(grid). There is not one world coordinate in this file.
   * If a shape here disagrees with where physics puts the player, the layout is
   * wrong, not this file.
   *
   * The room's mechanism is the light. One directional sun is recomputed from
   * the visitor's own position every frame: their bearing from the chamber
   * centre is its azimuth and their distance from the centre is its elevation,
   * so the sun sits at their back and every shadow in the room — the four
   * performers' and their own — runs parallel with theirs. Walking inward walks
   * the day to noon.
   *
   * The visitor's own capsule is on layer 1: the light renders it into the
   * shadow map, the first-person camera never sees it. Without that shadow the
   * mechanism has no way to explain itself.
   */
  import { T, useThrelte, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    BoxGeometry,
    CapsuleGeometry,
    CircleGeometry,
    CylinderGeometry,
    DirectionalLight,
    DoubleSide,
    MeshStandardMaterial,
    RingGeometry,
  } from "three";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import {
    buildSundialLayout,
    type SundialLayout,
    CROSSING_HALF_WIDTH,
    CROSSING_INNER_R,
    CROSSING_OUTER_R,
    CROSSING_SWEEP,
    EYE_RADIUS_M,
    EYE_TOP_Y,
    SUN_CEILING_Y,
    SUN_SUMMIT_Y,
    SUN_MEDALLION_RADIUS_M,
    SUN_RIM_Y,
    SUN_RING_FLOOR_Y,
    SUN_ROOM_ID,
    AIR_ROOM_ID_FOR_SUN,
  } from "../../data/sundial-layout";
  import type { WorldRect } from "../../data/drowned-gallery-terrain";
  import { castSundialPerformerShadows } from "../../services/sundial-performer-shadows.js";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; the sun idles when they are elsewhere. */
    currentRoomId?: string | null;
    /** Where the visitor is. This IS the sun's position control. */
    playerPosition?: { x: number; y: number; z: number };
    visible?: boolean;
  }
  const {
    grid,
    currentRoomId = null,
    playerPosition = { x: 0, y: 0, z: 0 },
    visible = true,
  }: Props = $props();

  // Graybox values, not final art. The RING floor is the pale one, and that is
  // not a taste call: the performers stand at r=6.5, so at zenith their prop
  // paths drop straight down onto the ring between r=4 and r=9. That ring is
  // the sheet the noon notation is drawn on, and notation needs paper. Now
  // that the room climbs, the visitor reads it from the summit ten metres
  // above — looking down at the drawing rather than across at its edge.
  const STONE = "#5c5348";
  const RIM = "#6e6455";
  const DISC = "#7a7160";
  const RING_FLOOR = "#c9bfa8";
  const PILLAR = "#7d7263";
  const CROSSING = "#8a7f6c";
  const SUN_COLOUR = "#ffe6bd";

  const SLAB_T = 0.3;
  /** Player position is feet + STANDING_Y; the plinth top tracks the feet. */
  const STANDING_Y = 0.85;
  /** Layer the visitor's shadow proxy lives on — cast, never seen. */
  const SHADOW_ONLY_LAYER = 1;

  const unitBox = new BoxGeometry(1, 1, 1);

  const materials = {
    rock: new MeshStandardMaterial({ color: STONE, roughness: 1 }),
    rim: new MeshStandardMaterial({
      color: RIM,
      roughness: 0.95,
      side: DoubleSide,
    }),
    disc: new MeshStandardMaterial({
      color: DISC,
      roughness: 0.85,
      side: DoubleSide,
    }),
    ringFloor: new MeshStandardMaterial({
      color: RING_FLOOR,
      roughness: 0.9,
      side: DoubleSide,
    }),
    collapse: new MeshStandardMaterial({
      color: STONE,
      roughness: 1,
      side: DoubleSide,
    }),
    crossing: new MeshStandardMaterial({ color: CROSSING, roughness: 0.95 }),
    pillar: new MeshStandardMaterial({ color: PILLAR, roughness: 0.9 }),
    shadowProxy: new MeshStandardMaterial({ color: "#ffffff" }),
  } as const;

  type MaterialKey = keyof typeof materials;

  // Polar geometry, built once from the layout's radii.
  const geo = {
    rimRing: new RingGeometry(CROSSING_OUTER_R, 12, 96, 1),
    ringFloor: new RingGeometry(CROSSING_INNER_R, CROSSING_OUTER_R, 96, 1),
    disc: new CircleGeometry(CROSSING_INNER_R, 96),
    /** Vertical skirts at the two collapse edges. */
    innerSkirt: new CylinderGeometry(
      CROSSING_INNER_R,
      CROSSING_INNER_R,
      1,
      96,
      1,
      true
    ),
    outerSkirt: new CylinderGeometry(
      CROSSING_OUTER_R,
      CROSSING_OUTER_R,
      1,
      96,
      1,
      true
    ),
    pillar: new CylinderGeometry(1, 1, 1, 24),
    eye: new CylinderGeometry(EYE_RADIUS_M, EYE_RADIUS_M, 1, 32),
    medallionHalf: new CylinderGeometry(
      SUN_MEDALLION_RADIUS_M,
      SUN_MEDALLION_RADIUS_M,
      0.5,
      48,
      1,
      false,
      0,
      Math.PI
    ),
    visitor: new CapsuleGeometry(0.32, 1.0, 6, 12),
  };

  onDestroy(() => {
    unitBox.dispose();
    for (const g of Object.values(geo)) g.dispose();
    for (const m of Object.values(materials)) m.dispose();
  });

  // ── Box helpers (the rectangular remainder: walls, approaches, corridor) ──
  interface Box {
    id: string;
    pos: [number, number, number];
    size: [number, number, number];
    material: MaterialKey;
  }

  const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
  const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;
  const sx = (r: WorldRect) => r.maxX - r.minX;
  const sz = (r: WorldRect) => r.maxZ - r.minZ;

  function slab(
    id: string,
    r: WorldRect,
    topY: number,
    material: MaterialKey
  ): Box {
    return {
      id,
      pos: [cx(r), topY - SLAB_T / 2, cz(r)],
      size: [sx(r), SLAB_T, sz(r)],
      material,
    };
  }

  function block(
    id: string,
    r: WorldRect,
    baseY: number,
    topY: number,
    material: MaterialKey
  ): Box {
    return {
      id,
      pos: [cx(r), (baseY + topY) / 2, cz(r)],
      size: [
        Math.max(sx(r), 0.01),
        Math.max(topY - baseY, 0.01),
        Math.max(sz(r), 0.01),
      ],
      material,
    };
  }

  interface Arc {
    id: string;
    thetaStart: number;
    thetaLength: number;
  }

  interface CrossingSegment {
    id: string;
    pos: [number, number, number];
    size: [number, number, number];
    rotY: number;
  }

  interface Scene {
    boxes: Box[];
    wallArcs: Arc[];
    crossing: CrossingSegment[];
  }

  /**
   * The chamber wall, minus the two door approaches. Three.js cylinder theta
   * shares this room's bearing convention exactly — `x = r·sin θ, z = r·cos θ`
   * — so a bearing can be handed to `thetaStart` untranslated.
   */
  function wallArcs(gaps: { centre: number; half: number }[]): Arc[] {
    const norm = (a: number) =>
      ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const sorted = gaps
      .map((g) => ({
        from: norm(g.centre - g.half),
        to: norm(g.centre + g.half),
      }))
      .sort((a, b) => a.from - b.from);
    const arcs: Arc[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const start = sorted[i]!.to;
      const end = sorted[(i + 1) % sorted.length]!.from;
      let length = end - start;
      if (length <= 0) length += Math.PI * 2;
      if (length > 0.02) {
        arcs.push({
          id: `sun-wall-arc-${i}`,
          thetaStart: start,
          thetaLength: length,
        });
      }
    }
    return arcs;
  }

  /**
   * The spiral, drawn from the SAME equation `onCrossing` tests against:
   * r(t) = 9 − 5t, θ(t) = θ0 + (π/2)·t. Sampled into short tangential slabs, so
   * what the visitor walks on and what the predicate lets them walk on are the
   * same curve by construction.
   */
  function crossingSegments(layout: SundialLayout): CrossingSegment[] {
    const STEPS = 40;
    const theta0 = layout.crossingStartTheta;
    const point = (t: number) => {
      const r = CROSSING_OUTER_R - (CROSSING_OUTER_R - CROSSING_INNER_R) * t;
      const theta = theta0 + CROSSING_SWEEP * t;
      return {
        x: layout.centre.x + Math.sin(theta) * r,
        z: layout.centre.z + Math.cos(theta) * r,
        y: SUN_RIM_Y + (SUN_SUMMIT_Y - SUN_RIM_Y) * t,
      };
    };
    const segments: CrossingSegment[] = [];
    for (let i = 0; i < STEPS; i++) {
      const a = point(i / STEPS);
      const b = point((i + 1) / STEPS);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      // Each tread is a block reaching DOWN from its own walking surface to the
      // one below it, not a thin slab: the helix climbs 6.4 m over 40 steps, so
      // thin slabs would leave the risers as gaps and the stair would read as a
      // ladder of floating tiles. The block's depth is the step's rise plus the
      // tread thickness, which closes the riser and gives the flight a mass.
      const rise = Math.max(b.y - a.y, 0);
      const depth = rise + SLAB_T;
      segments.push({
        id: `sun-crossing-${i}`,
        // Sit the tread's TOP at this step's walking height, so what the eye
        // sees and what elevationAt reports are the same surface.
        pos: [(a.x + b.x) / 2, b.y - depth / 2, (a.z + b.z) / 2],
        // Overlap along the run so the flight reads as one stair, not beads.
        size: [CROSSING_HALF_WIDTH * 2, depth, length * 1.25],
        rotY: Math.atan2(dx, dz),
      });
    }
    return segments;
  }

  function buildScene(layout: SundialLayout): Scene {
    const boxes: Box[] = [];

    // ══ The rectangular remainder: door approaches and the Air corridor ══
    for (const floor of layout.floorRects) {
      const isRamp = floor.kind !== "flat";
      const top = Math.max(floor.fromY, floor.toY);
      boxes.push(
        slab(floor.id, floor.rect, isRamp ? top : floor.fromY, "rock")
      );
    }
    // The crack floor: everything north of the chamber, at rim level, so the
    // approach is a walk through a lit slot rather than a plank over a void.
    boxes.push(
      slab(
        "sun-crack-floor",
        {
          minX: layout.interior.minX,
          maxX: layout.interior.maxX,
          minZ: layout.interior.minZ,
          maxZ: layout.centre.z - layout.chamberRadius,
        },
        SUN_RIM_Y,
        "rock"
      )
    );
    // The corners the round chamber leaves over: solid rock to the ceiling, so
    // the blocked region and the visible region are the same shape.
    const cornerZ = layout.centre.z - layout.chamberRadius;
    for (const [id, rect] of [
      [
        "sun-corner-west",
        {
          minX: layout.interior.minX,
          maxX: layout.centre.x - layout.chamberRadius,
          minZ: cornerZ,
          maxZ: layout.interior.maxZ,
        },
      ],
      [
        "sun-corner-east",
        {
          minX: layout.centre.x + layout.chamberRadius,
          maxX: layout.interior.maxX,
          minZ: cornerZ,
          maxZ: layout.interior.maxZ,
        },
      ],
    ] as [string, WorldRect][]) {
      boxes.push(block(id, rect, SUN_RING_FLOOR_Y, SUN_CEILING_Y, "rock"));
    }

    for (const wall of layout.wallRects) {
      boxes.push(block(wall.id, wall.rect, wall.baseY, wall.topY, "rock"));
    }
    for (const ceiling of layout.ceilingRects) {
      boxes.push(slab(ceiling.id, ceiling.rect, ceiling.y + SLAB_T, "rock"));
    }

    // ══ The chamber wall, with a gap at each real door approach ══
    const bearing = (x: number, z: number) =>
      Math.atan2(x - layout.centre.x, z - layout.centre.z);
    const north = layout.probes.entry;
    const exit = layout.probes.exit;
    const arcs = wallArcs([
      { centre: bearing(north.x, north.z), half: 0.3 },
      { centre: bearing(exit.x, exit.z), half: 0.3 },
    ]);

    return { boxes, wallArcs: arcs, crossing: crossingSegments(layout) };
  }

  const layout = $derived(buildSundialLayout(grid));
  const scene = $derived(layout ? buildScene(layout) : null);

  const SUN_ROUTE = new Set([SUN_ROOM_ID, AIR_ROOM_ID_FOR_SUN]);
  const lit = $derived(
    visible && currentRoomId !== null && SUN_ROUTE.has(currentRoomId)
  );

  // ── The sun ───────────────────────────────────────────────────────────────
  //
  // A DirectionalLight is a direction, not a point, so it is positioned far
  // enough out to read as one and re-aimed at the chamber centre every frame.
  // Its shadow camera is fitted to the chamber, not the bay: a shadow map
  // stretched over the corridor and the crack would spend most of its
  // resolution on rock nobody looks at.
  const SUN_DISTANCE = 40;
  const sun = new DirectionalLight(SUN_COLOUR, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  // Tuned against the RIM frame — 8° raking light across 24 m — because noon
  // looks clean long before dawn does.
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  // The visitor's capsule lives on layer 1 so the camera cannot see it; the
  // light has to be told to look there or the visitor casts no shadow at all.
  sun.layers.enable(SHADOW_ONLY_LAYER);
  // The ortho frustum is set above, after construction — three.js will not
  // recompute the projection matrix on its own, and a stale -5..5 box shadows
  // only a 10 m sliver of a 24 m chamber.
  sun.shadow.camera.updateProjectionMatrix();
  onDestroy(() => sun.dispose());

  /** Bearing is undefined at dead centre; hold the last one rather than snap. */
  let lastTheta = 0;

  function aimSun(current: SundialLayout) {
    const dx = playerPosition.x - current.centre.x;
    const dz = playerPosition.z - current.centre.z;
    const r = Math.hypot(dx, dz);
    if (r > 0.01) lastTheta = Math.atan2(dx, dz);
    const elevation =
      (current.sunElevationDeg(playerPosition.x, playerPosition.z) * Math.PI) /
      180;
    const cosE = Math.cos(elevation);
    sun.position.set(
      current.centre.x + Math.sin(lastTheta) * cosE * SUN_DISTANCE,
      Math.sin(elevation) * SUN_DISTANCE,
      current.centre.z + Math.cos(lastTheta) * cosE * SUN_DISTANCE
    );
    sun.target.position.set(current.centre.x, 0, current.centre.z);
    sun.target.updateMatrixWorld();
  }

  $effect(() => {
    if (!layout) return;
    // Reading playerPosition here is what makes the sun follow the visitor.
    void playerPosition.x;
    void playerPosition.z;
    aimSun(layout);
    sun.intensity = lit ? 3.2 : 0;
  });

  // ── The eye ───────────────────────────────────────────────────────────────
  // The plinth's top face tracks the visitor's feet, so it reads as the ground
  // carrying them rather than a platform they happen to be standing on.
  const eyeTopY = $derived(
    layout &&
      Math.hypot(
        playerPosition.x - layout.centre.x,
        playerPosition.z - layout.centre.z
      ) <= EYE_RADIUS_M
      ? Math.max(SUN_SUMMIT_Y, playerPosition.y - STANDING_Y)
      : SUN_SUMMIT_Y
  );
  /** The plinth's underside — a little below the summit so it always reads. */
  const eyeBaseY = SUN_SUMMIT_Y - 0.4;
  /** 0 on the ground, 1 at the hatch. Drives how far the iris has opened. */
  const rideProgress = $derived(
    Math.min(
      1,
      Math.max(0, (eyeTopY - SUN_SUMMIT_Y) / (EYE_TOP_Y - SUN_SUMMIT_Y))
    )
  );
  /**
   * The hatch must finish opening BEFORE the plinth arrives, or the moment
   * reads as a collision rather than a door — so it is fully open at 60% of
   * the ride.
   */
  const irisOpen = $derived(Math.min(1, rideProgress / 0.6));

  // ── Performer shadows ─────────────────────────────────────────────────────
  //
  // The four rigs come from @austencloud/scene-3d and mount asynchronously with
  // castShadow off, which would leave this room's whole thesis — a pictograph
  // is a shadow — with nothing to draw. Rather than fork the package, the
  // station groups are found by name and flagged. Cheap, and it stops as soon
  // as all four are done.
  const { scene: threeScene } = useThrelte();
  let shadowSweepsLeft = $state(240);

  useTask(() => {
    if (!lit || shadowSweepsLeft <= 0) return;
    shadowSweepsLeft -= 1;
    const flagged = castSundialPerformerShadows(threeScene);
    // All four stations found and flagged: stop sweeping.
    if (flagged >= 4) shadowSweepsLeft = 0;
  });
</script>

{#if scene && layout}
  <T.Group {visible}>
    <!-- Walls, approaches, corridor, crack floor, corners -->
    {#each scene.boxes as box (box.id)}
      <T.Mesh
        geometry={unitBox}
        material={materials[box.material]}
        position={box.pos}
        scale={box.size}
        castShadow={false}
        receiveShadow
      />
    {/each}

    <!-- The rim walk: r 9..12, where the day starts at ~8° -->
    <T.Mesh
      geometry={geo.rimRing}
      material={materials.rim}
      position={[layout.centre.x, SUN_RIM_Y, layout.centre.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    />

    <!-- The collapse: seen, never walked -->
    <T.Mesh
      geometry={geo.ringFloor}
      material={materials.ringFloor}
      position={[layout.centre.x, SUN_RING_FLOOR_Y, layout.centre.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    />
    <T.Mesh
      geometry={geo.outerSkirt}
      material={materials.collapse}
      position={[
        layout.centre.x,
        (SUN_RING_FLOOR_Y + SUN_RIM_Y) / 2,
        layout.centre.z,
      ]}
      scale={[1, SUN_RIM_Y - SUN_RING_FLOOR_Y, 1]}
    />
    <T.Mesh
      geometry={geo.innerSkirt}
      material={materials.collapse}
      position={[
        layout.centre.x,
        (SUN_RING_FLOOR_Y + SUN_SUMMIT_Y) / 2,
        layout.centre.z,
      ]}
      scale={[1, SUN_SUMMIT_Y - SUN_RING_FLOOR_Y, 1]}
    />

    <!-- The centre disc: noon, and the sheet the shadows are drawn on -->
    <T.Mesh
      geometry={geo.disc}
      material={materials.disc}
      position={[layout.centre.x, SUN_SUMMIT_Y, layout.centre.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    />

    <!-- The spiral crossing: the only route in, sweeping exactly 90° -->
    {#each scene.crossing as segment (segment.id)}
      <T.Mesh
        geometry={unitBox}
        material={materials.crossing}
        position={segment.pos}
        scale={segment.size}
        rotation.y={segment.rotY}
        receiveShadow
      />
    {/each}

    <!-- The four Quarter-Same pillars, rising out of the collapse -->
    {#each layout.pillars as pillar (pillar.id)}
      <T.Mesh
        geometry={geo.pillar}
        material={materials.pillar}
        position={[
          pillar.centre.x,
          (SUN_RING_FLOOR_Y + pillar.topY) / 2,
          pillar.centre.z,
        ]}
        scale={[pillar.radius, pillar.topY - SUN_RING_FLOOR_Y, pillar.radius]}
        castShadow
        receiveShadow
      />
    {/each}

    <!-- Chamber wall, gapped at each real door approach.
         castShadow is OFF, and that is load-bearing: the roof over this chamber
         has collapsed, so the light arrives from above through the opening and
         the wall is the horizon, not a lid. Left casting, an 11 m wall standing
         between a 40 m-out directional light and the room put the WHOLE chamber
         in shadow — the first frame of this room had no shadows in it at all,
         only hemisphere fill, and every other symptom followed from that. -->
    {#each scene.wallArcs as arc (arc.id)}
      <T.Mesh
        material={materials.rock}
        position={[
          layout.centre.x,
          (SUN_RING_FLOOR_Y + SUN_CEILING_Y) / 2,
          layout.centre.z,
        ]}
        castShadow={false}
        receiveShadow
      >
        <T.CylinderGeometry
          args={[
            layout.chamberRadius,
            layout.chamberRadius,
            SUN_CEILING_Y - SUN_RING_FLOOR_Y,
            96,
            1,
            true,
            arc.thetaStart,
            arc.thetaLength,
          ]}
        />
      </T.Mesh>
    {/each}

    <!-- The eye: the ground that carries the visitor out onto the Moon. It
         rises from the SUMMIT, not from the pit floor — the drum below it is
         already solid, and a column drawn from -4 would be ten metres of
         geometry buried inside it. At rest it is a low disc set into the
         summit, so there is something to stand on and recognise. -->
    <T.Mesh
      geometry={geo.eye}
      material={materials.disc}
      position={[layout.centre.x, (eyeBaseY + eyeTopY) / 2, layout.centre.z]}
      scale={[1, Math.max(eyeTopY - eyeBaseY, 0.01), 1]}
      castShadow
      receiveShadow
    />

    <!-- The ceiling medallion, irising open in two halves as the eye rises.
         It does NOT cast: at zenith it sits exactly over the centre disc and
         threw a hard ⌀8 m shadow across the whole noon frame — the visitor
         arrived at noon and stood in the dark, on the one surface the room's
         thesis needs lit. It reads as a boss above the light, not a lid. -->
    {#each [0, 1] as half (half)}
      <T.Mesh
        geometry={geo.medallionHalf}
        material={materials.rock}
        position={[
          layout.centre.x +
            (half === 0 ? -1 : 1) * irisOpen * SUN_MEDALLION_RADIUS_M * 1.05,
          SUN_CEILING_Y - 0.25,
          layout.centre.z,
        ]}
        rotation.y={half === 0 ? 0 : Math.PI}
        castShadow={false}
      />
    {/each}

    <!-- The visitor's own shadow. Layer 1: the light sees it, the camera never
         does. This is not optional — it is how the mechanism explains itself. -->
    <T.Mesh
      geometry={geo.visitor}
      material={materials.shadowProxy}
      position={[playerPosition.x, playerPosition.y - 0.05, playerPosition.z]}
      castShadow
      oncreate={(mesh) => {
        mesh.layers.set(SHADOW_ONLY_LAYER);
      }}
    />

    <!-- The light objects never leave the scene. Three.js compiles their types
         into every lit material, so room changes use intensity only. -->
    <T is={sun} />
    <T is={sun.target} />

    <!-- Enough ambient to keep the shadowed side of a performer readable. The
         room is a drawing in light; a black shadow side hides the drawing. -->
    <T.HemisphereLight
      position={[layout.centre.x, SUN_CEILING_Y, layout.centre.z]}
      intensity={lit ? 0.55 : 0}
      color="#cfd8e8"
      groundColor="#4a3f31"
    />
  </T.Group>
{/if}
