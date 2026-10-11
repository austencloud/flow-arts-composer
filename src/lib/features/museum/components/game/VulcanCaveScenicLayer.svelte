<script lang="ts">
  import { T } from "@threlte/core";
  import {
    Color,
    Euler,
    IcosahedronGeometry,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
  } from "three";
  import { onDestroy } from "svelte";
  import FallingParticles from "#lib/shared/3d/environments/primitives/FallingParticles.svelte";
  import type { WingRegion } from "../../domain/museum-grid-types";
  import type { AuthoredPointLightPlanChange } from "../../services/museum-room-light-pool";

  interface Props {
    rooms: WingRegion[];
    currentRoomId: string | null;
    visible?: boolean;
    onLightPlanChange?: AuthoredPointLightPlanChange;
  }

  interface ChamberMood {
    id: string;
    color: string;
    particleColor: string;
    tint: string;
  }

  interface ScenicChamber extends ChamberMood {
    centerX: number;
    centerZ: number;
    width: number;
    depth: number;
    /** Rooms with an authored shell supply their own dressing. */
    suppressed: boolean;
  }

  interface RockPlacement {
    id: string;
    variant: 0 | 1 | 2;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    tint: string;
  }

  interface MoodLightSlot {
    position: [number, number, number];
    color: string;
    intensity: number;
    distance: number;
  }

  let {
    rooms,
    currentRoomId,
    visible = true,
    onLightPlanChange,
  }: Props = $props();

  const TILE_SIZE = 0.5;
  const MODE_ORDER = [
    "cave-water",
    "cave-fire",
    "cave-earth",
    "cave-air",
    "cave-sun",
    "cave-moon",
  ] as const;

  const MOODS: Record<(typeof MODE_ORDER)[number], Omit<ChamberMood, "id">> = {
    "cave-water": {
      color: "#5aa8b4",
      particleColor: "#b8e1df",
      tint: "#263f3e",
    },
    "cave-fire": {
      color: "#d66b32",
      particleColor: "#ffc07a",
      tint: "#51251a",
    },
    "cave-earth": {
      color: "#9c8150",
      particleColor: "#d7bd86",
      tint: "#463925",
    },
    "cave-air": {
      color: "#9bb7c3",
      particleColor: "#d8e9ec",
      tint: "#34434a",
    },
    "cave-sun": {
      color: "#d9ad4b",
      particleColor: "#ffe4a0",
      tint: "#5a4321",
    },
    "cave-moon": {
      color: "#6678ad",
      particleColor: "#bdc7ed",
      tint: "#2f344d",
    },
  };

  // Rooms dressed by an authored shell or graybox own their own rocks, floor
  // discs, and dust — the generic cave dressing would double up inside them.
  const isSuppressed = (room: WingRegion) =>
    room.roomPresentation?.suppressTileGeometry === true;

  const caveRooms = rooms.filter(
    (room) => room.theme === "cave" && !isSuppressed(room)
  );
  const chambers: ScenicChamber[] = MODE_ORDER.flatMap((id) => {
    const room = rooms.find((candidate) => candidate.id === id);
    if (!room) return [];
    const mood = MOODS[id];
    return [
      {
        id,
        ...mood,
        suppressed: isSuppressed(room),
        centerX: (room.bounds.x + (room.bounds.width - 1) / 2) * TILE_SIZE,
        centerZ: (room.bounds.y + (room.bounds.height - 1) / 2) * TILE_SIZE,
        width: Math.max(1, (room.bounds.width - 2) * TILE_SIZE),
        depth: Math.max(1, (room.bounds.height - 2) * TILE_SIZE),
      },
    ];
  });

  function roomTint(roomId: string): string {
    return MOODS[roomId as (typeof MODE_ORDER)[number]]?.tint ?? "#332920";
  }

  function buildRockPlacements(): RockPlacement[] {
    const placements: RockPlacement[] = [];

    caveRooms.forEach((room, index) => {
      const west = room.bounds.x * TILE_SIZE;
      const east = (room.bounds.x + room.bounds.width - 1) * TILE_SIZE;
      const north = room.bounds.y * TILE_SIZE;
      const south = (room.bounds.y + room.bounds.height - 1) * TILE_SIZE;
      const centerX = (west + east) / 2;
      const centerZ = (north + south) / 2;
      const tint = roomTint(room.id);
      const alternate = index % 2 === 0;

      placements.push(
        {
          id: `${room.id}-corner-a`,
          variant: 2,
          position: [alternate ? west : east, 0, north],
          rotation: [0, index * 0.73, 0],
          scale: [2.1, 3.15 + (index % 3) * 0.28, 2.15],
          tint,
        },
        {
          id: `${room.id}-corner-b`,
          variant: 2,
          position: [alternate ? east : west, 0, south],
          rotation: [0, 1.1 + index * 0.47, 0],
          scale: [2.4, 3.65, 2.3],
          tint,
        },
        {
          id: `${room.id}-ceiling-a`,
          variant: 2,
          position: [centerX - 0.8, 4.43, centerZ + (alternate ? 0.7 : -0.7)],
          rotation: [Math.PI, index * 0.61, 0.12],
          scale: [1.15, 1.8 + (index % 2) * 0.35, 1.15],
          tint,
        }
      );

      if (MODE_ORDER.includes(room.id as (typeof MODE_ORDER)[number])) {
        placements.push(
          {
            id: `${room.id}-wall-a`,
            variant: 2,
            position: [west + 0.08, 0, centerZ + (alternate ? -1.35 : 1.35)],
            rotation: [0, 0.4 + index * 0.52, 0],
            scale: [1.65, 2.9, 1.65],
            tint,
          },
          {
            id: `${room.id}-wall-b`,
            variant: index % 3 === 0 ? 0 : 1,
            position: [east - 0.08, 0, centerZ + (alternate ? 1.55 : -1.55)],
            rotation: [0, 2.15 + index * 0.39, 0],
            scale: [2.05, 2.45, 2.2],
            tint,
          },
          {
            id: `${room.id}-ceiling-b`,
            variant: 2,
            position: [
              centerX + 1.35,
              4.46,
              centerZ + (alternate ? -0.85 : 0.85),
            ],
            rotation: [Math.PI, 1.2 + index * 0.44, -0.08],
            scale: [1.05, 2.35, 1.05],
            tint,
          }
        );
      }

      if (room.id === "cave-earth") {
        placements.push(
          {
            id: "cave-earth-mass-a",
            variant: 2,
            position: [west + 0.65, 0, centerZ + 1.1],
            rotation: [0, 2.4, 0],
            scale: [2.6, 3.5, 2.6],
            tint,
          },
          {
            id: "cave-earth-mass-b",
            variant: 2,
            position: [east - 0.55, 0, centerZ - 1.25],
            rotation: [0, 0.35, 0],
            scale: [2.25, 2.95, 2.25],
            tint,
          }
        );
      }
    });

    return placements;
  }

  const rockPlacements = buildRockPlacements();
  // These rocks used to be deep clones of three multi-mesh GLTFs. The first
  // cave doorway brought hundreds of their child meshes into the camera frustum
  // at once, producing ~694 draw calls and a repeatable shader-link freeze.
  // One low-poly instanced field preserves the silhouettes and per-room tint
  // while making the entire decorative layer a single draw call.
  const scenicRockGeometry = new IcosahedronGeometry(0.55, 1);
  const scenicRockMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const scenicRocks = new InstancedMesh(
    scenicRockGeometry,
    scenicRockMaterial,
    rockPlacements.length
  );
  scenicRocks.name = "museum-vulcan-scenic-rocks";
  scenicRocks.castShadow = true;
  scenicRocks.receiveShadow = true;
  // All placements share one tiny geometry; rendering the complete field is
  // cheaper and more reliable than maintaining a giant aggregate bounds box.
  scenicRocks.frustumCulled = false;

  const rockMatrix = new Matrix4();
  const rockPosition = new Vector3();
  const rockRotation = new Quaternion();
  const rockScale = new Vector3();
  const neutralRockColor = new Color("#7e7468");
  for (const [index, placement] of rockPlacements.entries()) {
    const verticalHalfExtent = 0.55 * placement.scale[1];
    const y =
      placement.position[1] > 2
        ? placement.position[1] - verticalHalfExtent
        : placement.position[1] + verticalHalfExtent;
    rockPosition.set(placement.position[0], y, placement.position[2]);
    rockRotation.setFromEuler(new Euler(...placement.rotation));
    rockScale.set(...placement.scale);
    rockMatrix.compose(rockPosition, rockRotation, rockScale);
    scenicRocks.setMatrixAt(index, rockMatrix);
    scenicRocks.setColorAt(
      index,
      neutralRockColor.clone().lerp(new Color(placement.tint), 0.72)
    );
  }
  scenicRocks.instanceMatrix.needsUpdate = true;
  if (scenicRocks.instanceColor) scenicRocks.instanceColor.needsUpdate = true;

  onDestroy(() => {
    scenicRockGeometry.dispose();
    scenicRockMaterial.dispose();
  });

  function inactiveLightSlot(): MoodLightSlot {
    return {
      position: [0, 2.35, 0],
      color: "#000000",
      intensity: 0,
      distance: 1,
    };
  }

  const moodLights = $derived.by((): MoodLightSlot[] => {
    const currentModeIndex = MODE_ORDER.indexOf(
      currentRoomId as (typeof MODE_ORDER)[number]
    );
    const focusIndex =
      currentModeIndex >= 0
        ? currentModeIndex
        : currentRoomId === "cave-threshold" || currentRoomId === "cave-squeeze"
          ? 0
          : currentRoomId === "egypt-threshold"
            ? MODE_ORDER.length - 1
            : -1;

    if (focusIndex < 0 || !visible) {
      return [inactiveLightSlot(), inactiveLightSlot(), inactiveLightSlot()];
    }

    const offsets = [-1, 0, 1];
    return offsets.map((offset) => {
      const chamber = chambers[focusIndex + offset];
      if (!chamber) return inactiveLightSlot();
      const isCurrent = offset === 0;
      const approachIntensity =
        currentModeIndex < 0 && focusIndex === 0 ? 0.72 : 1;
      return {
        position: [chamber.centerX, 2.35, chamber.centerZ],
        color: chamber.color,
        intensity:
          (isCurrent ? 3.4 : 0.38) * (isCurrent ? approachIntensity : 1),
        distance: Math.max(chamber.width, chamber.depth) * 1.05,
      };
    });
  });
  const MOOD_LIGHT_ROOMS = [
    ...MODE_ORDER,
    "cave-threshold",
    "cave-squeeze",
    "egypt-threshold",
  ] as const;

  $effect(() => {
    const lights = moodLights;
    if (!onLightPlanChange) return;
    onLightPlanChange("vulcan-cave-mood", {
      roomIds: MOOD_LIGHT_ROOMS,
      lights: lights.map((light) => ({
        x: light.position[0],
        y: light.position[1],
        z: light.position[2],
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
      })),
    });
    return () => onLightPlanChange("vulcan-cave-mood", null);
  });
</script>

<T is={scenicRocks} />

{#each chambers as chamber (chamber.id)}
  {#if !chamber.suppressed}
    <T.Mesh
      position={[chamber.centerX, 0.026, chamber.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <T.CircleGeometry
        args={[Math.min(chamber.width, chamber.depth) * 0.34, 36]}
      />
      <T.MeshBasicMaterial
        color={chamber.color}
        transparent
        opacity={0.075}
        depthWrite={false}
        toneMapped={false}
      />
    </T.Mesh>

    <T.Group position={[chamber.centerX, 2.35, chamber.centerZ]}>
      <FallingParticles
        type="dust"
        count={18}
        area={{
          width: Math.min(chamber.width, 4.5),
          height: 3.8,
          depth: Math.min(chamber.depth, 4.5),
        }}
        speed={0.025}
        colors={[chamber.particleColor, chamber.color]}
        sizeRange={[0.006, 0.016]}
        spin={false}
        enabled={visible}
      />
    </T.Group>
  {/if}
{/each}
