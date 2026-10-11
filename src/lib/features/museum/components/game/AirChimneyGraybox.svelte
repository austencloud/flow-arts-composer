<script lang="ts">
  /**
   * Graybox shell for the Air chimney — the Vulcan Cave air bay.
   *
   * EVERY rect, ledge and light position below comes off
   * buildAirChimneyLayout(grid). There is not one world coordinate in this
   * file. If a shape here disagrees with where physics puts the player, the
   * layout is wrong, not this file.
   *
   * Both columns have to be SEEN, not inferred, and they have to be told apart
   * at a glance: the rise is a cool bright shell with motes climbing it, the
   * sink is dimmer and warmer with its motes falling. A visitor should never
   * have to step into one to learn which way it goes.
   */
  import { T } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    BoxGeometry,
    CylinderGeometry,
    MeshStandardMaterial,
    DoubleSide,
  } from "three";
  import FallingParticles from "#lib/shared/3d/environments/primitives/FallingParticles.svelte";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import type { AuthoredPointLightPlanChange } from "../../services/museum-room-light-pool";
  import {
    buildAirChimneyLayout,
    type AirChimneyLayout,
    AIR_CEILING_Y,
    AIR_FLOOR_Y,
    AIR_ROOM_ID,
    EARTH_ROOM_ID,
    OVERLOOK_Y,
  } from "../../data/air-chimney-layout";
  import type { WorldRect } from "../../data/drowned-gallery-terrain";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; lights idle when they are elsewhere. */
    currentRoomId?: string | null;
    visible?: boolean;
    onLightPlanChange?: AuthoredPointLightPlanChange;
  }
  const {
    grid,
    currentRoomId = null,
    visible = true,
    onLightPlanChange,
  }: Props = $props();

  // Graybox values, not final art.
  const STONE = "#4a515c";
  const STONE_LIT = "#69727f";
  const LEDGE = "#8b95a3";
  const RISE_TINT = "#bfe4ff";
  const SINK_TINT = "#ffd9b0";
  const FILL_LIGHT = "#8fb6d8";

  /** Slab thickness for every floor and ceiling box. */
  const SLAB_T = 0.3;
  /** Ledges are cantilevered shelves, not columns — you walk UNDER them. */
  const LEDGE_BODY_T = 0.9;
  /** How far above the overlook the rise column's shell is drawn. */
  const RISE_VISUAL_TOP = OVERLOOK_Y + 0.4;

  // ── Shared geometry + materials (disposed on destroy) ─────────────────────
  const unitBox = new BoxGeometry(1, 1, 1);
  const unitCylinder = new CylinderGeometry(1, 1, 1, 32, 1, true);

  /** The two columns differ in tint so direction of travel reads instantly. */
  function draftMaterial(color: string) {
    return new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      transparent: true,
      // Barely there on purpose: a column must read as a boundary you can see
      // through, not a solid of light. At 0.14 it filled the whole frame the
      // moment the player stood next to it (verification pass, 2026-08-05).
      opacity: 0.045,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
  }

  const materials = {
    rock: new MeshStandardMaterial({ color: STONE, roughness: 1 }),
    rockLit: new MeshStandardMaterial({ color: STONE_LIT, roughness: 1 }),
    ledge: new MeshStandardMaterial({ color: LEDGE, roughness: 0.9 }),
    rise: draftMaterial(RISE_TINT),
    sink: draftMaterial(SINK_TINT),
  } as const;

  type MaterialKey = keyof typeof materials;

  onDestroy(() => {
    unitBox.dispose();
    unitCylinder.dispose();
    for (const material of Object.values(materials)) material.dispose();
  });

  interface Box {
    id: string;
    pos: [number, number, number];
    size: [number, number, number];
    material: MaterialKey;
  }
  interface Lamp {
    id: string;
    pos: [number, number, number];
    color: string;
    intensity: number;
    distance: number;
  }

  const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
  const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;
  const sx = (r: WorldRect) => r.maxX - r.minX;
  const sz = (r: WorldRect) => r.maxZ - r.minZ;

  /** Flat slab whose TOP surface sits at `topY`. */
  function slab(
    id: string,
    r: WorldRect,
    topY: number,
    material: MaterialKey,
    thickness = SLAB_T
  ): Box {
    return {
      id,
      pos: [cx(r), topY - thickness / 2, cz(r)],
      size: [sx(r), thickness, sz(r)],
      material,
    };
  }

  /** Upright box spanning `baseY`..`topY` over a rect footprint. */
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

  interface Scene {
    boxes: Box[];
    lights: Lamp[];
  }

  function buildScene(layout: AirChimneyLayout): Scene {
    const boxes: Box[] = [];
    const lights: Lamp[] = [];

    const { overlook, ledges, floorRects, wallRects, ceilingRects } = layout;

    // ══ FLOORS ══ one box per layout floor rect, so the visible floor and the
    // walkable floor are the same list.
    for (const floor of floorRects) {
      const raised =
        floor.id === "air-overlook" || floor.id.startsWith("air-ledge");
      boxes.push(
        slab(floor.id, floor.rect, floor.fromY, raised ? "ledge" : "rockLit")
      );
    }

    // ══ MASS ══ the raised surfaces are shelves cut from the wall, so each gets
    // a shallow body under it. Shallow is the point: a body reaching the floor
    // would be a pillar, and the room is meant to be open underneath.
    boxes.push(
      block(
        "overlook-body",
        overlook,
        OVERLOOK_Y - LEDGE_BODY_T,
        OVERLOOK_Y - SLAB_T,
        "rock"
      )
    );
    for (const ledge of ledges) {
      boxes.push(
        block(
          `${ledge.id}-body`,
          ledge.rect,
          ledge.y - LEDGE_BODY_T,
          ledge.y - SLAB_T,
          "rock"
        )
      );
    }

    // ══ WALLS + CEILING ══ door gaps already derived from real door tiles.
    for (const wall of wallRects) {
      boxes.push(block(wall.id, wall.rect, wall.baseY, wall.topY, "rock"));
    }
    for (const ceiling of ceilingRects) {
      boxes.push(slab(ceiling.id, ceiling.rect, ceiling.y + SLAB_T, "rock"));
    }

    // ══ LIGHTS ══
    //
    // These are decay=2 point lights, so illuminance falls as 1/d² and the ONLY
    // sane way to size one is from the distance it actually has to travel:
    //
    //     intensity ≈ target · d²
    //
    // Sizing by "how far should this reach" instead is how the first pass ended
    // up with a 2 m ledge lamp at intensity 85 — twenty times over — and turned
    // the whole chamber into a flat blue wash with no depth in it at all. Cave
    // fog is dark brown at density 0.06, so it was never the fog: it was this.
    //
    // Target illuminance ≈ 1.2, which lands the #69727f rock in mid-tone and
    // leaves headroom for the columns and ledges to read brighter than it.
    const forDistance = (metres: number, target = 1.2) =>
      Math.round(target * metres * metres);

    lights.push(
      // Two high fills rather than one. A single lamp over the middle of the
      // room burns a bright pool into the floor directly under it and leaves the
      // ends dim; splitting it along the room's long axis at half strength each
      // gives an even base tone with no hotspot.
      ...[0.32, 0.68].map((t, i) => ({
        id: `air-room-fill-${i}`,
        pos: [
          cx(layout.shell),
          AIR_CEILING_Y - 2.0,
          layout.shell.minZ + (layout.shell.maxZ - layout.shell.minZ) * t,
        ] as [number, number, number],
        color: FILL_LIGHT,
        intensity: forDistance(11, 0.6),
        distance: 44,
      })),
      {
        id: "air-entry-light",
        pos: [cx(layout.shell), 3.0, layout.shell.minZ + 2.0],
        color: FILL_LIGHT,
        intensity: forDistance(4),
        distance: 18,
      },
      {
        id: "air-exit-light",
        pos: [cx(layout.shell), 3.0, layout.shell.maxZ - 2.5],
        color: SINK_TINT,
        intensity: forDistance(4),
        distance: 18,
      },
      {
        // The two column lamps are deliberately brighter than the rock: the
        // shaft should be the brightest thing in the room from the moment the
        // visitor walks in, because it is the thing to walk into.
        id: "air-rise-foot",
        pos: [layout.riseCentre.x, 2.4, layout.riseCentre.z],
        color: RISE_TINT,
        intensity: forDistance(3.5, 2.0),
        distance: 16,
      },
      {
        id: "air-rise-top",
        pos: [layout.riseCentre.x, OVERLOOK_Y + 1.6, layout.riseCentre.z],
        color: RISE_TINT,
        intensity: forDistance(3.5, 2.0),
        distance: 16,
      },
      {
        id: "air-overlook-light",
        pos: [cx(overlook), OVERLOOK_Y + 2.2, cz(overlook)],
        color: FILL_LIGHT,
        intensity: forDistance(3.0),
        distance: 14,
      },
      {
        id: "air-sink-light",
        pos: [layout.sinkCentre.x, OVERLOOK_Y - 1.0, layout.sinkCentre.z],
        color: SINK_TINT,
        intensity: forDistance(3.5, 1.6),
        distance: 16,
      },
      // One lamp per ledge. It hangs ABOVE AND IN FRONT of the performer, on the
      // shaft side, so the figure is lit from the direction the visitor rises
      // past it. Hung straight overhead at head height instead, it sits inside
      // the mannequin's skull and blows the whole torso to white — which is
      // exactly what the first pass did.
      ...ledges.map((ledge, i) => {
        const towardShaft = ledge.wall === "west" ? 1 : -1;
        return {
          id: `air-ledge-light-${i}`,
          pos: [
            ledge.anchor.x + towardShaft * 1.6,
            ledge.y + 2.6,
            ledge.anchor.z,
          ] as [number, number, number],
          color: FILL_LIGHT,
          // ~2.3 m of slant range to the figure's chest.
          intensity: forDistance(2.3, 1.1),
          distance: 11,
        };
      })
    );

    return { boxes, lights };
  }

  const layout = $derived(buildAirChimneyLayout(grid));
  const scene = $derived(layout ? buildScene(layout) : null);

  const AIR_ROUTE = new Set([AIR_ROOM_ID, EARTH_ROOM_ID]);
  /** Lights and motes idle when the player is nowhere near the bay. */
  const lit = $derived(
    visible && currentRoomId !== null && AIR_ROUTE.has(currentRoomId)
  );

  $effect(() => {
    const currentScene = scene;
    if (!currentScene || !onLightPlanChange) return;
    onLightPlanChange("air-chimney", {
      roomIds: [...AIR_ROUTE],
      lights: currentScene.lights.map((light) => ({
        x: light.pos[0],
        y: light.pos[1],
        z: light.pos[2],
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
      })),
    });
    return () => onLightPlanChange("air-chimney", null);
  });

  const riseHeight = $derived(RISE_VISUAL_TOP - AIR_FLOOR_Y);
  const sinkHeight = $derived(OVERLOOK_Y - AIR_FLOOR_Y);
