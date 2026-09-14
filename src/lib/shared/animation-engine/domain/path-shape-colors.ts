import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";

/** One color per motion path, shared by every surface that names a path. */
export const PATH_SHAPE_COLORS: Record<MandalaPathShape, string> = {
  arc: "#60a5fa",
  linear: "#f97316",
  concave: "#a78bfa",
  hybrid: "#2dd4bf",
};
