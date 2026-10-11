// Local IndexedDB archive of every generated deck.
//
// LOOP generation is unseeded, so a recipe can't reproduce a deck's exact cards.
// To let any past generation be re-opened and its precise backs recovered, the
// full SequenceData is stored here. Two object stores keep the browse list fast:
//   - meta:  one light row per deck (the Generated browse list reads only this)
//   - decks: the heavy { cards, sequences } payload, loaded only on Open
//
// Best-effort: every method is a no-op under SSR and swallows IndexedDB errors
// (quota, unavailable) with a warn — the archive must never block or break a
// draw or render. Mirrors the raw-IndexedDB pattern in DeckCardBlobCache.ts.

import { browser } from "$app/env";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { normalizeLegacySequence } from "@tka/tka-types";
import type { DeckReleaseCard } from "../domain/models/DeckRelease";
import { normalizeDeckReleaseCard } from "../domain/normalize-deck-release";

const DB_NAME = "deck-archive";
const DB_VERSION = 1;
const META_STORE = "meta";
const DECKS_STORE = "decks";

/** Light row for the Generated browse list — never holds heavy sequence data. */
export interface ArchivedDeckMeta {
  refNumber: number; // primary key
  createdAt: string; // ISO; list sorts by this, descending
  deckMode: "loop" | "tnd" | "gallery";
  loopType?: string;
  length?: number;
  level?: number;
  period?: string;
  prop?: string;
  cardCount: number;
  words: string[];
}

/** Heavy payload — loaded only when a deck is opened. */
export interface ArchivedDeckPayload {
  refNumber: number; // primary key
  cards: DeckReleaseCard[];
  sequences: SequenceData[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!browser) return Promise.reject(new Error("IndexedDB not available"));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "refNumber" });
      }
      if (!db.objectStoreNames.contains(DECKS_STORE)) {
        db.createObjectStore(DECKS_STORE, { keyPath: "refNumber" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

/** Persist a generated deck (meta + heavy payload). Best-effort. */
export async function archiveDeck(
  meta: ArchivedDeckMeta,
  payload: ArchivedDeckPayload
): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, DECKS_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(META_STORE).put(meta);
      tx.objectStore(DECKS_STORE).put(payload);
    });
  } catch (err) {
    console.warn("[deck-archive] archiveDeck failed:", err);
  }
}

/** All archived deck meta rows, newest first. Reads only the light store. */
export async function listArchivedDecks(): Promise<ArchivedDeckMeta[]> {
  if (!browser) return [];
  try {
    const db = await getDB();
    const rows = await new Promise<ArchivedDeckMeta[]>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const request = tx.objectStore(META_STORE).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve((request.result as ArchivedDeckMeta[]) ?? []);
    });
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.warn("[deck-archive] listArchivedDecks failed:", err);
    return [];
  }
}

/** The full payload for one deck, or null if absent. */
export async function getArchivedDeck(
  refNumber: number
): Promise<ArchivedDeckPayload | null> {
  if (!browser) return null;
  try {
    const db = await getDB();
    return await new Promise<ArchivedDeckPayload | null>((resolve, reject) => {
      const tx = db.transaction(DECKS_STORE, "readonly");
      const request = tx.objectStore(DECKS_STORE).get(refNumber);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const payload = request.result as ArchivedDeckPayload | undefined;
        resolve(
          payload
            ? {
                ...payload,
                cards: payload.cards.map(normalizeDeckReleaseCard),
                sequences: payload.sequences.map(normalizeLegacySequence),
              }
            : null
        );
      };
    });
  } catch (err) {
    console.warn("[deck-archive] getArchivedDeck failed:", err);
    return null;
  }
}

/** Remove a deck from both stores. */
export async function deleteArchivedDeck(refNumber: number): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, DECKS_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(META_STORE).delete(refNumber);
      tx.objectStore(DECKS_STORE).delete(refNumber);
    });
  } catch (err) {
    console.warn("[deck-archive] deleteArchivedDeck failed:", err);
  }
}
