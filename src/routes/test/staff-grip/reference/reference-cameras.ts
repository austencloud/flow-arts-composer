import type { InspectionView } from "../inspection-framing";

const body = (
  id: string,
  label: string,
  azimuthDeg: number,
  elevationDeg = 6,
): InspectionView => ({
  id,
  label,
  hint: "Your camera",
  subject: "body",
  azimuthDeg,
  elevationDeg,
  grid: "reference",
});

export const REFERENCE_CAMERA_PRESETS: readonly InspectionView[] = [
  body("front", "Front", 0),
  body("quarter-left", "Three-quarter left", 45),
  body("left", "Left side", 90),
  body("quarter-right", "Three-quarter right", -45),
  body("right", "Right side", -90),
  body("back", "Back", 180),
  body("overhead", "Overhead", 0, 68),
];

/** First guesses for the first, second and third video. */
export const DEFAULT_PRESET_BY_SLOT = [
  "front",
  "left",
  "quarter-right",
] as const;

export function referencePreset(id: string): InspectionView {
  return (
    REFERENCE_CAMERA_PRESETS.find((preset) => preset.id === id) ??
    REFERENCE_CAMERA_PRESETS[0]!
  );
}

type Vec3 = [number, number, number];

export interface SavedReferenceCamera {
  presetId: string;
  /** The dragged camera, when Austen fine-tuned it. */
  shot: { position: Vec3; target: Vec3 } | null;
}

const PREFIX = "tka:staff-grip:reference-camera:v1:";

function isVec3(value: unknown): value is Vec3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export function loadReferenceCamera(
  videoKey: string,
): SavedReferenceCamera | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(PREFIX + videoKey) ?? "null",
    ) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const { presetId, shot } = raw as Record<string, unknown>;
    if (typeof presetId !== "string") return null;
    const validShot =
      shot &&
      typeof shot === "object" &&
      isVec3((shot as Record<string, unknown>).position) &&
      isVec3((shot as Record<string, unknown>).target)
        ? (shot as SavedReferenceCamera["shot"])
        : null;
    return { presetId, shot: validShot };
  } catch {
    return null;
  }
}

export function saveReferenceCamera(
  videoKey: string,
  camera: SavedReferenceCamera,
): void {
  try {
    localStorage.setItem(PREFIX + videoKey, JSON.stringify(camera));
  } catch {
    // A full or blocked store only costs the remembered angle.
  }
}
