/**
 * Global reference to Generator Panel state
 *
 * Allows voice commands to access generator configuration and trigger actions
 * without needing Svelte context.
 *
 * Set by GeneratePanel when it mounts, cleared when it unmounts.
 */

import type { GeneratorHelpId } from "#lib/shared/create/domain/generator-help-content.js";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";

export interface GeneratorVoiceRef {
  /** Read the current UI generation config */
  getConfig(): UIGenerationConfig;
  /** Update one or more config fields */
  updateConfig(updates: Partial<UIGenerationConfig>): void;
  /** Trigger sequence generation with current settings */
  triggerGeneration(): void;
  /** Open the help modal for a specific control */
  openHelpForControl(controlId: GeneratorHelpId): void;
  /** Get the current prop type from settings */
  getCurrentPropType(): string;
}

let generatorRef: GeneratorVoiceRef | null = null;

export function setGeneratorVoiceRef(ref: GeneratorVoiceRef | null): void {
  generatorRef = ref;
}

export function getGeneratorVoiceRef(): GeneratorVoiceRef | null {
  return generatorRef;
}
