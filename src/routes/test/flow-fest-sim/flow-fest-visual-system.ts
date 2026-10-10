import type { FlowFestMoment } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
import type { FlowFestBranchId } from "../flow-fest-graybox/flow-fest-runtime-contract";

export type FlowFestGate3MomentId = "day" | "dusk" | "night";

export interface FlowFestVisualProfile {
  id: FlowFestMoment;
  label: string;
  clockLabel: string;
  sky: {
    top: string;
    mid: string;
    bottom: string;
  };
  sun: {
    enabled: boolean;
    direction: [number, number, number];
    color: string;
    intensity: number;
    angularDiameterDegrees: number;
    glowScale: number;
    glowOpacity: number;
  };
  fill: {
    color: string;
    intensity: number;
  };
  hemisphere: {
    sky: string;
    ground: string;
    intensity: number;
  };
  ambient: {
    color: string;
    intensity: number;
  };
  fog: {
    color: string;
    density: number;
  };
  grade: {
    terrainTint: string;
    foliageTint: string;
    barkTint: string;
    /**
     * Multiplied onto camp fabric and vehicle paint. Tents and cars carry their
     * own per-instance colours, so this is the moment's light on them, not a
     * repaint: white at noon, near-silhouette at 2 AM.
     */
    dressingTint: string;
    /**
     * Multiplied onto the grass field, which already carries its own per-tuft
     * instance colours. White leaves the authored summer palette alone; the
     * darker, cooler moments pull it off noon green without touching the
     * placement data or the tuft variety.
     */
    grassTint: string;
    /**
     * How much of the ground's diffuse the authored detail atlas owns, against
     * `terrainTint`. The atlas is a sunlit summer scan, so at full strength it
     * pins the ground to a tan daylight albedo no multiply can reach — a mix
     * factor of 0.8 leaves a tint under 20% of the result. Daylight wants that
     * atlas; 2 AM does not, because moonlight does not resolve ground colour
     * anyway. Lowering it hands the moment its own ground and kills the desert
     * read at night without repainting a single texture.
     */
    terrainDetailColorStrength: number;
    exposure: number;
  };
}

export interface FlowFestGate3ReviewRequest {
  enabled: boolean;
  cameraId: string | null;
  momentId: FlowFestGate3MomentId | null;
  moment: FlowFestMoment | null;
  branch: FlowFestBranchId;
}

export const FLOW_FEST_GATE3_CAMERA_IDS = [
  "lower-gate",
  "lower-level",
  "upper-parking",
  "middle-earth",
  "night-composition",
] as const;

export const FLOW_FEST_GATE3_MOMENTS = ["day", "dusk", "night"] as const;

export const FLOW_FEST_GATE3_VISUAL_HIERARCHY = [
  "Measured landform and tier edges",
  "Registered roads and traced connectors",
  "Temporary camps and parking",
  "People, tasks, and route light",
  "The fictional fire-jam perimeter and separate LED circle",
] as const;