</script>

{#if scene && layout}
  <T.Group {visible}>
    <!-- Floors, ledges, overlook, rock, walls, ceiling -->
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

    <!-- The rise, made visible: a translucent shell on the exact footprint the
         terrain lifts inside, capped just past the overlook it delivers to. -->
    <T.Mesh
      geometry={unitCylinder}
      material={materials.rise}
      position={[
        layout.riseCentre.x,
        AIR_FLOOR_Y + riseHeight / 2,
        layout.riseCentre.z,
      ]}
      scale={[layout.riseRadius, riseHeight, layout.riseRadius]}
    />

    <!-- The sink: same idea, warmer, and its motes fall. -->
    <T.Mesh
      geometry={unitCylinder}
      material={materials.sink}
      position={[
        layout.sinkCentre.x,
        AIR_FLOOR_Y + sinkHeight / 2,
        layout.sinkCentre.z,
      ]}
      scale={[layout.sinkRadius, sinkHeight, layout.sinkRadius]}
    />

    <!-- Rising motes: the shared particle primitive in its rising mode. -->
    <T.Group
      position={[
        layout.riseCentre.x,
        AIR_FLOOR_Y + riseHeight / 2,
        layout.riseCentre.z,
      ]}
    >
      <FallingParticles
        type="embers"
        count={140}
        area={{
          width: layout.riseRadius * 1.8,
          height: riseHeight,
          depth: layout.riseRadius * 1.8,
        }}
        speed={1.0}
        colors={[RISE_TINT, "#ffffff", "#dff1ff"]}
        sizeRange={[0.018, 0.04]}
        spin={false}
        enabled={lit}
      />
    </T.Group>

    <!-- Falling motes mark the sink: same primitive, its default direction. -->
    <T.Group
      position={[
        layout.sinkCentre.x,
        AIR_FLOOR_Y + sinkHeight / 2,
        layout.sinkCentre.z,
      ]}
    >
      <FallingParticles
        type="dust"
        count={90}
        area={{
          width: layout.sinkRadius * 1.8,
          height: sinkHeight,
          depth: layout.sinkRadius * 1.8,
        }}
        speed={1.2}
        colors={[SINK_TINT, "#ffffff"]}
        sizeRange={[0.018, 0.038]}
        spin={false}
        enabled={lit}
      />
    </T.Group>
  </T.Group>
{/if}
