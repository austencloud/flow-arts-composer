/**
 * festival-loader
 *
 * Handles filtered, paginated queries against the festivals collection.
 * Uses Firestore compound queries with optional region, time-window,
 * and seeking filters. Pagination is cursor-based via startAfter.
 *
 * Note: seekingInstructors / seekingPerformers filters require a composite
 * index in Firestore (status + seekingInstructors/seekingPerformers + dates.start).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { Festival } from "../domain/models/festival";
import type { FestivalFilters } from "./types";

const DEFAULT_PAGE_SIZE = 200;

export async function loadFestivals(
  filters: FestivalFilters,
  _pageSize = DEFAULT_PAGE_SIZE,
  _cursor?: unknown
): Promise<{ festivals: Festival[]; nextCursor: unknown | null }> {
  const db = await getFirestoreInstance();

  // Fetch all approved upcoming festivals in one query (collection is small,
  // ~65 entries). All other filtering is done client-side to avoid needing
  // composite Firestore indexes for every filter combination.
  const ref = collection(db, "festivals");
  const q = query(
    ref,
    where("moderationStatus", "==", "approved"),
    where("status", "==", "upcoming"),
    orderBy("dates.start"),
  );
  const snap = await getDocs(q);

  let festivals = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Festival));

  // Client-side filters
  if (filters.region) {
    festivals = festivals.filter((f) => f.region === filters.region);
  }

  if (filters.seeking === "instructors") {
    festivals = festivals.filter((f) => f.seekingInstructors);
  } else if (filters.seeking === "performers") {
    festivals = festivals.filter((f) => f.seekingPerformers);
  } else if (filters.seeking === "applications-open") {
    festivals = festivals.filter((f) => f.seekingInstructors || f.seekingPerformers);
  }

  if (filters.timeWindow && filters.timeWindow !== "upcoming") {
    const now = Timestamp.now();
    const cutoff = timeWindowCutoff(filters.timeWindow);
    festivals = festivals.filter((f) => {
      const start = f.dates.start;
      return start >= now && start <= cutoff;
    });
  }

  return { festivals, nextCursor: null };
}

export async function getByIds(ids: string[]): Promise<Festival[]> {
  if (ids.length === 0) return [];
  const db = await getFirestoreInstance();
  const snapshots = await Promise.all(
    ids.map((id) => getDoc(doc(db, "festivals", id)))
  );
  return snapshots
    .filter((s) => s.exists())
    .map((s) => ({ id: s.id, ...s.data() } as Festival));
}

function timeWindowCutoff(timeWindow: "3months" | "6months" | "year"): Timestamp {
  const date = new Date();
  if (timeWindow === "3months") date.setMonth(date.getMonth() + 3);
  else if (timeWindow === "6months") date.setMonth(date.getMonth() + 6);
  else date.setFullYear(date.getFullYear() + 1);
  return Timestamp.fromDate(date);
}
