/**
 * The name a LOOP option wears in the Extend list and in its applied message.
 *
 * A reflection is one type whichever line it crosses, so both reflections read
 * "Reflected" and the description under the name says which line. FLIPPED stays
 * the saved alias of Reflected on the horizontal line; only its name changes.
 */

import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { loopTypeLabel } from "#lib/features/create/generate/components/loop-component-presentation.js";

export function loopOptionName(loopType: LOOPType): string {
  return loopTypeLabel(
    loopType === LOOPType.FLIPPED ? LOOPType.MIRRORED : loopType
  );
}
