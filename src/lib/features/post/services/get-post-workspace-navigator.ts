import { goto } from "$app/navigation";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { rememberPostSequence } from "./post-workspace-projects";

export function getPostWorkspaceNavigator() {
  return {
    async openSequence(sequence: SequenceData): Promise<void> {
      rememberPostSequence(sequence);
      await goto(`/post?project=${encodeURIComponent(sequence.id)}`);
    },
  };
}

export default getPostWorkspaceNavigator;
