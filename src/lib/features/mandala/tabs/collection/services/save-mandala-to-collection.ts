import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
import {
  buildMandalaCollectionEntry,
  type SaveMandalaInput,
} from "../domain/build-mandala-collection-entry";
import { mandalaCollectionState } from "../state/mandala-collection-state.svelte";

export async function saveMandalaToCollection(
  input: SaveMandalaInput
): Promise<string | null> {
  const entry = buildMandalaCollectionEntry(
    input,
    mandalaCollectionState.count
  );

  try {
    await mandalaCollectionState.add(entry);
    return entry.name;
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    getErrorHandler().showUserError({
      message: "Couldn't save this mandala",
      technicalDetails: normalizedError.message,
      error: normalizedError,
      severity: "error",
      context: {
        module: "create",
        tab: "workspace",
        action: "saveMandalaToCollection",
        additionalData: {
          variant: input.variant,
          pathShape: input.pathShape,
          stepCount: input.steps.length,
        },
      },
    });
    return null;
  }
}
