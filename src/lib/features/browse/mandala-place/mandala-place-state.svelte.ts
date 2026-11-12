/**
 * Where the By mandala place is: shut, on the wall of every mandala, or on
 * one mandala's page with perhaps a row chosen.
 *
 * The address is the record (see mandala-place-address.ts). Opening the wall
 * and opening a page each push a history entry, so the browser's back goes
 * page, wall, where he came from; stepping along the climb and choosing a row
 * replace the current entry. A reload, the browser's back and forward, and a
 * return from the sequence viewer all read the address again through
 * `syncFromAddress`.
 *
 * The wall's place (the first family in view) is kept for the session, and
 * the family last opened from it is remembered so the wall can hand focus
 * back to its box.
 *
 * Spec: docs/superpowers/specs/2026-11-11-mandala-wall-design.md.
 */
import { browser } from "$app/env";
import {
  mutateCurrentUrl,
  type UrlMutationMode,
} from "#lib/shared/navigation/services/url-state.js";
import {
  mandalaAddress,
  readMandalaAddress,
  type MandalaAddress,
} from "./mandala-place-address";

const ANCHOR_KEY = "tka-mandala-wall-anchor";

function readAnchor(): string | null {
  if (!browser) return null;
  try {
    return sessionStorage.getItem(ANCHOR_KEY);
  } catch {
    return null;
  }
}

export interface MandalaPlaceState {
  readonly open: boolean;
  /** The page's family value; null on the wall. */
  readonly familyValue: string | null;
  /** The chosen row's sequence id; null when none is chosen. */
  readonly sequenceId: string | null;
  /** The family id first in view on the wall, kept for the session. */
  readonly wallAnchor: string | null;
  /** The family value last opened from the wall, for focus on return. */
  readonly lastOpened: string | null;
  openWall(): void;
  openFamily(value: string): void;
  /** Step to another family along the climb (replaces the history entry). */
  stepTo(value: string): void;
  chooseSequence(id: string | null): void;
  backToWall(): void;
  close(): void;
  setWallAnchor(familyId: string | null): void;
  /** Read the place from the address: on load, back, forward and returns. */
  syncFromAddress(url: URL): void;
}

export function createMandalaPlaceState(): MandalaPlaceState {
  let open = $state(false);
  let familyValue = $state<string | null>(null);
  let sequenceId = $state<string | null>(null);
  let wallAnchor = $state<string | null>(readAnchor());
  let lastOpened = $state<string | null>(null);
  /** This session pushed the entry now showing (the wall, or the page over
   *  it), so going back is the browser's own back. A screen reached by a
   *  reload or a link has no entry of ours under it and is replaced. */
  let wallPushed = false;
  let pagePushed = false;

  function current(): MandalaAddress {
    return { open, familyValue, sequenceId };
  }

  function write(mode: UrlMutationMode): void {
    const address = current();
    mutateCurrentUrl(
      (url) => {
        url.search = mandalaAddress(url, address).search;
      },
      { mode }
    );
  }

  return {
    get open() {
      return open;
    },
    get familyValue() {
      return familyValue;
    },
    get sequenceId() {
      return sequenceId;
    },
    get wallAnchor() {
      return wallAnchor;
    },
    get lastOpened() {
      return lastOpened;
    },
    openWall() {
      if (open && familyValue === null) return;
      open = true;
      familyValue = null;
      sequenceId = null;
      wallPushed = true;
      write("push");
    },
    openFamily(value) {
      open = true;
      familyValue = value;
      sequenceId = null;
      lastOpened = value;
      pagePushed = true;
      write("push");
    },
    stepTo(value) {
      if (value === familyValue) return;
      familyValue = value;
      sequenceId = null;
      lastOpened = value;
      write("replace");
    },
    chooseSequence(id) {
      if (id === sequenceId) return;
      sequenceId = id;
      write("replace");
    },
    backToWall() {
      if (familyValue === null) return;
      if (browser && pagePushed) {
        pagePushed = false;
        history.back();
        return;
      }
      familyValue = null;
      sequenceId = null;
      write("replace");
    },
    close() {
      if (!open) return;
      if (browser && wallPushed && familyValue === null) {
        wallPushed = false;
        history.back();
        return;
      }
      open = false;
      familyValue = null;
      sequenceId = null;
      write("replace");
    },
    setWallAnchor(familyId) {
      wallAnchor = familyId;
      if (!browser) return;
      try {
        if (familyId) sessionStorage.setItem(ANCHOR_KEY, familyId);
        else sessionStorage.removeItem(ANCHOR_KEY);
      } catch {
        // Storage can be denied; the wall then opens at its start.
      }
    },
    syncFromAddress(url) {
      const address = readMandalaAddress(url);
      if (address.familyValue !== familyValue) pagePushed = false;
      if (!address.open) wallPushed = false;
      open = address.open;
      familyValue = address.familyValue;
      sequenceId = address.sequenceId;
      if (familyValue) lastOpened = familyValue;
    },
  };
}

/** The one place Browse shows; the drill's doors and tiles open it. */
export const mandalaPlace: MandalaPlaceState = createMandalaPlaceState();
