/**
 * ImageCompositionSync.svelte.ts
 *
 * Reactive module that mirrors boolean/numeric settings from the
 * global ImageCompositionManager into local Svelte 5 reactive state.
 * Syncs via the manager's observer pattern on mount.
 *
 * Extracted from SequenceViewerOrchestrator to isolate image
 * composition concerns.
 */

import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";

export function createImageCompositionSync() {
  const imageComposition = getImageCompositionManager();

  // Local reactive state mirroring the composition manager
  let imgShowWord = $state(imageComposition.addWord);
  let imgShowStartPos = $state(imageComposition.includeStartPlacement);
  let imgShowStepNumbers = $state(imageComposition.addStepNumbers);
  let imgShowDifficulty = $state(imageComposition.addDifficultyLevel);
  let imgShowNotes = $state(imageComposition.showNotes);
  let imgCustomNotesText = $state(imageComposition.customNotesText);
  let imgShowQRCode = $state(imageComposition.showQRCode);
  let imgShowMandala = $state(imageComposition.showMandala);
  let imgShowLoopGlyph = $state(imageComposition.showLoopGlyph);
  let imgDarkMode = $state(imageComposition.darkMode);

  /** Observer callback that syncs manager → local state. */
  function syncFromManager() {
    imgShowWord = imageComposition.addWord;
    imgShowStepNumbers = imageComposition.addStepNumbers;
    imgShowStartPos = imageComposition.includeStartPlacement;
    imgShowDifficulty = imageComposition.addDifficultyLevel;
    imgShowNotes = imageComposition.showNotes;
    imgCustomNotesText = imageComposition.customNotesText;
    imgShowQRCode = imageComposition.showQRCode;
    imgShowMandala = imageComposition.showMandala;
    imgShowLoopGlyph = imageComposition.showLoopGlyph;
    imgDarkMode = imageComposition.darkMode;
  }

  /** Register the observer. Returns a cleanup function. */
  function registerObserver(): () => void {
    imageComposition.registerObserver(syncFromManager);
    return () => imageComposition.unregisterObserver(syncFromManager);
  }

  return {
    get imgShowWord() {
      return imgShowWord;
    },
    get imgShowStartPos() {
      return imgShowStartPos;
    },
    get imgShowStepNumbers() {
      return imgShowStepNumbers;
    },
    get imgShowDifficulty() {
      return imgShowDifficulty;
    },
    get imgShowNotes() {
      return imgShowNotes;
    },
    get imgCustomNotesText() {
      return imgCustomNotesText;
    },
    get imgShowQRCode() {
      return imgShowQRCode;
    },
    get imgShowMandala() {
      return imgShowMandala;
    },
    get imgShowLoopGlyph() {
      return imgShowLoopGlyph;
    },
    get imgDarkMode() {
      return imgDarkMode;
    },
    set imgDarkMode(v: boolean) {
      imgDarkMode = v;
    },
    imageComposition,
    registerObserver,
  };
}

export type ImageCompositionSyncState = ReturnType<
  typeof createImageCompositionSync
>;
