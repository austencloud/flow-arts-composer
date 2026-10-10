import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ViewerNavMode } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";

const SEQ_KEY = "coven-hub:last-sequence-id";
const NAV_KEY = "coven-hub:nav-mode";

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export interface CovenHubState {
  /** The sequence currently performed across the coven stations. */
  readonly activeSequence: SequenceData | null;
  /** Whether the sequence picker overlay is showing. */
  readonly pickerOpen: boolean;
  /** Camera/navigation mode for the 3D viewer. */
  readonly navMode: ViewerNavMode;
  /** Id of the effect the user has zoomed in on, or null for the full hub. */
  readonly focusedEffect: string | null;
  /** Persisted id from a prior session; the page hydrates the full data. */
  readonly lastSequenceId: string | null;
  setSequence(seq: SequenceData): void;
  openPicker(): void;
  closePicker(): void;
  setNavMode(mode: ViewerNavMode): void;
  setFocusedEffect(id: string | null): void;
}

export function createCovenHubState(): CovenHubState {
  const persistedSeqId = readLS(SEQ_KEY);
  const persistedNav = readLS(NAV_KEY) as ViewerNavMode | null;

  let activeSequence = $state<SequenceData | null>(null);
  // Start with the picker closed when a prior selection exists — the page
  // rehydrates that sequence on mount, so reopening the picker would fight it.
  let pickerOpen = $state(persistedSeqId === null);
  let navMode = $state<ViewerNavMode>(persistedNav ?? "orbit");
  let focusedEffect = $state<string | null>(null);

  return {
    get activeSequence() { return activeSequence; },
    get pickerOpen() { return pickerOpen; },
    get navMode() { return navMode; },
    get focusedEffect() { return focusedEffect; },
    /** Persisted id from a prior session; the page hydrates the full data. */
    get lastSequenceId() { return persistedSeqId; },

    setSequence(seq: SequenceData) {
      activeSequence = seq;
      pickerOpen = false;
      writeLS(SEQ_KEY, seq.id);
    },
    openPicker() { pickerOpen = true; },
    closePicker() { pickerOpen = false; },
    setNavMode(mode: ViewerNavMode) {
      navMode = mode;
      writeLS(NAV_KEY, mode);
    },
    setFocusedEffect(id: string | null) { focusedEffect = id; },
  };
}
