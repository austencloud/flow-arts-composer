import { PropType } from "./enums/prop-type";

/**
 * The physical build a triad is drawn as. Pictograph is the notation glyph;
 * Fire and Day are the two frames the 3D viewer builds (scene-3d's
 * `TRIAD_FIRE` / `TRIAD_DAY`), drawn by scripts/generate-triad-builds.cjs. A
 * build is a look, like a fan build or a buugeng style: renderer-only, never
 * PropType, notation, choreography, sequence codecs or URLs.
 */
export const TRIAD_BUILDS = ["pictograph", "fire", "day"] as const;
export type TriadBuild = (typeof TRIAD_BUILDS)[number];

export const DEFAULT_TRIAD_BUILD: TriadBuild = "pictograph";

export function normalizeTriadBuild(value: unknown): TriadBuild {
  return typeof value === "string" &&
    (TRIAD_BUILDS as readonly string[]).includes(value)
    ? (value as TriadBuild)
    : DEFAULT_TRIAD_BUILD;
}

/** The two props drawn as a build. Trigeng and quiad keep their own art. */
const BUILT_TRIAD_TYPES: ReadonlySet<string> = new Set([
  PropType.TRIAD,
  PropType.BIGTRIAD,
]);

export function isBuiltTriadPropType(
  propType: string | null | undefined
): boolean {
  return BUILT_TRIAD_TYPES.has(propType?.toLowerCase() ?? "");
}

/**
 * The build a render of these props is cached under: the build only when a
 * triad is drawn as Fire or Day. Every other case returns undefined, so
 * pictograph cells and every other prop keep the cache keys (local and cloud)
 * they had before triad builds existed.
 */
export function renderedTriadBuild(
  build: TriadBuild | null | undefined,
  propTypes: readonly (string | null | undefined)[]
): Exclude<TriadBuild, "pictograph"> | undefined {
  const normalized = normalizeTriadBuild(build);
  if (normalized === "pictograph") return undefined;
  return propTypes.some(isBuiltTriadPropType) ? normalized : undefined;
}

/**
 * Renderer-only identity for the texture cache: `triad__fire`,
 * `bigtriad__day`. Pictograph and every other prop keep the plain type.
 */
export function resolveTriadRenderKey(
  propType: string,
  build: TriadBuild
): string {
  const normalized = propType.toLowerCase();
  if (!isBuiltTriadPropType(normalized) || build === "pictograph") {
    return normalized;
  }
  return `${normalized}__${build}`;
}

export interface TriadRenderKey {
  propType: "triad" | "bigtriad";
  build: Exclude<TriadBuild, "pictograph">;
}

export function parseTriadRenderKey(value: string): TriadRenderKey | null {
  const [head, build, ...rest] = value.toLowerCase().split("__");
  if (rest.length > 0 || !head || !build) return null;
  if (!isBuiltTriadPropType(head)) return null;
  const normalized = normalizeTriadBuild(build);
  if (normalized === "pictograph" || normalized !== build) return null;
  return {
    propType: head as TriadRenderKey["propType"],
    build: normalized,
  };
}

/** The artwork folders that hold plain triad art, each at its own size. */
export type TriadArtworkFamily = "pictograph" | "animated" | "buttons";

/**
 * The build's sprite, in the same folder and frame as the plain art: same
 * viewBox, hand point on the viewBox centre, arm ends on the triad tip points.
 * Null for pictograph, which draws the plain file.
 */
export function triadBuildArtwork(
  propType: string,
  build: TriadBuild,
  family: TriadArtworkFamily = "pictograph"
): string | null {
  const normalized = propType.toLowerCase();
  if (!isBuiltTriadPropType(normalized) || build === "pictograph") return null;
  return `/images/props/${family}/${normalized}-${build}.svg?v=1`;
}

/**
 * The 3D scene's finish for a build. Pictograph has no physical build, so it
 * leaves the scene alone.
 */
export function triadBuildSceneFinish(
  build: TriadBuild
): "fire" | "day" | null {
  return build === "pictograph" ? null : build;
}

export interface TriadBuildOption {
  id: TriadBuild;
  label: string;
}

export const TRIAD_BUILD_OPTIONS: readonly TriadBuildOption[] = [
  { id: "pictograph", label: "Pictograph" },
  { id: "fire", label: "Fire" },
  { id: "day", label: "Day" },
];

/** The slice of the 3D scene's finish state a triad build writes. */
export interface TriadSceneFinishTarget {
  readonly finish: "fire" | "day";
  set(finish: "fire" | "day"): void;
}

/**
 * Point the 3D scene's default finish at a picked build. Pictograph leaves
 * the scene alone. Callers read `target.finish` untracked, so the scene's own
 * Fire/Day control still works until the 2D build is picked again.
 */
export function applyTriadBuildToScene(
  target: TriadSceneFinishTarget,
  build: TriadBuild | null | undefined
): void {
  const finish = triadBuildSceneFinish(normalizeTriadBuild(build));
  if (finish !== null && target.finish !== finish) target.set(finish);
}
