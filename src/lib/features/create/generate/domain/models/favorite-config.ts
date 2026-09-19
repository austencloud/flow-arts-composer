import type { UIGenerationConfig } from "../../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

export interface SavedGeneratorSetup {
  id: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A public setup from any account, as the Community tab shows it. */
export interface CommunitySetup {
  setupId: string;
  userId: string;
  displayName: string;
  avatar?: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
}

export interface SavedSetupDraft {
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

export type ActiveSetupSource =
  | { kind: "setup"; setupId: string }
  | { kind: "community"; userId: string; setupId: string };

export type PendingSetupAction =
  | { kind: "create" }
  | { kind: "rename" | "update" | "delete"; setupId: string };
