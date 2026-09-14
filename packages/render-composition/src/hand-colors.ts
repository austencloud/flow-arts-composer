export interface HandColorPair {
  left: string;
  right: string;
}

export const LIGHT_HAND_COLORS: Readonly<HandColorPair> = {
  left: "#3D44B8",
  right: "#DC2626",
};

export const DARK_HAND_COLORS: Readonly<HandColorPair> = {
  left: "#3575E2",
  right: "#ED1C24",
};

const SHORT_HEX_COLOR = /^#[0-9a-f]{3}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeHandHexColor(
  value: unknown,
  fallback: string
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const expanded = SHORT_HEX_COLOR.test(trimmed)
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
  return HEX_COLOR.test(expanded) ? expanded.toLowerCase() : fallback;
}

export function resolveHandColorPair(
  value: unknown,
  fallback: HandColorPair
): HandColorPair {
  const candidate =
    value && typeof value === "object"
      ? (value as { left?: unknown; right?: unknown })
      : null;
  return {
    left: normalizeHandHexColor(candidate?.left, fallback.left),
    right: normalizeHandHexColor(candidate?.right, fallback.right),
  };
}
