import type { CharacterInstanceState } from "./character-instance-state.svelte";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * Resolves the prop type for a performer.
 *
 * Uses the cascade: performer override → explicit scene override →
 * viewer defaults → globalFallback. A custom prop chosen in the Performer Hub
 * must survive a viewer-wide prop change, while an inheriting performer still
 * follows that viewer-wide choice.
 */
export function resolvePerformerProp(
  performer: CharacterInstanceState | null | undefined,
  globalFallback: PropType,
  explicitOverride?: PropType | null
): PropType {
  return (
    performer?.settings?.prop ??
    explicitOverride ??
    performer?.effectiveProp ??
    globalFallback
  );
}
