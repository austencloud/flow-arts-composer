/**
 * Spell Mode State - Lightweight reactive state for spell mode within Generate tab
 *
 * Manages word input, expanded word, and letter sources.
 * Spell-specific fields only - generation config (level, grid, constraints)
 * comes from the shared UIGenerationConfig.
 */

import type { LetterSource } from "#lib/shared/create/domain/spell-models.js";

const STORAGE_KEY = "tka-generate-spell-word";

export function createSpellModeState() {
  let inputWord = $state(loadPersistedWord());
  let expandedWord = $state("");
  let letterSources = $state<LetterSource[]>([]);
  let error = $state<string | null>(null);
  let isGenerating = $state(false);
  let isWordInputOpen = $state(false);

  function setInputWord(word: string) {
    inputWord = word;
    // Clear expanded data when word changes (new parse needed)
    expandedWord = "";
    letterSources = [];
    error = null;
    persistWord(word);
  }

  function setExpandedWord(word: string) {
    expandedWord = word;
  }

  function setLetterSources(sources: LetterSource[]) {
    letterSources = sources;
  }

  function setError(msg: string | null) {
    error = msg;
  }

  function setGenerating(generating: boolean) {
    isGenerating = generating;
  }

  function clearError() {
    error = null;
  }

  function openWordInput() {
    isWordInputOpen = true;
  }

  function closeWordInput() {
    isWordInputOpen = false;
  }

  return {
    get inputWord() { return inputWord; },
    get expandedWord() { return expandedWord; },
    get letterSources() { return letterSources; },
    get error() { return error; },
    get isGenerating() { return isGenerating; },
    get isWordInputOpen() { return isWordInputOpen; },

    setInputWord,
    setExpandedWord,
    setLetterSources,
    setError,
    setGenerating,
    clearError,
    openWordInput,
    closeWordInput,
  };
}

export type SpellModeState = ReturnType<typeof createSpellModeState>;

function loadPersistedWord(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistWord(word: string): void {
  try {
    if (word) {
      localStorage.setItem(STORAGE_KEY, word);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Silently ignore storage errors
  }
}
