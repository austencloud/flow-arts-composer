<script lang="ts">
  /**
   * Graybox shell for the Moon — the Vulcan Cave moon bay, and the Sun's
   * inversion.
   *
   * EVERY radius, elevation and blocked region below comes off
   * buildMoonLayout(grid). There is not one world coordinate in this file. If a
   * shape here disagrees with where physics puts the player, the layout is
   * wrong, not this file.
   *
   * Two things carry the room, and both are the Sun's opposite:
   *
   * ONE HARD LIGHT. A single white directional key, fixed — it does not track
   * the visitor, because the Sun room's whole mechanism was a sun the visitor
   * drives and this room is what that mechanism is not. Fill is nearly zero, so
   * shadows go to near-black. That is the physical difference between standing
   * in air and standing in vacuum, and it is what makes the two rooms read as
   * opposites at a glance rather than as the same room in a different colour.
   *
   * A HOLE IN THE FLOOR. The plain is a ShapeGeometry with a real hole punched
   * in it at the arrival, not a disc with a dark decal — so the shaft below is
   * genuinely seen through it, and the Sun's plinth genuinely sits inside it
   * with a gap all the way round. The visitor arrives by coming UP through it.
   *
   * Nothing here spirals. Sun is quarter-time / same-direction and therefore
   * four-fold chiral; Moon is quarter-time / opposite-direction and therefore
   * four-fold MIRRORED. The plan reflects about the arrival axis and holds
   * still.
   */
  import { T } from "@threlte/core";
  import { useKtx2 } from "@threlte/extras";
  import { onDestroy, onMount } from "svelte";
  import {
    RepeatWrapping,
    SRGBColorSpace,
    type Texture,
    BoxGeometry,
    CylinderGeometry,
    DirectionalLight,
    DoubleSide,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Path,
    RingGeometry,
    Shape,
    ShapeGeometry,
    SphereGeometry,
    TorusGeometry,
  } from "three";
  import type { MuseumGrid } from "../../domain/museum-grid-types";
  import {
    buildMoonLayout,
    MOON_CORRIDOR_CEILING_Y,
    MOON_FLOOR_Y,
    MOON_RIM_RIDGE_HALF_WIDTH_M,
    MOON_RIM_RIDGE_TOP_Y,
    MOON_ROOM_ID,
    type MoonLayout,
  } from "../../data/moon-layout";
  import type { WorldRect } from "../../data/drowned-gallery-terrain";
  // The lunar sky, borrowed rather than rebuilt. See the sky block in the
  // markup for why, and for what is deliberately NOT taken from it.
  import Starfield from "#lib/shared/3d/environments/primitives/Starfield.svelte";
  import EarthSphere from "#lib/shared/3d/environments/scenes/cosmic/EarthSphere.svelte";
  import EarthGodRays from "#lib/shared/3d/environments/scenes/cosmic/EarthGodRays.svelte";
  import NebulaLayer from "#lib/shared/3d/environments/scenes/cosmic/NebulaLayer.svelte";
  import MeteorStreaks from "#lib/shared/3d/environments/scenes/cosmic/MeteorStreaks.svelte";
  import { createDefaultCosmicNightConfig } from "#lib/shared/3d/environments/domain/models/scene-configs.js";

  interface Props {
    grid: MuseumGrid;
    /** Room the player is standing in; the key light idles when they are elsewhere. */
    currentRoomId?: string | null;
    visible?: boolean;
  }
  const { grid, currentRoomId = null, visible = true }: Props = $props();

  // Regolith is not grey-blue moonlight — that is what the Moon looks like from
  // Earth, through air. Standing on it, it is a warm-neutral dust, and the only
  // reason it reads as cold is that nothing is scattering the light.
  // Tints, not colours: every one of these multiplies the regolith diffuse map,
  // so they sit near white and let the texture carry the tone. Before the map
  // landed they WERE the colour and were correspondingly darker.
  const REGOLITH = "#d6d1c7";
  const RIM_ROCK = "#8b867e";
  /** The Sun's stone, carried up through the floor. Warmer than anything else here. */
  const SUN_STONE = "#b4a184";
  const MOUND = "#cbc6bc";
  const SHAFT = "#151312";
  const KEY_COLOUR = "#ffffff";

  /** The outer regolith. Read at distance under the same hard key, so it is a
   *  shade down from the chamber floor rather than a different rock. */
  const OUTER_REGOLITH = "#c6c1b8";
  const OUTER_ROCK = "#b0aba2";

  /**
   * The Moon outside the crater. There is no atmosphere to fade a horizon into,
   * so distance here is bought entirely with SIZE: the mare runs to 420 m,
   * which puts the horizon line at the limit of what the eye can resolve
   * rather than at a visible edge. The 90 m dome the room shipped with cut the
   * ground off roughly where the crater rim ended and made the plain read as a
   * set.
   *
   * The mare runs PAST the sky shell on purpose. The shell is a hemisphere, so
   * below its base there is no sky at all — ground that stopped short of it
   * would leave a strip of clear-colour under the horizon. Ground beyond it,
   * sitting a few centimetres proud of its base, hides that edge and puts the
   * horizon where the dust runs out.
   */
  const OUTER_PLAIN_RADIUS = 420;
  const SKY_RADIUS = 400;

  /**
   * The cosmic scene's own night config. Its numbers are taken rather than
   * re-tuned, so this room and the Cosmic background read as the same Moon —
   * same Earth, same starfield density — instead of two authors' guesses at
   * one.
   *
   * ONE value is overridden, and honestly: Earth's position. The cosmic scene
   * hangs it at `[-40, 2, -60]`, which is nearly on its horizon — fine on an
   * open performance platform, invisible here behind a 2.4 m crater rim. It is
   * lifted into the sky so a visitor standing in a walled crater can actually
   * see the thing the room exists to show them. Distance is kept close to the
   * original so its apparent size does not change.
   */
  const cosmicDefaults = createDefaultCosmicNightConfig();
  const cosmic = {
    ...cosmicDefaults,
    earth: {
      ...cosmicDefaults.earth,
      position: [-30, 34, -45] as [number, number, number],
    },
  };
  const meteors = cosmic.particles?.effects?.meteorStreaks;
  /** How far the arrival shaft is drawn down before it goes to black. */
  const SHAFT_DEPTH = 7;
  const SLAB_T = 0.3;

  const unitBox = new BoxGeometry(1, 1, 1);

  const materials = {
    regolith: new MeshStandardMaterial({
      color: REGOLITH,
      roughness: 1,
      side: DoubleSide,
    }),
    rim: new MeshStandardMaterial({ color: RIM_ROCK, roughness: 1 }),
    outerRegolith: new MeshStandardMaterial({
      color: OUTER_REGOLITH,
      roughness: 1,
      side: DoubleSide,
    }),
    outerRock: new MeshStandardMaterial({ color: OUTER_ROCK, roughness: 1 }),
    sunStone: new MeshStandardMaterial({ color: SUN_STONE, roughness: 0.8 }),
    mound: new MeshStandardMaterial({ color: MOUND, roughness: 1 }),
    shaft: new MeshStandardMaterial({
      color: SHAFT,
      roughness: 1,
      side: DoubleSide,
    }),
    // The sky is not lit and must never be — it is the absence of atmosphere.
    sky: new MeshBasicMaterial({ color: "#000000", side: DoubleSide }),
  } as const;

  type MaterialKey = keyof typeof materials;

  /**
   * The regolith surface itself, taken from the Cosmic scene rather than
   * invented here. `cosmic-reliquary.glb`'s terrain wears an authored
   * `AR_LunarRegolith` material — 1024² diffuse, normal and roughness, all
   * KTX2 — and that IS the moon ground Austen means when he points at the 3D
   * scene. The three maps were lifted straight out of the GLB into
   * `static/textures/moon-regolith/`, so this room and that scene are the same
   * dust rather than two people's guesses at grey.
   *
   * The GLB's own terrain is a 68 m patch with the texture stretched across it
   * once. Here it TILES instead, which is what lets the same surface cover 420
   * m without turning to mush underfoot: every consumer picks a tile size in
   * METRES and the repeat is derived from its UV convention, because the
   * geometries disagree about that — ShapeGeometry writes UVs in world units,
   * everything else writes 0..1 across the shape.
   */
  const REGOLITH_MAPS = "/textures/moon-regolith";
  const ktx2 = useKtx2("/basis/");

  interface RegolithSet {
    map: Texture;
    normalMap: Texture;
    roughnessMap: Texture;
  }

  /** Loaded once; every surface gets cheap clones that share these images. */
  let sourceMaps = $state<RegolithSet | null>(null);
  const clones: Texture[] = [];

  function loadMap(file: string, srgb: boolean): Promise<Texture> {
    return new Promise((resolve, reject) => {
      ktx2.load(
        `${REGOLITH_MAPS}/${file}`,
        (tex) => {
          if (srgb) tex.colorSpace = SRGBColorSpace;
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  onMount(async () => {
    try {
      const [map, normalMap, roughnessMap] = await Promise.all([
        loadMap("diffuse.ktx2", true),
        loadMap("normal.ktx2", false),
        loadMap("roughness.ktx2", false),
      ]);
      sourceMaps = { map, normalMap, roughnessMap };
    } catch (error) {
      // The room is fully legible on its flat colours; the texture is the
      // finish, not the geometry. Losing it must not take the Moon down.
      console.warn("[MoonGraybox] lunar regolith maps failed to load", error);
    }
  });

  /** @param repeat Tiles across this surface's own UV space. */
  function dressed(target: MeshStandardMaterial, repeat: number): void {
    if (!sourceMaps) return;
    for (const key of ["map", "normalMap", "roughnessMap"] as const) {
      const tex = sourceMaps[key].clone();
      tex.needsUpdate = true;
      tex.repeat.set(repeat, repeat);
      clones.push(tex);
      target[key] = tex;
    }
    target.needsUpdate = true;
  }

  /**
   * How many metres one tile of regolith covers. Small enough that a visitor
   * standing on the plain sees grain, large enough that the mare is not a moiré
   * pattern at 400 m.
   */
  const TILE_M = 5;

  $effect(() => {
    if (!sourceMaps) return;
    // ShapeGeometry's UVs are the vertex coordinates, so its UV unit is one
    // metre and the repeat is the inverse of the tile size.
    dressed(materials.regolith, 1 / TILE_M);
    // Everything below writes UVs across 0..1, so the repeat is the surface's
    // own span divided by the tile.
    dressed(materials.outerRegolith, (OUTER_PLAIN_RADIUS * 2) / TILE_M);
    dressed(materials.outerRock, 4);
    dressed(materials.rim, 6);
    dressed(materials.mound, 2);
  });

  onDestroy(() => {
    unitBox.dispose();
    for (const m of Object.values(materials)) m.dispose();
    for (const t of clones) t.dispose();
    if (sourceMaps) for (const t of Object.values(sourceMaps)) t.dispose();
  });

  const cx = (r: WorldRect) => (r.minX + r.maxX) / 2;
  const cz = (r: WorldRect) => (r.minZ + r.maxZ) / 2;
  const sx = (r: WorldRect) => r.maxX - r.minX;
  const sz = (r: WorldRect) => r.maxZ - r.minZ;

  interface Box {
    id: string;
    pos: [number, number, number];
    size: [number, number, number];
    material: MaterialKey;
  }

  function slab(
    id: string,
    r: WorldRect,
    topY: number,
    material: MaterialKey
  ): Box {
    return {
      id,
      pos: [cx(r), topY - SLAB_T / 2, cz(r)],
      size: [Math.max(sx(r), 0.01), SLAB_T, Math.max(sz(r), 0.01)],
      material,
    };
  }

  // ── The plain ─────────────────────────────────────────────────────────────
  //
  // A Shape with a Path hole. Not decoration: the hole in the mesh IS the hole
  // in the room, so the shaft is seen through the floor rather than painted on
  // it, and it can never drift out of register with the layout's arrival.
  function plainGeometry(l: MoonLayout): ShapeGeometry {
    const outline = new Shape();
    outline.absarc(0, 0, l.chamberRadius, 0, Math.PI * 2, false);
    const hole = new Path();
    // ShapeGeometry is authored in XY and rotated -90° about X to lie flat,
    // which flips the Z axis — so the hole's local Y is the NEGATED world
    // offset in Z. Getting this backwards puts the hole on the wrong side of
    // the room and nothing else looks wrong.
    hole.absarc(
      l.arrival.x - l.centre.x,
      -(l.arrival.z - l.centre.z),
      l.arrivalHoleRadius,
      0,
      Math.PI * 2,
      true
    );
    outline.holes.push(hole);
    return new ShapeGeometry(outline, 96);
  }

  /**
   * The mare beyond the crater: a field of other craters, thinning as it goes
   * out, plus a scatter of boulders near enough to read as objects. It is what
   * turns a flat disc into somewhere — with nothing on it, 380 m of unbroken
   * regolith looks exactly like 20 m of unbroken regolith.
   *
   * Seeded and deterministic, so the view out of the crater is the same view
   * every time the room is entered. Sizes and spacing come off the same
   * distance-thins-detail rule the key light already implies: near craters are
   * small and sharp, far ones wide and low.
   */
  interface FarCrater {
    id: string;
    /** x, z offsets from the chamber centre. */
    pos: [number, number];
    radius: number;
    height: number;
  }

  interface FarBoulder {
    id: string;
    pos: [number, number];
    size: [number, number, number];
    rot: [number, number, number];
  }

  function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * A distant highland. A sphere sunk into the plain so only its cap shows —
   * the cheapest thing that reads as a rounded, eroded lunar massif, and the
   * only thing in the far field that breaks the horizon line. Without these the
   * mare is a dead-flat table and the eye reads it as a floor no matter how far
   * out it goes.
   */
  interface FarHill {
    id: string;
    pos: [number, number];
    /** Half-width across the plain, and how far the cap stands above it. */
    radius: number;
    rise: number;
  }

  function farField(innerRadius: number): {
    craters: FarCrater[];
    boulders: FarBoulder[];
    hills: FarHill[];
  } {
    const rand = seeded(0x4d4f4f4e); // "MOON"
    const craters: FarCrater[] = [];
    const boulders: FarBoulder[] = [];
    const hills: FarHill[] = [];

    // Craters. A crater is a LIP, not a plateau: wide, and barely off the
    // ground next to its own width. The first pass drew them as short solid
    // cylinders and the horizon came back as a row of mesas.
    //
    // `t` is normalised distance out, and size grows with it, so the field
    // reads as perspective rather than as tiling.
    for (let i = 0; i < 70; i++) {
      const t = Math.pow(rand(), 0.55);
      const dist = innerRadius + 30 + t * (OUTER_PLAIN_RADIUS * 0.7);
      const theta = rand() * Math.PI * 2;
      const radius = (5 + rand() * 11) * (0.6 + t * 2.6);
      craters.push({
        id: `moon-far-crater-${i}`,
        pos: [Math.sin(theta) * dist, Math.cos(theta) * dist],
        radius,
        height: Math.max(0.35, radius * (0.035 + rand() * 0.04)),
      });
    }

    // Boulders, kept close in — past ~120 m a 2 m rock is a pixel and costs a
    // draw call to say nothing. Tilted on all three axes: a rock sitting square
    // to the world reads as a crate.
    for (let i = 0; i < 40; i++) {
      const dist = innerRadius + 8 + Math.pow(rand(), 0.7) * 105;
      const theta = rand() * Math.PI * 2;
      const w = 0.45 + rand() * 1.5;
      boulders.push({
        id: `moon-boulder-${i}`,
        pos: [Math.sin(theta) * dist, Math.cos(theta) * dist],
        size: [w, w * (0.45 + rand() * 0.5), w * (0.7 + rand() * 0.6)],
        rot: [(rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5],
      });
    }

    // Highlands, in two ranges: a near one you can read the shape of, and a far
    // one that is mostly silhouette. Nothing inside 130 m, so the crater and
    // its three stations keep their open sky.
    for (let i = 0; i < 26; i++) {
      const near = i < 10;
      const dist = near
        ? 130 + rand() * 90
        : 240 + rand() * (OUTER_PLAIN_RADIUS * 0.4);
      const theta = rand() * Math.PI * 2;
      const radius = (near ? 30 : 60) + rand() * (near ? 40 : 110);
      hills.push({
        id: `moon-hill-${i}`,
        pos: [Math.sin(theta) * dist, Math.cos(theta) * dist],
        radius,
        rise: radius * (0.14 + rand() * 0.16),
      });
    }

    return { craters, boulders, hills };
  }

  interface Scene {
    plain: ShapeGeometry;
    plinth: CylinderGeometry;
    shaft: CylinderGeometry;
    mound: CylinderGeometry;
    sky: SphereGeometry;
    boxes: Box[];
    /** The crater lip, drawn to match `elevationAt`'s ridge exactly. */
    rimRidge: TorusGeometry;
  }

  function buildScene(l: MoonLayout): Scene {
    // The two door approaches. These are the ONLY rectangles drawn as floor,
    // and each is the exact band `blockedAt` opens through the rock — so
    // everything the visitor can see to stand on, they can stand on.
    const band = l.doorBand;
    const boxes: Box[] = [
      // The hall in from the Sun. Both rooms suppress their tile geometry, so
      // these tiles draw nothing unless a module owns them — every other chamber
      // in the wing owns its inbound corridor and the Moon did not, which is why
      // the walk out of the Sundial crossed a lit void.
      ...l.corridorFloors.map((rect, i) =>
        slab(`moon-corridor-${i}`, rect, MOON_FLOOR_Y, "rim")
      ),
      ...l.corridorWalls.map((rect, i) => ({
        id: `moon-corridor-wall-${i}`,
        pos: [cx(rect), MOON_CORRIDOR_CEILING_Y / 2, cz(rect)] as [
          number,
          number,
          number,
        ],
        size: [
          Math.max(sx(rect), 0.01),
          MOON_CORRIDOR_CEILING_Y,
          Math.max(sz(rect), 0.01),
        ] as [number, number, number],
        material: "rim" as MaterialKey,
      })),
      // Its lid, so the hall reads as rock rather than as a trench under an
      // open sky.
      ...l.corridorFloors.map((rect, i) => ({
        id: `moon-corridor-ceiling-${i}`,
        pos: [cx(rect), MOON_CORRIDOR_CEILING_Y + SLAB_T / 2, cz(rect)] as [
          number,
          number,
          number,
        ],
        size: [Math.max(sx(rect), 0.01), SLAB_T, Math.max(sz(rect), 0.01)] as [
          number,
          number,
          number,
        ],
        material: "rim" as MaterialKey,
      })),
      slab(
        "moon-approach-west",
        {
          minX: l.interior.minX,
          maxX: l.centre.x - l.chamberRadius + 0.2,
          minZ: band.minZ,
          maxZ: band.maxZ,
        },
        MOON_FLOOR_Y,
        "regolith"
      ),
      slab(
        "moon-approach-east",
        {
          minX: l.centre.x + l.chamberRadius - 0.2,
          maxX: l.interior.maxX,
          minZ: band.minZ,
          maxZ: band.maxZ,
        },
        MOON_FLOOR_Y,
        "regolith"
      ),
    ];

    return {
      plain: plainGeometry(l),
      // The mare. A ring, not a disc: it starts under the crater floor's own
      // edge so there is no seam and no z-fight with it, and it carries no
      // hole because the arrival is 190 m inside its inner edge.
      outerPlain: new RingGeometry(
        l.chamberRadius - 0.25,
        OUTER_PLAIN_RADIUS,
        160,
        1
      ),
      // A torus authored in XY and laid flat, so a crater is a raised ring of
      // ejecta with open ground inside it. Its tube radius is 0.22 of the unit
      // circle, which is what the vertical scale below divides by to turn a
      // wanted lip height into a scale factor.
      farCraterRim: new TorusGeometry(1, 0.22, 6, 40),
      hill: new SphereGeometry(1, 24, 12),
      // Everything in the far field starts OUTSIDE the walkable plain. It has
      // no collision, so a boulder inside the disc is a boulder the visitor
      // walks through.
      far: farField(l.walkRadius + 6),
      // The lip, as geometry: a torus whose tube is the ridge's own half-width,
      // squashed to the ridge's own height. Half of it is under the mare, so
      // what shows is the top of a swell — the same shape the character
      // controller walks over.
      rimRidge: new TorusGeometry(
        l.chamberRadius,
        MOON_RIM_RIDGE_HALF_WIDTH_M,
        8,
        128
      ),
      plinth: new CylinderGeometry(l.arrivalRadius, l.arrivalRadius, 1, 48),
      shaft: new CylinderGeometry(
        l.arrivalHoleRadius,
        l.arrivalHoleRadius,
        1,
        48,
        1,
        true
      ),
      mound: new CylinderGeometry(1, 1, 1, 32),
      // Upper hemisphere only, centred on the plain and mounted only while the
      // visitor is in this room, so it can never black out its neighbours.
      // It must stand outside everything in the sky — the cosmic starfield is
      // a 75 m shell, the nebula 70 m and Earth ~64 m out. At the original 48
      // the dome sat IN FRONT of all three and the sky was simply black. It
      // now also has to stand outside the 380 m mare, or the ground would run
      // through the horizon.
      sky: new SphereGeometry(
        SKY_RADIUS,
        32,
        16,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      boxes,
    };
  }

  const layout = $derived(buildMoonLayout(grid));
  const scene = $derived(layout ? buildScene(layout) : null);

  $effect(() => {
    const current = scene;
    return () => {
      if (!current) return;
      current.plain.dispose();
      current.outerPlain.dispose();
      current.farCraterRim.dispose();
      current.hill.dispose();
      current.rimRidge.dispose();
      current.plinth.dispose();
      current.shaft.dispose();
      current.mound.dispose();
      current.sky.dispose();
    };
  });

  const inRoom = $derived(currentRoomId === MOON_ROOM_ID);
  const lit = $derived(visible && currentRoomId !== null && inRoom);

  // ── The key ───────────────────────────────────────────────────────────────
  //
  // One hard white sun, low and from the east so the mounds throw long shadows
  // WEST across the plain, toward the arrival — the visitor surfaces looking
  // down the shadows rather than at their tips. Fitted to the plain, not the
  // bay: a shadow map stretched over the corridors spends its resolution on
  // rock nobody looks at.
  const KEY_DISTANCE = 45;
  const KEY_ELEVATION_DEG = 22;
  const KEY_BEARING = Math.PI / 2; // east
  const key = new DirectionalLight(KEY_COLOUR, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 13;
  key.shadow.camera.bottom = -13;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.05;
  // three.js will not recompute the projection matrix for a frustum set after
  // construction, and a stale -5..5 box shadows a 10 m sliver of a 20 m plain.
  key.shadow.camera.updateProjectionMatrix();
  onDestroy(() => key.dispose());

  $effect(() => {
    if (!layout) return;
    const elevation = (KEY_ELEVATION_DEG * Math.PI) / 180;
    const cosE = Math.cos(elevation);
    key.position.set(
      layout.centre.x + Math.sin(KEY_BEARING) * cosE * KEY_DISTANCE,
      Math.sin(elevation) * KEY_DISTANCE,
      layout.centre.z + Math.cos(KEY_BEARING) * cosE * KEY_DISTANCE
    );
    key.target.position.set(layout.centre.x, 0, layout.centre.z);
    key.target.updateMatrixWorld();
    // Raised from 4.2 when the regolith maps landed: the authored diffuse is a
    // dark basalt and the flat-colour figure was lighting a much brighter
    // surface. Sunlight on the Moon is not dim — it is unscattered.
    key.intensity = lit ? 6 : 0;
  });
</script>

{#if scene && layout}
  <T.Group {visible}>
    <!-- The regolith plain, with the arrival punched clean through it -->
    <T.Mesh
      geometry={scene.plain}
      material={materials.regolith}
      position={[layout.centre.x, MOON_FLOOR_Y, layout.centre.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    />

    <!-- The two door approaches: the only rectangles drawn as floor here, and
         each one exactly the band `blockedAt` opens through the rock -->
    {#each scene.boxes as box (box.id)}
      <T.Mesh
        geometry={unitBox}
        material={materials[box.material]}
        position={box.pos}
        scale={box.size}
        receiveShadow
      />
    {/each}

    <!-- The shaft under the arrival. Open-ended and double-sided: what you see
         through the hole is the inside of a tube going down to the Sun. -->
    <T.Mesh
      geometry={scene.shaft}
      material={materials.shaft}
      position={[
        layout.arrival.x,
        MOON_FLOOR_Y - SHAFT_DEPTH / 2,
        layout.arrival.z,
      ]}
      scale={[1, SHAFT_DEPTH, 1]}
    />

    <!-- The Sun's own stone, sitting in the hole with a gap all the way round.
         Its top is flush with the regolith, so the seam the gravity changes at
         is a seam you can see. -->
    <T.Mesh
      geometry={scene.plinth}
      material={materials.sunStone}
      position={[layout.arrival.x, MOON_FLOOR_Y - 0.45, layout.arrival.z]}
      scale={[1, 0.9, 1]}
      castShadow
      receiveShadow
    />

    <!-- The three Quarter-Opposite stations. Low: nothing rises on the Moon. -->
    {#each layout.mounds as mound (mound.id)}
      <T.Mesh
        geometry={scene.mound}
        material={materials.mound}
        position={[mound.centre.x, mound.topY / 2, mound.centre.z]}
        scale={[mound.radius, Math.max(mound.topY, 0.01), mound.radius]}
        castShadow
        receiveShadow
      />
    {/each}

    <!-- The crater lip. It is GROUND, not wall: elevationAt raises the same
         ridge under the visitor, topping out below the physics provider's
         step-up, so walking out of the crater is a step up and a step down.
         The 2.4 m casting wall it replaces is what made this room a room.
         It still casts — the key is low and outside, and the lip's shadow
         reaching in across the dust is most of what says 'no atmosphere'. -->
    <T.Mesh
      geometry={scene.rimRidge}
      material={materials.rim}
      position={[layout.centre.x, MOON_FLOOR_Y, layout.centre.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[1, 1, MOON_RIM_RIDGE_TOP_Y / MOON_RIM_RIDGE_HALF_WIDTH_M]}
      castShadow
      receiveShadow
    />

    <!-- The sky. Mounted only while the visitor is standing in this room, so a
         48 m dome and a 75 m starfield can never swallow the rooms next door.

         The black dome is the backdrop, and the rest is NOT hand-rolled: the
         cosmic scene in `shared/3d/environments/scenes/cosmic` already IS a
         lunar surface — Earth hanging in the sky, a starfield, nebula and
         meteor streaks, all driven off `createDefaultCosmicNightConfig()`. The
         first version of this room drew an empty black hemisphere and called
         it the Moon while that scene sat one directory away. Austen:
         *"Look at my scenes package. Find cosmic. That's the moon."*

         Only the SKY is borrowed. The ground, the mounds and the arrival hole
         stay with this module, because they carry the room's geometry contract
         and the cosmic scene's own floor is a performance stage. -->
    {#if inRoom}
      <!-- The mare. Mounted with the sky and for the same reason: 380 m of
           ground centred on this room would otherwise be laid straight over
           every other chamber in the wing. It does not receive the key's
           shadow — the shadow camera is fitted to the 20 m plain, and widening
           it to 380 would spend the whole map on empty dust. -->
      <T.Mesh
        geometry={scene.outerPlain}
        material={materials.outerRegolith}
        position={[layout.centre.x, MOON_FLOOR_Y - 0.04, layout.centre.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {#each scene.far.craters as crater (crater.id)}
        <T.Mesh
          geometry={scene.farCraterRim}
          material={materials.outerRock}
          position={[
            layout.centre.x + crater.pos[0],
            MOON_FLOOR_Y - 0.04,
            layout.centre.z + crater.pos[1],
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[crater.radius, crater.radius, crater.height / 0.22]}
        />
      {/each}
      {#each scene.far.hills as hill (hill.id)}
        <T.Mesh
          geometry={scene.hill}
          material={materials.outerRock}
          position={[
            layout.centre.x + hill.pos[0],
            MOON_FLOOR_Y - 0.04,
            layout.centre.z + hill.pos[1],
          ]}
          scale={[hill.radius, hill.rise, hill.radius]}
        />
      {/each}
      {#each scene.far.boulders as boulder (boulder.id)}
        <T.Mesh
          geometry={unitBox}
          material={materials.outerRock}
          position={[
            layout.centre.x + boulder.pos[0],
            MOON_FLOOR_Y - 0.04 + boulder.size[1] / 2,
            layout.centre.z + boulder.pos[1],
          ]}
          rotation={boulder.rot}
          scale={boulder.size}
        />
      {/each}

      <T.Mesh
        geometry={scene.sky}
        material={materials.sky}
        position={[layout.centre.x, MOON_FLOOR_Y - 0.5, layout.centre.z]}
      />
      <T.Group position={[layout.centre.x, MOON_FLOOR_Y, layout.centre.z]}>
        <Starfield config={cosmic.starfield} />
        {#if cosmic.nebula.enabled}
          <NebulaLayer config={cosmic.nebula} />
        {/if}
        <!-- Earth. The reason to look up, and the reason this room needs no
             ornament of its own: the wing's other five chambers are all
             underground, and this is the one where you can see where you came
             from. -->
        <EarthSphere config={cosmic.earth} />
        {#if cosmic.earth.enabled}
          <EarthGodRays config={cosmic.godRays} earthConfig={cosmic.earth} />
        {/if}
        <!-- Optional-chained, because `particles.effects` is not present on
             every cosmic variant. Reading it straight threw inside the group
             and took the ENTIRE sky down with it — Earth, stars and nebula all
             silently gone, with only a promise rejection in the console to say
             so. -->
        {#if meteors?.enabled}
          <MeteorStreaks config={meteors} />
        {/if}
      </T.Group>
    {/if}

    <!-- Keep the light types mounted across every room. Only their uniform
         values change, which keeps the compiled material program stable. -->
    <T is={key} />
    <T is={key.target} />

    <!-- Almost nothing. This is the whole difference from the Sun room, which
         runs 0.55 of hemisphere fill so its shadow drawing stays readable. In
         vacuum there is no sky to bounce light back, so the shadowed side of
         everything goes to near-black — and that is the exhibit. -->
    <T.HemisphereLight
      position={[layout.centre.x, 20, layout.centre.z]}
      intensity={lit ? 0.05 : 0}
      color="#20242c"
      groundColor="#0a0a0b"
    />
  </T.Group>
{/if}
