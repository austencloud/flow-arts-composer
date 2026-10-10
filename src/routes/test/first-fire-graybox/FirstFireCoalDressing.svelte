<script lang="ts">
  /**
   * Coal dressing for the first section of the walk: Water door, threshold,
   * the water-to-dj transfer, and the approach into the DJ court.
   *
   * Placement is DERIVED from the approved contract, never eyeballed. The
   * corridor centreline and width come out of pathSections, the threshold out
   * of contract.threshold, the court out of contract.courts. Nothing here
   * moves a wall or a route - it only decides what the visitor sees standing
   * on geometry the plan already fixed.
   *
   * The vocabulary is the one the look-dev room settled:
   *   - banked coal cribbing as the wall treatment
   *   - chain lamps marking the route
   *   - a quench vent where the walk arrives from Water
   *
   * The quench vent is doing double duty. Austen's brief asks for a thread
   * connecting the exhibits, and this is the one place in the museum where two
   * rooms physically meet: a visitor steps out of Water and the first thing
   * this room does is put their element on hot slag and boil it off. The
   * transition IS the exhibit label.
   */
  import { T } from "@threlte/core";
  import { MeshStandardMaterial } from "three";
  import type { FirstFireBlenderContract } from "#lib/features/museum/data/first-fire-blender-contract.js";
  import FirstFireCoalWall from "#lib/shared/3d/environments/scenes/first-fire/FirstFireCoalWall.svelte";
  import FirstFireCoalLamp from "#lib/shared/3d/environments/scenes/first-fire/FirstFireCoalLamp.svelte";
  import FirstFireSteamVent from "#lib/shared/3d/environments/scenes/first-fire/FirstFireSteamVent.svelte";

  interface Props {
    contract: FirstFireBlenderContract;
    /** Cut with the extinguish beat, same as the rest of the court dressing. */
    lit?: boolean;
  }

  const { contract, lit = true }: Props = $props();

  /** Blender (X, Y, Z) -> runtime (X, Z, -Y). Same mapping the walk scene uses. */
  const toRuntime = (point: { x: number; y: number }): [number, number] => [
    point.x,
    -point.y,
  ];

  const CEILING_Y = 5.4;
  /** Height of the quench-vent housing above the floor. */
  const VENT_SINK = 0.3;

  const iron = new MeshStandardMaterial({
    color: "#2b2320",
    roughness: 0.72,
    metalness: 0.2,
  });

  /**
   * The first section of the walk is three contract path sections end to end:
   * the steam threshold you arrive on from Water, the ember bridge, and the
   * lane that turns into the DJ court. They share endpoints, so the dedupe
   * below keeps the centreline a single unbroken polyline.
   */
  const APPROACH_SECTIONS = [
    "water-steam-threshold",
    "ember-bridge",
    "torch-lane-to-dj",
  ];

  const approach = $derived(
    APPROACH_SECTIONS.map((id) =>
      contract.pathSections.find((section) => section.id === id)
    ).filter((section) => section !== undefined)
  );

  const transfer = $derived(approach.length > 0 ? approach[0] : null);

  /** Corridor centreline in runtime XZ. */
  const centreline = $derived.by(() => {
    const points: [number, number][] = [];
    for (const section of approach) {
      for (const point of section.blenderPoints) {
        const next = toRuntime(point);
        const last = points.at(-1);
        if (last && Math.hypot(last[0] - next[0], last[1] - next[1]) < 1e-6) {
          continue;
        }
        points.push(next);
      }
    }
    return points;
  });

  interface Placement {
    x: number;
    z: number;
    /** Yaw so the placed thing faces the corridor. */
    yaw: number;
  }

  /**
   * One placement at a named distance along the centreline, offset sideways by
   * `offset` (signed, so the same call does either wall).
   *
   * Deliberately NOT a uniform sampler. The first pass dropped a fitting every
   * N metres down both walls for the whole run, which is how the corridor ended
   * up with coal packed floor to ceiling on both sides for sixteen metres with
   * nowhere for the eye to rest. Every station in this file is now a decision
   * with a distance written next to it.
   *
   * Distances are arc length, not vertex index: the plan's corridor vertices
   * bunch up around the turn into the court, so per-vertex placement crowds the
   * fittings exactly where the visitor most needs a clear read. Past the end of
   * the route it clamps rather than dropping the station.
   */
  function placeAt(
    points: readonly [number, number][],
    distance: number,
    offset: number
  ): Placement | null {
    if (points.length < 2) return null;
    let travelled = 0;

    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const segment = Math.hypot(dx, dz);
      if (segment < 1e-6) continue;
      const nx = dx / segment;
      const nz = dz / segment;
      const last = i === points.length - 2;

      if (distance <= travelled + segment || last) {
        const t = Math.min(Math.max(distance - travelled, 0), segment);
        // Left normal in XZ. Sign of `offset` picks the side.
        return {
          x: ax + nx * t + -nz * offset,
          z: az + nz * t + nx * offset,
          yaw: Math.atan2(nx, nz),
        };
      }
      travelled += segment;
    }
    return null;
  }

  const corridorWidth = $derived(transfer?.width ?? 4.5);
  /**
   * Flush with the wall face. The plan's wall band starts at half the corridor
   * width and runs 1.2m outward, so anything placed past that face is inside
   * solid basalt - the first pass put the run at +0.9 and buried it. The
   * cribbing's own relief is what keeps it out of the walkway.
   */
  const wallOffset = $derived(corridorWidth / 2);

  /**
   * Head height plus a little, NOT floor to ceiling. A coal wall run to the
   * 5.4m ceiling has no silhouette - it is a lit surface with another lit
   * surface above it, and the room loses its dark top. Stopping at 2.3m leaves
   * three metres of black over the fuel, which is what the lamps hang against
   * and what makes the bank read as a bank rather than as wallpaper.
   */
  const CRIB_HEIGHT = 2.3;
  /** Corridor profile: the run projects ~0.6m, leaving 3.3m clear between. */
  const CRIB_RELIEF = 0.42;

  /**
   * ===== The composition =====
   *
   * The route is four straight legs, measured off the contract:
   *
   *   leg A   0.00 - 7.00m   Water door to the bend. Visitor spawns at 2.0m.
   *   leg B   7.00 - 12.00m  the diagonal
   *   leg C  12.00 - 14.06m  the short jog
   *   leg D  14.06 - 15.86m  the turn into the DJ court
   *
   * It gets THREE dressed events, one per leg, and no leg carries two.
   *
   *   3.75m  the quench vent, on the threshold. Arrival from Water.
   *  10.00m  the fuel bank, past the bend.
   *  13.20m  one chain lamp, at the court mouth.
   *
   * The spacing is set in ELEVATION, not in plan. An earlier pass spaced these
   * on the floor plan, called 6m "far apart", and shipped an arrival frame
   * holding the vent, both lamps, the crib and the torch lane at once: leg A is
   * straight, 7m long, and the visitor spawns at 2.0m, so everything from the
   * threshold to the bend is one sightline. Distance down a straight corridor
   * does not separate two things - it stacks them. What separates them is the
   * bend, so each beat now sits on its own leg and the visitor has to walk to
   * earn the next one.
   *
   * Leg A therefore holds exactly one lit object, at ankle height, and nothing
   * else. That is the whole point of the arrival: the room should read dark,
   * warm and deep before it reads decorated, and a visitor who steps out of
   * Water into a full frame has nowhere left to go.
   *
   * The fuel bank is ONE 3.4m cribbing run on the LEFT only, sitting inside
   * leg B's 5m so a rigid straight run never punches the wall on a bend. One
   * lit side and one dark side is a composition; two lit sides is a tunnel of
   * orange. It is also the honest read - fuel gets stacked where there is room
   * to stack it, not wrapped around a corridor like tile.
   */
  const CRIB = { along: 10, side: -1, bayWidth: 3.4 };

  const crib = $derived(
    placeAt(centreline, CRIB.along, CRIB.side * wallOffset)
  );

  /**
   * ONE lamp, at the court mouth.
   *
   * There used to be a second at 6.4m on the arrival leg, and it was the
   * loudest object in the first frame: a lit basket at head height, dead centre
   * of the corridor, two metres past the spawn. A fixture that hangs in the
   * middle of the walkway is not decoration, it is an obstacle, and one at the
   * near end of a straight leg guarantees the visitor meets the room's
   * brightest element before they have taken a step.
   *
   * The route does not need a fixture to be legible - the corridor has one
   * direction and a lit court at the end of it. So the lamp stops being a
   * repeated route marker and becomes an event: it hangs at the one place where
   * the walk turns and commits, and it is the only one, which is why the coals
   * dripping out of it are worth watching.
   */
  const LAMP_STATIONS = [13.2];

  const lamps = $derived(
    LAMP_STATIONS.map((along) => placeAt(centreline, along, 0)).filter(
      (place) => place !== null
    )
  );

  /** The mouth lamp is the one that sheds. */
  const dripAt = 0;

  const thresholdCentre = $derived(toRuntime(contract.threshold.blenderCentre));
  const waterDoor = $derived(toRuntime(contract.doors.water.blender));

  /**
   * On the threshold centre, across the line of travel, so the visitor sees it
   * on arrival and then walks over it. The first pass split the difference back
   * toward the door and put it directly under the spawn, where the one piece of
   * dressing that names the Water-to-Fire seam was the one piece nobody saw.
   */
  const ventPosition = $derived<[number, number]>(thresholdCentre);
  const ventYaw = $derived(
    Math.atan2(
      thresholdCentre[0] - waterDoor[0],
      thresholdCentre[1] - waterDoor[1]
    )
  );
