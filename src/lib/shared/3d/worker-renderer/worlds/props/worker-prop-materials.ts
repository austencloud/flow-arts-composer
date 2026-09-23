import {
  Color,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import { PROP_COLORS, paintWithPropHand } from "@austencloud/scene-3d/worker";
import type { WorkerPropColor } from "./worker-prop-factory-types";

/** The live hand palettes; the application sets them through the snapshot. */
export const PROP_PALETTES = PROP_COLORS;

export const METAL_COLORS = {
  blade: "#c0c0c0",
  guard: "#ffd540",
  grip: "#8B4513",
} as const;

export const TRAIL_GEOMETRY = new SphereGeometry(0.015, 8, 8);

export interface PlateMaterials {
  face: MeshPhysicalMaterial;
  edge: MeshStandardMaterial;
  trail: MeshBasicMaterial;
}

export interface ClubMaterials {
  knob: MeshStandardMaterial;
  handle: MeshStandardMaterial;
  marker: MeshStandardMaterial;
  body: MeshPhysicalMaterial;
  trail: MeshBasicMaterial;
}

export interface HoopMaterials {
  tube: MeshPhysicalMaterial;
  trail: MeshBasicMaterial;
}

export interface TorchMaterials {
  hardware: MeshStandardMaterial;
  grip: MeshStandardMaterial;
  flare: MeshPhysicalMaterial;
  shaft: MeshStandardMaterial;
  wick: MeshStandardMaterial;
  trail: MeshBasicMaterial;
}

export interface FrameMaterials {
  spine: MeshPhysicalMaterial;
  hub: MeshStandardMaterial;
  ring: MeshStandardMaterial;
  collar: MeshStandardMaterial;
  tip: MeshStandardMaterial;
  trail: MeshBasicMaterial;
}

const plateMaterials = new Map<WorkerPropColor, PlateMaterials>();
const clubMaterials = new Map<WorkerPropColor, ClubMaterials>();
const hoopMaterials = new Map<WorkerPropColor, HoopMaterials>();
const torchMaterials = new Map<WorkerPropColor, TorchMaterials>();
const frameMaterials = new Map<string, FrameMaterials>();

function trail(color: WorkerPropColor): MeshBasicMaterial {
  return paintWithPropHand(
    new MeshBasicMaterial({ opacity: 0.3, transparent: true }),
    color
  );
}

export function getPlateMaterials(color: WorkerPropColor): PlateMaterials {
  const cached = plateMaterials.get(color);
  if (cached) return cached;
  const palette = PROP_PALETTES[color];
  const value = {
    face: paintWithPropHand(
      new MeshPhysicalMaterial({
        color: palette.main,
        roughness: 0.26,
        metalness: 0.12,
        clearcoat: 0.7,
        clearcoatRoughness: 0.16,
      }),
      color
    ),
    edge: paintWithPropHand(
      new MeshStandardMaterial({
        color: new Color(palette.main).lerp(new Color(palette.dark), 0.6),
        roughness: 0.42,
        metalness: 0.1,
      }),
      color,
      (hand) => new Color(hand.main).lerp(new Color(hand.dark), 0.6)
    ),
    trail: trail(color),
  };
  plateMaterials.set(color, value);
  return value;
}

export function getClubMaterials(color: WorkerPropColor): ClubMaterials {
  const cached = clubMaterials.get(color);
  if (cached) return cached;
  const value = {
    knob: new MeshStandardMaterial({
      color: "#1b1b1e",
      roughness: 0.72,
      metalness: 0.02,
    }),
    handle: new MeshStandardMaterial({
      color: "#eceef1",
      roughness: 0.55,
      metalness: 0.02,
    }),
    marker: new MeshStandardMaterial({
      color: "#141416",
      roughness: 0.88,
      metalness: 0.02,
    }),
    body: paintWithPropHand(
      new MeshPhysicalMaterial({
        color: PROP_PALETTES[color].main,
        roughness: 0.3,
        metalness: 0.06,
        clearcoat: 0.7,
        clearcoatRoughness: 0.18,
      }),
      color
    ),
    trail: trail(color),
  };
  clubMaterials.set(color, value);
  return value;
}

export function getHoopMaterials(color: WorkerPropColor): HoopMaterials {
  const cached = hoopMaterials.get(color);
  if (cached) return cached;
  const value = {
    tube: paintWithPropHand(
      new MeshPhysicalMaterial({
        color: PROP_PALETTES[color].main,
        roughness: 0.22,
        metalness: 0.02,
        clearcoat: 0.85,
        clearcoatRoughness: 0.1,
        transmission: 0.12,
        thickness: 0.015875,
        ior: 1.5,
      }),
      color
    ),
    trail: trail(color),
  };
  hoopMaterials.set(color, value);
  return value;
}

export function getTorchMaterials(color: WorkerPropColor): TorchMaterials {
  const cached = torchMaterials.get(color);
  if (cached) return cached;
  const value = {
    hardware: new MeshStandardMaterial({
      color: "#e6e8ec",
      roughness: 0.3,
      metalness: 0.45,
    }),
    grip: new MeshStandardMaterial({
      color: "#231f20",
      roughness: 0.86,
      metalness: 0.03,
    }),
    flare: paintWithPropHand(
      new MeshPhysicalMaterial({
        color: PROP_PALETTES[color].main,
        roughness: 0.26,
        metalness: 0.08,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
      }),
      color
    ),
    shaft: new MeshStandardMaterial({
      color: "#b9bec6",
      roughness: 0.22,
      metalness: 0.72,
    }),
    wick: new MeshStandardMaterial({
      color: "#f6e5b6",
      roughness: 0.95,
      metalness: 0,
    }),
    trail: trail(color),
  };
  torchMaterials.set(color, value);
  return value;
}

export function getFrameMaterials(
  color: WorkerPropColor,
  variant: "fire" | "day"
): FrameMaterials {
  const key = `${color}:${variant}`;
  const cached = frameMaterials.get(key);
  if (cached) return cached;
  const palette = PROP_PALETTES[color];
  const fire = variant === "fire";
  const value = {
    spine: paintWithPropHand(
      new MeshPhysicalMaterial({
        color: palette.main,
        roughness: fire ? 0.24 : 0.62,
        metalness: fire ? 0.18 : 0.04,
        clearcoat: fire ? 0.8 : 0,
        clearcoatRoughness: 0.14,
      }),
      color
    ),
    hub: new MeshStandardMaterial({
      color: fire ? "#c8ced8" : palette.dark,
      roughness: fire ? 0.28 : 0.58,
      metalness: fire ? 0.62 : 0.05,
    }),
    ring: new MeshStandardMaterial({
      color: fire ? "#c8ced8" : palette.dark,
      roughness: fire ? 0.2 : 0.58,
      metalness: fire ? 0.7 : 0.05,
    }),
    collar: new MeshStandardMaterial({
      color: "#26262a",
      roughness: 0.78,
      metalness: 0.05,
    }),
    tip: fire
      ? new MeshStandardMaterial({
          color: "#f6e5b6",
          roughness: 0.95,
          metalness: 0,
        })
      : new MeshStandardMaterial({
          color: "#f7f7fa",
          roughness: 0.46,
          metalness: 0,
          emissive: new Color(palette.main),
          emissiveIntensity: 0.55,
        }),
    trail: trail(color),
  };
  if (!fire) {
    paintWithPropHand(value.hub, color, "dark");
    paintWithPropHand(value.ring, color, "dark");
    paintWithPropHand(value.tip, color, "main", "emissive");
  }
  frameMaterials.set(key, value);
  return value;
}
