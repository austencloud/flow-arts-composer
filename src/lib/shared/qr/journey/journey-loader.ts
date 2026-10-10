/**
 * Reads the public, PII-free `journeyPoints` projection for a card and turns it
 * into renderable globe points. The admin `scanEvents` log stays private; this
 * reads only the coords/time the scanner-facing reveal needs.
 */
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { countryCentroid } from "#lib/features/choreo-card/components/scan-activity/country-centroids.js";

export interface JourneyRow {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  country?: string | null;
  timestamp: string;
}

export interface JourneyPoint {
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  timestamp: string;
}

/**
 * Resolve each row to a coordinate: exact lat/lng if present, else the country
 * centroid. Rows with no resolvable location are dropped. Order is preserved
 * (caller queries already time-ordered).
 */
export function rowsToJourneyPoints(rows: JourneyRow[]): JourneyPoint[] {
  const out: JourneyPoint[] = [];
  for (const r of rows) {
    let lat = r.lat ?? null;
    let lng = r.lng ?? null;
    if (lat == null || lng == null) {
      const centroid = countryCentroid(r.country);
      if (centroid) {
        lat = centroid[0];
        lng = centroid[1];
      }
    }
    if (lat == null || lng == null) continue;
    out.push({
      lat,
      lng,
      city: r.city ?? null,
      country: r.country ?? null,
      timestamp: r.timestamp,
    });
  }
  return out;
}

/** Gate the interstitial: a genuine scan with at least one mappable point. */
export function shouldShowJourney(opts: { genuine: boolean; pointCount: number }): boolean {
  return opts.genuine && opts.pointCount >= 1;
}

/**
 * Load a card's journey from the public projection. Filtered by printId when
 * the scan URL carried `?pid`; otherwise the whole code's points (the
 * "code-level journey" fallback). Time-ordered. Never throws — returns [] on
 * any failure so the reveal is never load-bearing.
 */
export async function loadJourney(
  code: string,
  printId: string | null
): Promise<JourneyPoint[]> {
  try {
    const firestore = await getFirestoreInstance();
    const ref = collection(firestore, "shortcodes", code, "journeyPoints");
    const q = printId
      ? query(ref, where("printId", "==", printId), orderBy("timestamp", "asc"))
      : query(ref, orderBy("timestamp", "asc"));
    const snap = await getDocs(q);
    const rows: JourneyRow[] = snap.docs.map((d) => {
      const data = d.data() as DocumentData;
      return {
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        city: data.city ?? null,
        country: data.country ?? null,
        timestamp: typeof data.timestamp === "string" ? data.timestamp : "",
      };
    });
    return rowsToJourneyPoints(rows);
  } catch {
    return [];
  }
}