</script>

{#if lit && centreline.length > 1}
  <!-- ===== Water threshold: the quench vent =====
       Lifted by its own sink depth. The vent is authored as a slot cut into the
       floor, and the graybox floor is a solid slab with no hole in it - sunk at
       y=0 the entire station renders inside the slab, which is why the first
       pass produced no grate, no up-light and no steam. Standing it on the
       floor turns the slot into a housing the visitor steps over, which reads
       the same and needs no hole. -->
  <T.Group
    position={[ventPosition[0], VENT_SINK, ventPosition[1]]}
    rotation.y={ventYaw}
  >
    <!-- 2.0m across a 4.5m corridor. At 3.4 it spanned nearly wall to wall and
         stopped reading as a fitting set into the floor - it became the floor,
         which is the one thing a threshold detail must not do. Sized down it
         leaves a good metre of dark slab either side to be set into, and the
         visitor steps over it rather than onto it. -->
    <!-- Low rate and a knee-high plume because the visitor arrives almost on
         top of this: the locked water-entry camera stands under two metres
         from the grate. A plume authored to look right from across the room is
         a curtain from there, and the arrival frame is the one frame in this
         section that has to be clean. -->
    <FirstFireSteamVent
      width={2}
      depth={0.9}
      sink={VENT_SINK}
      ceilingY={CEILING_Y - VENT_SINK}
      steamRate={0.5}
      plumeHeight={1.1}
      material={iron}
    />
  </T.Group>

  <!-- A bay's face is its local +Z and `yaw` points along the walk, so the run
       turns a quarter to look back across the centreline. The sign of `side`
       picks the quarter: turn it the wrong way and the run presents its back. -->
  {#if crib}
    <T.Group
      position={[crib.x, 0, crib.z]}
      rotation.y={crib.yaw + (CRIB.side * Math.PI) / 2}
    >
      <FirstFireCoalWall
        bayWidth={CRIB.bayWidth}
        height={CRIB_HEIGHT}
        lumpsPerBay={900}
        relief={CRIB_RELIEF}
        lightIntensity={3.2}
        lightDistance={7}
        seed={17}
        material={iron}
      />
    </T.Group>
  {/if}

  <!-- ===== Lamps marking the way ===== -->
  {#each lamps as lamp, i (`lamp${i}`)}
    <T.Group position={[lamp.x, 0, lamp.z]}>
      <FirstFireCoalLamp
        ceilingY={CEILING_Y}
        basketY={2.55}
        lightIntensity={i === dripAt ? 9 : 7.5}
        dripCount={i === dripAt ? 14 : 0}
      />
    </T.Group>
  {/each}
{/if}
