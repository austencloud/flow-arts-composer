/**
 * Museum → Composer handoff.
 *
 * The museum shows sequences as exhibits; the visitor can take one with them.
 * This hands a museum exhibit sequence to the Create module the same way the
 * card inspector and Browse do: through the deep-link store, then a module
 * change. Create is not a keep-alive module, so switching to it remounts the
 * module and its initializer consumes the stored sequence at boot.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { deepLinker } from "$lib/shared/navigation/services/deep-linker";
import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../data/museum-exhibit-sequences";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";

const PENDING_EDIT_KEY = "tka-pending-edit-sequence";

/** Build a Composer-ready SequenceData from a museum exhibit sequence id. */
export function buildMuseumSequenceData(
  sequenceId: string,
  name?: string
): SequenceData | null {
  const museumSeq = MUSEUM_EXHIBIT_SEQUENCES[sequenceId];
  if (!museumSeq) return null;
  return createSequenceData({
    id: `museum-${sequenceId}-${Date.now().toString(36)}`,
    name: name ?? `Archive: ${museumSeq.word}`,
    word: museumSeq.word,
    steps: [...(museumSeq.steps as readonly StepData[])],
    ...(museumSeq.startPlacement
      ? { startPlacement: createStartPlacementData(museumSeq.startPlacement) }
      : {}),
    isCircular: true,
    tags: ["kinetic-archive"],
  });
}

/**
 * Hand a museum sequence to the Composer and go there.
 * Returns false when the sequence id is unknown.
 */
export async function openInComposer(
  sequenceId: string,
  name?: string
): Promise<boolean> {
  const sequence = buildMuseumSequenceData(sequenceId, name);
  if (!sequence) return false;

  // Primary path: the deep-link store, consumed by the Create initializer.
  deepLinker.setData("create", sequence, "construct");
  // Belt and braces: the pending-edit slot the card inspector uses. The Create
  // module's pending-edit effect drains it if the initializer already ran.
  try {
    localStorage.setItem(PENDING_EDIT_KEY, JSON.stringify(sequence));
  } catch {
    /* private mode: the deep-link store still carries it */
  }

  if (document.pointerLockElement) document.exitPointerLock();
  await handleModuleChange("create", "construct");
  return true;
}