const PROFILES: Record<FlowFestMoment, FlowFestVisualProfile> = {
  afternoon: {
    id: "afternoon",
    label: "Thursday afternoon",
    clockLabel: "THU · 4:37 PM",
    sky: { top: "#4f83a3", mid: "#8eabb2", bottom: "#dcc89d" },
    sun: {
      enabled: true,
      direction: [-0.58, 0.82, -0.42],
      color: "#fff0c6",
      intensity: 2.7,
      angularDiameterDegrees: 0.82,
      glowScale: 7.5,
      glowOpacity: 0.16,
    },
    fill: { color: "#8fb0a1", intensity: 0.34 },
    hemisphere: { sky: "#c9e2e8", ground: "#334b35", intensity: 0.78 },
    ambient: { color: "#b9c9b7", intensity: 0.08 },
    // Aerial perspective, not weather: the far tree line and the bare ridge
    // beyond the mapped site have to recede into the sky instead of holding
    // full saturation at 400 m.
    fog: { color: "#9ab0ad", density: 0.0016 },
    grade: {
      terrainTint: "#a8bf8a",
      foliageTint: "#a6c78a",
      // The authored bark is a pale sunlit tan. On the near tier the branch
      // structure reaches past the canopy, and at that value it read as bare
      // white sticks through the leaves — the dead-tree impression survived
      // even after the canopy itself was fixed.
      barkTint: "#a37c55",
      grassTint: "#ffffff",
      dressingTint: "#ffffff",
      // The detail atlas is a bare-dirt scan on every ground family the mask
      // does not call meadow, which is what made the bench above the field read
      // as desert sand. Stepping it back lets the moment's green tint reach the
      // slope while the atlas still carries the roads and clearing edges.
      terrainDetailColorStrength: 0.66,
      exposure: 1.02,
    },
  },
  "golden-hour": {
    id: "golden-hour",
    label: "Thursday dusk",
    clockLabel: "THU · 7:48 PM",
    sky: { top: "#27496c", mid: "#786f82", bottom: "#dc8f61" },
    sun: {
      enabled: true,
      direction: [-0.76, 0.22, -0.61],
      color: "#ffc177",
      intensity: 2.15,
      angularDiameterDegrees: 0.9,
      glowScale: 9.5,
      glowOpacity: 0.22,
    },
    fill: { color: "#718c91", intensity: 0.31 },
    hemisphere: { sky: "#a8b4ba", ground: "#3c412f", intensity: 0.62 },
    ambient: { color: "#aa9c84", intensity: 0.08 },
    fog: { color: "#7d6355", density: 0.0022 },
    grade: {
      terrainTint: "#d1c39a",
      foliageTint: "#d1c998",
      barkTint: "#d9ad83",
      grassTint: "#d8b48c",
      dressingTint: "#f0c79c",
      terrainDetailColorStrength: 0.62,
      exposure: 1.05,
    },
  },
  night: {
    id: "night",
    label: "First night",
    clockLabel: "FRI · 2:13 AM",
    sky: { top: "#050c1d", mid: "#12203a", bottom: "#2b2440" },
    // 2:13 AM. The rig sums to about 1.15 against the afternoon's 3.90 — near
    // two stops down — so the bonfire is by far the brightest thing on the
    // field while moonlight still separates the ridge, the tree line and the
    // tents from the sky. Darker than this and the campground reads as an
    // unlit void everywhere the fire does not reach: at 0.89 the whole lower
    // field crushed to black and the camps became one flat silhouette.
    sun: {
      enabled: false,
      direction: [0.42, 0.72, 0.36],
      color: "#9fbdf0",
      intensity: 0.55,
      angularDiameterDegrees: 0.7,
      glowScale: 8,
      glowOpacity: 0,
    },
    fill: { color: "#294662", intensity: 0.14 },
    hemisphere: { sky: "#33496b", ground: "#070b10", intensity: 0.38 },
    ambient: { color: "#0f1a26", intensity: 0.08 },
    fog: { color: "#070d1a", density: 0.0035 },
    grade: {
      // Moonlit woodland is desaturated blue-green, and dark. A light tint here
      // makes the crowns read as clouds resting on the field rather than as a
      // tree line, because they end up brighter than the sky behind them.
      // With the detail atlas stepped back below, this tint is most of what
      // the ground actually is at night, so it carries the field's own value
      // rather than nudging a sunlit tan.
      terrainTint: "#4d5a6b",
      foliageTint: "#4c5c55",
      barkTint: "#6a5c56",
      // Grass blades stand near-vertical, so a hemisphere light hands them the
      // 50/50 sky-ground blend and the moon barely grazes them. Physically
      // right, and it crushed the whole foreground field to black. The tint is
      // where that is paid back, which is why it runs brighter than every other
      // night tint here.
      grassTint: "#a6bcc4",
      // Nylon fly sheets are the most reflective thing in a dark campground —
      // brighter than leaves, which is the ordering an over-dark tint inverted
      // until the camps rendered as one black wall.
      dressingTint: "#96a2b6",
      terrainDetailColorStrength: 0.2,
      exposure: 1.3,
    },
  },
  dawn: {
    id: "dawn",
    label: "Friday dawn",
    clockLabel: "FRI · 8:06 AM",
    sky: { top: "#63839e", mid: "#c8958d", bottom: "#efd0a4" },
    sun: {
      enabled: true,
      direction: [0.62, 0.34, -0.7],
      color: "#ffd4a0",
      intensity: 1.45,
      angularDiameterDegrees: 0.82,
      glowScale: 8.5,
      glowOpacity: 0.18,
    },
    fill: { color: "#8ea7b2", intensity: 0.28 },
    hemisphere: { sky: "#c6c8c7", ground: "#3c493d", intensity: 0.54 },
    ambient: { color: "#b6afa2", intensity: 0.08 },
    fog: { color: "#a3968f", density: 0.002 },
    grade: {
      terrainTint: "#d1ccb2",
      foliageTint: "#c5d1a8",
      barkTint: "#d4c0a9",
      grassTint: "#dcd6c4",
      dressingTint: "#e9e2d4",
      terrainDetailColorStrength: 0.72,
      exposure: 1.03,
    },
  },
};

const REVIEW_MOMENT_TO_SIMULATION: Record<
  FlowFestGate3MomentId,
  FlowFestMoment
> = {
  day: "afternoon",
  dusk: "golden-hour",
  night: "night",
};

export function getFlowFestVisualProfile(
  moment: FlowFestMoment
): FlowFestVisualProfile {
  return PROFILES[moment];
}

export function parseFlowFestGate3ReviewRequest(
  query: URLSearchParams
): FlowFestGate3ReviewRequest {
  const enabled = query.get("gate3") === "1";
  const requestedMoment = query.get("moment");
  const momentId = FLOW_FEST_GATE3_MOMENTS.includes(
    requestedMoment as FlowFestGate3MomentId
  )
    ? (requestedMoment as FlowFestGate3MomentId)
    : null;
  const branchValue = query.get("branch");
  const branch: FlowFestBranchId =
    branchValue === "upper-tent" || branchValue === "car-camp"
      ? branchValue
      : "lower-tent";

  return {
    enabled,
    cameraId: enabled ? query.get("camera") : null,
    momentId: enabled ? momentId : null,
    moment: enabled && momentId ? REVIEW_MOMENT_TO_SIMULATION[momentId] : null,
    branch,
  };
}
