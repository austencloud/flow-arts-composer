/**
 * Where the By mandala place is: shut, or open with the slider on a level.
 *
 * The address is the record (see mandala-place-address.ts). Opening the
 * place pushes a history entry, so the browser's back returns to where he
 * came from; moving the slider replaces the entry, so a reload lands on the
 * same level without a history entry per step. A reload, the browser's back
 * and forward, and a return from the sequence viewer all read the address
 * again through `syncFromAddress`.
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

export interface MandalaPlaceState {
  readonly open: boolean;
  /** The slider's level; null until the address or the slider names one. */
  readonly level: number | null;
  /** Open the place, on `level` when given. */
  openPlace(level?: number | null): void;
  /** Move the slider (replaces the history entry). */
  setLevel(level: number): void;
  close(): void;
  /** Read the place from the address: on load, back, forward and returns. */
  syncFromAddress(url: URL): void;
}

export function createMandalaPlaceState(): MandalaPlaceState {
  let open = $state(false);
  let level = $state<number | null>(null);
  /** This session pushed the entry now showing, so leaving is the browser's
   *  own back. A place reached by a reload or a link has no entry of ours
   *  under it and is replaced. */
  let pushed = false;

  function write(mode: UrlMutationMode): void {
    const address: MandalaAddress = { open, level };
    mutateCurrentUrl(
      (url) => {
        url.search = mandalaAddress(url, address).search;
      },
      { mode }
    );
  }

  function setLevel(next: number): void {
    if (next === level) return;
    level = next;
    if (open) write("replace");
  }

  return {
    get open() {
      return open;
    },
    get level() {
      return level;
    },
    openPlace(at = null) {
      if (open) {
        if (at !== null) setLevel(at);
        return;
      }
      open = true;
      level = at;
      pushed = true;
      write("push");
    },
    setLevel,
    close() {
      if (!open) return;
      if (browser && pushed) {
        pushed = false;
        history.back();
        return;
      }
      open = false;
      level = null;
      write("replace");
    },
    syncFromAddress(url) {
      const address = readMandalaAddress(url);
      if (!address.open) pushed = false;
      open = address.open;
      level = address.level;
    },
  };
}

/** The one place Browse shows; the drill's doors and tiles open it. */
export const mandalaPlace: MandalaPlaceState = createMandalaPlaceState();
