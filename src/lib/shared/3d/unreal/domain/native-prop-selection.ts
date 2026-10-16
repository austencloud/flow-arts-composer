import type { PropBuild } from "@austencloud/scene-3d";
import {
  FAN_BUILDS,
  FAN_COVERS,
  FAN_FRAME_COLORS,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

/** Adapt the shared rail's build to FlowArtsRuntime's family:variant identity.
 * Meshes and supported variants remain owned by the native prop catalog.
 */
export function nativePropId(prop: string, build: PropBuild): string {
  if (prop !== "fan" || build.fanBuild === "pictograph") return prop;
  const frame = build.fanBuild === "day" ? build.fanFrameColor : "black";
  const cover = ["fire", "day"].includes(build.fanBuild)
    ? build.fanCover
    : "bare";
  return `fan:${build.fanBuild}_${frame}_${cover}`;
}

export function nativePropSelection(id: string): {
  prop: string;
  build: Partial<PropBuild> | null;
} {
  const [prop, variant] = id.split(":");
  if (prop !== "fan") return { prop: prop!, build: null };
  const [fanBuild, fanFrameColor, fanCover] =
    !variant || variant === "pictograph"
      ? ["pictograph", "black", "bare"]
      : variant.split("_");
  // Only decode values the shared rail understands. The native host validates
  // catalog availability before acknowledging the full variant ID.
  const valid =
    FAN_BUILDS.some((value) => value === fanBuild) &&
    FAN_FRAME_COLORS.some((value) => value === fanFrameColor) &&
    FAN_COVERS.some((value) => value === fanCover);
  return {
    prop,
    build: valid
      ? {
          fanBuild: fanBuild as PropBuild["fanBuild"],
          fanFrameColor: fanFrameColor as PropBuild["fanFrameColor"],
          fanCover: fanCover as PropBuild["fanCover"],
        }
      : null,
  };
}
