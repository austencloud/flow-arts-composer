import {
  Color,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import type { WorkerPropColor } from "./worker-prop-factory-types";

export const PROP_PALETTES = {
  blue: { main: "#3b82f6", dark: "#1d4ed8", light: "#60a5fa" },
  red: { main: "#ef4444", dark: "#b91c1c", light: "#f87171" },
} as const;

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
  hardware: MeshStandardMaterial;
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
  return new MeshBasicMaterial({
    color: PROP_PALETTES[color].main,
    opacity: 0.3,
    transparent: true,
  });
}

export function getPlateMaterials(color: WorkerPropColor): PlateMaterials {
  const cached = plateMaterials.get(color);
  if (cached) return cached;
  const palette = PROP_PALETTES[color];
  const value = {
    face: new MeshPhysicalMaterial({
      color: palette.main,
      roughness: 0.26,
      metalness: 0.12,
      clearcoat: 0.7,
      clearcoatRoughness: 0.16,
    }),
    edge: new MeshStandardMaterial({
      color: new Color(palette.main).lerp(new Color(palette.dark), 0.6),
      roughness: 0.42,
      metalness: 0.1,
    }),
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
    body: new MeshPhysicalMaterial({
      color: PROP_PALETTES[color].main,
      roughness: 0.3,
      metalness: 0.06,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
    }),
    trail: trail(color),
  };
  clubMaterials.set(color, value);
  return value;
}

export function getHoopMaterials(color: WorkerPropColor): HoopMaterials {
  const cached = hoopMaterials.get(color);
  if (cached) return cached;
  const value = {
    tube: new MeshPhysicalMaterial({
      color: PROP_PALETTES[color].main,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
      transmission: 0.12,
      thickness: 0.015875,
      ior: 1.5,
    }),
    hardware: new MeshStandardMaterial({
      color: "#1c1c1f",
      roughness: 0.72,
      metalness: 0.04,
    }),
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
    flare: new MeshPhysicalMaterial({
      color: PROP_PALETTES[color].main,
      roughness: 0.26,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    }),
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
    spine: new MeshPhysicalMaterial({
      color: palette.main,
      roughness: fire ? 0.24 : 0.62,
      metalness: fire ? 0.18 : 0.04,
      clearcoat: fire ? 0.8 : 0,
      clearcoatRoughness: 0.14,
    }),
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
  frameMaterials.set(key, value);
  return value;
}
