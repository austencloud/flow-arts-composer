import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import { resolvePerformerContact } from "./performer-contact-displacement";

/** The rendered torso uses the same route that placed its props. */
export function resolvePerformerUpperBodyStance(
  performer: CharacterInstanceState
) {
  return resolvePerformerContact(performer).stance;
}
