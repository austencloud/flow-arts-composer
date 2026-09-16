import type { PictographData } from "../models/pictograph-data";

export function createPictographData(
  data: Partial<PictographData> = {}
): PictographData {
  // Build object conditionally using object spread to avoid undefined assignments
  return {
    id: data.id || crypto.randomUUID(),
    motions: data.motions || {},
    // Only include optional properties if they are not undefined
    ...(data.letter !== undefined && { letter: data.letter }),
    ...(data.startPlacement !== undefined && {
      startPlacement: data.startPlacement,
    }),
    ...(data.endPlacement !== undefined && { endPlacement: data.endPlacement }),
    ...(data.category !== undefined && { category: data.category }),
  };
}
