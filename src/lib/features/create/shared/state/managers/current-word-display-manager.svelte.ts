/**
 * Current Word Display Manager
 *
 * Manages the effect that determines what text to display in the top bar
 * based on the current creation state.
 *
 * Handles contextual messaging for:
 * - Guided mode header text
 * - Gestural mode (hand path) state messages
 * - Construct mode instructions
 * - Spell mode with letter sources for original vs bridge styling
 * - Default sequence word display
 *
 * Extracted from CreateModule to reduce component complexity.
 *
 * Domain: Create module - Current word display management
 */

import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { createCreateModuleState as CreateModuleStateType } from "../create-module-state.svelte";
import type { createConstructTabState as ConstructTabStateType } from "../construct-tab-state.svelte";
import type { LetterSource } from "$lib/shared/create/domain/spell-models";

type CreateModuleState = ReturnType<typeof CreateModuleStateType>;
type ConstructTabState = ReturnType<typeof ConstructTabStateType>;

/**
 * Detect and remove repeated cycles in letter sources.
 * E.g., [A,Δ,U,S,T,Y,E,Δ,N,W,A,Δ,U,S,T,Y,E,Δ,N,W] → first 10 only.
 */
function simplifyRepeatedLetterSources(sources: LetterSource[]): LetterSource[] {
  const n = sources.length;
  if (n < 2) return sources;

  // Try pattern lengths from 1 to half the array
  for (let len = 1; len <= Math.floor(n / 2); len++) {
    if (n % len !== 0) continue;

    let isRepeating = true;
    for (let i = len; i < n; i++) {
      if (sources[i]!.letter !== sources[i % len]!.letter) {
        isRepeating = false;
        break;
      }
    }

    if (isRepeating) {
      return sources.slice(0, len);
    }
  }

  return sources;
}

export interface CurrentWordDisplayConfig {
  CreateModuleState: CreateModuleState;
  constructTabState: ConstructTabState;
  onCurrentWordChange?: (word: string) => void;
  onLetterSourcesChange?: (sources: LetterSource[] | null) => void;
}

/**
 * Creates the current word display effect
 * @returns Cleanup function
 */
export function createCurrentWordDisplayEffect(
  config: CurrentWordDisplayConfig
): () => void {
  const {
    CreateModuleState,
    constructTabState,
    onCurrentWordChange,
    onLetterSourcesChange,
  } = config;

  if (!onCurrentWordChange) {
    // No callback provided, return no-op cleanup
    return () => {};
  }

  // Effect: Notify parent of current word changes (or contextual message for hand path)
  const cleanup = $effect.root(() => {
    $effect(() => {
      if (!CreateModuleState) return;

      // CRITICAL: Access the current sequence to ensure effect tracks changes
      // Variables are used for side effects (dependency tracking)
       
      const _currentSequence = CreateModuleState.sequenceState.currentSequence;
       
      const _stepCount = CreateModuleState.getCurrentBeatCount();

      let displayText = "";
      let letterSources: LetterSource[] | null = null;

      // PRIORITY 1: Check sequence metadata for spell data (letterSources for original vs bridge letters)
      // This handles both the old spell tab and the new generate tab's spell mode
      const sequence = CreateModuleState.sequenceState.currentSequence;
      const spellData = sequence?.metadata?.spellData as {
        originalWord?: string;
        expandedWord?: string;
        letterSources?: LetterSource[];
      } | undefined;

      if (spellData?.letterSources && spellData.letterSources.length > 0) {
        const allSources = spellData.letterSources;
        // Simplify repeated letter sources (e.g., AUSTEN×2 at 20 steps → show one cycle)
        letterSources = simplifyRepeatedLetterSources(allSources);
        // Build display text from the simplified sources
        displayText = letterSources.map(s => s.letter).join("");
      }
      // PRIORITY 2: Construct tab - start placement instructions
      else if (navigationState.activeTab === "construct") {
        if (constructTabState.shouldShowStartPlacementPicker()) {
          displayText = "Choose your start placement!";
        } else {
          displayText = CreateModuleState.sequenceState.sequenceWord() ?? "";
        }
      }
      // PRIORITY 4: Assemble tab - show letters as they resolve, empty until paired
      else if (CreateModuleState.activeSection === "assemble") {
        const assembleWord = CreateModuleState.getActiveTabSequenceState().sequenceWord?.() ?? "";
        displayText = assembleWord;
      }
      // Default: Show current word
      else {
        displayText = CreateModuleState.sequenceState.sequenceWord() ?? "";
      }

      onCurrentWordChange(displayText);
      onLetterSourcesChange?.(letterSources);
    });
  });

  return cleanup;
}
