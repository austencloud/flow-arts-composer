import type { PropBuild } from "@austencloud/scene-3d";
import { nativePropVariants } from "../../../../../../unreal/Shared/Tools/native-prop-catalog.mjs";

/** One variant row of the native prop catalog. */
type NativePropVariant = {
  id: string;
  fanBuild?: string;
  fanFrameColor?: string;
  fanCover?: string;
  finish?: string;
  triangleGrip?: string;
  leftFlipped?: boolean;
  rightFlipped?: boolean;
};

/** Adapt the shared rail's build to FlowArtsRuntime's family:variant identity.
 * Meshes and supported variants remain owned by the native prop catalog.
 */
export function nativePropId(
  prop: string,
  build: PropBuild,
  flips: { leftFlipped?: boolean; rightFlipped?: boolean } = {}
): string {
  const variants: NativePropVariant[] = nativePropVariants(prop);
  const variant = variants.find((candidate) => {
    if (candidate.fanBuild !== undefined)
      return candidate.fanBuild === build.fanBuild &&
        candidate.fanFrameColor === (build.fanBuild === "day" ? build.fanFrameColor : "black") &&
        candidate.fanCover === (["fire", "day"].includes(build.fanBuild) ? build.fanCover : "bare");
    if (candidate.id === "pictograph") return build.fanBuild === "pictograph";
    if (candidate.finish !== undefined) return candidate.finish === build.finish;
    if (candidate.triangleGrip !== undefined) return candidate.triangleGrip === build.triangleGrip;
    if (candidate.leftFlipped !== undefined)
      return candidate.leftFlipped === Boolean(flips.leftFlipped) &&
        candidate.rightFlipped === Boolean(flips.rightFlipped);
    return candidate.id === "default";
  });
  if (!variant) throw new Error(`Native prop variant unavailable: ${prop}`);
  return ["default", "pictograph", "fire", "corner", "matching-a"].includes(variant.id)
    ? prop
    : `${prop}:${variant.id}`;
}

export function nativePropSelection(id: string): {
  prop: string;
  build: Partial<PropBuild> | null;
} {
  const [prop, variant] = id.split(":");
  if (!prop) return { prop: "", build: null };
  const defaultVariant = prop === "fan" || prop === "bigfan" ? "pictograph"
    : ["triad", "bigtriad", "quiad"].includes(prop) ? "fire"
    : prop === "triangle" ? "corner" : "default";
  const variants: NativePropVariant[] = nativePropVariants(prop);
  const selected = variants.find(
    (candidate) => candidate.id === (variant ?? defaultVariant)
  );
  if (!selected) return { prop, build: null };
  const { fanBuild, fanFrameColor, fanCover, finish, triangleGrip } = selected;
  const build = prop === "fan" || prop === "bigfan"
    ? { fanBuild: fanBuild ?? "pictograph", fanFrameColor: fanFrameColor ?? "black", fanCover: fanCover ?? "bare" }
    : finish !== undefined ? { finish }
    : triangleGrip !== undefined ? { triangleGrip } : null;
  return {
    prop,
    build: build as Partial<PropBuild> | null,
  };
}
