# QR Card Journey Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a stranger scans a physical Choreo Card, show a viral "travel story" before the sequence plays — a 3D globe with animated arcs tracing where the card has been, plus a distance headline ("Seen in 14 cities · 3 countries · 8,400 km traveled").

**Architecture:** The scan path already logs per-card events with `printId` + geo. Add (1) a PII-free public `journeyPoints` projection written alongside the admin `scanEvents`, (2) a pure stats module + a thin Firestore reader, (3) animated arcs on the existing `globe.gl` component, (4) a new lazy-loaded interstitial `pageState` on `q/[code]` between `loading` and `playing`. Exact pins come from Cloudflare lat/lng headers, with a country-centroid fallback.

**Tech Stack:** SvelteKit (Svelte 5 runes), Firestore, `globe.gl ^2.45.3` (already code-split), Vitest, Firebase rules emulator.

**Spec:** `docs/superpowers/specs/2026-06-22-qr-card-journey-map-design.md`

---

## File Structure

**Create:**
- `src/lib/shared/qr/journey/journey-stats.ts` — pure math: haversine, total distance, unique cities/countries, arc segments.
- `src/lib/shared/qr/journey/journey-loader.ts` — `JourneyPoint` type, pure `rowsToJourneyPoints`, Firestore `loadJourney`.
- `src/routes/q/[code]/ScanJourneyInterstitial.svelte` — the reveal UI (lazy-loads the globe).
- `tests/unit/qr-journey/journey-stats.test.ts` — stats unit tests.
- `tests/unit/qr-journey/journey-loader.test.ts` — `rowsToJourneyPoints` + `shouldShowJourney` unit tests.

**Modify:**
- `src/routes/q/[code]/+page.server.ts` — add `lat`/`lng` to `geo` from Cloudflare headers.
- `src/lib/shared/qr/services/short-code-manager.ts:736-760` — add optional `lat`/`lng` to `logScanEvent`; add `logJourneyPoint`.
- `src/lib/features/choreo-card/components/scan-activity/ScanActivityGlobe.svelte` — add optional `arcs` prop wired to `globe.arcsData(...)`.
- `src/routes/q/[code]/+page.svelte` — `PageState` union + journey load + reuse single `isGenuineScan` result + interstitial render branch.
- `firestore.rules:937-941` — add public `journeyPoints` rule block under `shortcodes/{code}`.
- `firestore.indexes.json` — composite index on `journeyPoints` (`printId ASC, timestamp ASC`).
- `tests/integration/firestore-rules/firestore.rules.test.ts` — rule coverage for `journeyPoints`.

**Non-code prerequisite (Austen, not a task):** enable Cloudflare "Add visitor location headers" Managed Transform so `cf-iplatitude`/`cf-iplongitude` reach the server load. Centroid fallback ships without it; exact pins need it.

---

### Task 1: `journey-stats.ts` — pure math

**Files:**
- Create: `src/lib/shared/qr/journey/journey-stats.ts`
- Test: `tests/unit/qr-journey/journey-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/qr-journey/journey-stats.test.ts
import { describe, it, expect } from "vitest";
import {
  haversineKm,
  totalDistanceKm,
  uniqueCities,
  uniqueCountries,
  toArcs,
} from "$lib/shared/qr/journey/journey-stats";

describe("journey-stats", () => {
  const CHICAGO = { lat: 41.88, lng: -87.63 };
  const NYC = { lat: 40.71, lng: -74.01 };
  const LONDON = { lat: 51.51, lng: -0.13 };
  const PARIS = { lat: 48.86, lng: 2.35 };

  it("haversineKm matches known great-circle distance (Chicago→NYC ~1145km)", () => {
    expect(haversineKm(CHICAGO, NYC)).toBeGreaterThan(1125);
    expect(haversineKm(CHICAGO, NYC)).toBeLessThan(1165);
  });

  it("haversineKm is zero for identical points", () => {
    expect(haversineKm(CHICAGO, CHICAGO)).toBe(0);
  });

  it("totalDistanceKm sums consecutive hops", () => {
    const d = totalDistanceKm([CHICAGO, NYC, LONDON]);
    expect(d).toBeCloseTo(haversineKm(CHICAGO, NYC) + haversineKm(NYC, LONDON), 5);
  });

  it("totalDistanceKm is 0 for <2 points", () => {
    expect(totalDistanceKm([])).toBe(0);
    expect(totalDistanceKm([CHICAGO])).toBe(0);
  });

  it("uniqueCities dedups same city, counts distinct", () => {
    const pts = [
      { city: "Chicago", country: "US" },
      { city: "Chicago", country: "US" },
      { city: "Paris", country: "FR" },
      { city: null, country: "FR" },
    ];
    expect(uniqueCities(pts)).toBe(2);
  });

  it("uniqueCountries counts distinct non-null countries", () => {
    expect(
      uniqueCountries([{ country: "US" }, { country: "US" }, { country: "FR" }, { country: null }])
    ).toBe(2);
  });

  it("toArcs builds n-1 consecutive segments", () => {
    const arcs = toArcs([CHICAGO, NYC, LONDON]);
    expect(arcs).toHaveLength(2);
    expect(arcs[0]).toEqual({
      startLat: CHICAGO.lat, startLng: CHICAGO.lng, endLat: NYC.lat, endLng: NYC.lng,
    });
  });

  it("toArcs returns [] for 0 or 1 points", () => {
    expect(toArcs([])).toEqual([]);
    expect(toArcs([PARIS])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/qr-journey/journey-stats.test.ts`
Expected: FAIL — cannot resolve `$lib/shared/qr/journey/journey-stats`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/qr/journey/journey-stats.ts
/**
 * Pure journey math for the QR card travel-story reveal. No Firestore, no DOM —
 * unit-tested in isolation. Consumed by ScanJourneyInterstitial.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two coordinates, in kilometers. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of great-circle hops along an ordered path. 0 for <2 points. */
export function totalDistanceKm(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineKm(points[i - 1]!, points[i]!);
  }
  return sum;
}

/** Distinct (country:city) pairs with a non-null city. */
export function uniqueCities(
  points: { city: string | null; country: string | null }[]
): number {
  const set = new Set<string>();
  for (const p of points) {
    if (p.city) set.add(`${p.country ?? ""}:${p.city}`);
  }
  return set.size;
}

/** Distinct non-null country codes. */
export function uniqueCountries(points: { country: string | null }[]): number {
  const set = new Set<string>();
  for (const p of points) {
    if (p.country) set.add(p.country);
  }
  return set.size;
}

/** Consecutive-pair arc segments for globe.gl's arcsData layer. */
export function toArcs(points: LatLng[]): Arc[] {
  const arcs: Arc[] = [];
  for (let i = 1; i < points.length; i++) {
    arcs.push({
      startLat: points[i - 1]!.lat,
      startLng: points[i - 1]!.lng,
      endLat: points[i]!.lat,
      endLng: points[i]!.lng,
    });
  }
  return arcs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/qr-journey/journey-stats.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/qr/journey/journey-stats.ts tests/unit/qr-journey/journey-stats.test.ts
git commit -m "feat(qr): journey-stats pure module (haversine, distance, arcs)" -- src/lib/shared/qr/journey/journey-stats.ts tests/unit/qr-journey/journey-stats.test.ts
```

---

### Task 2: `journey-loader.ts` — `rowsToJourneyPoints` + `shouldShowJourney`

**Files:**
- Create: `src/lib/shared/qr/journey/journey-loader.ts`
- Test: `tests/unit/qr-journey/journey-loader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/qr-journey/journey-loader.test.ts
import { describe, it, expect } from "vitest";
import { rowsToJourneyPoints, shouldShowJourney } from "$lib/shared/qr/journey/journey-loader";

describe("rowsToJourneyPoints", () => {
  it("keeps rows with exact lat/lng", () => {
    const pts = rowsToJourneyPoints([
      { lat: 41.88, lng: -87.63, city: "Chicago", country: "US", timestamp: "2026-06-01T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ lat: 41.88, lng: -87.63, city: "Chicago", country: "US" });
  });

  it("falls back to country centroid when lat/lng missing", () => {
    const pts = rowsToJourneyPoints([
      { lat: null, lng: null, city: null, country: "US", timestamp: "2026-06-01T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(1);
    // US centroid from country-centroids.ts is [39.8, -98.6]
    expect(pts[0]!.lat).toBeCloseTo(39.8, 1);
    expect(pts[0]!.lng).toBeCloseTo(-98.6, 1);
  });

  it("drops rows with no resolvable location", () => {
    const pts = rowsToJourneyPoints([
      { lat: null, lng: null, city: null, country: null, timestamp: "2026-06-01T00:00:00Z" },
      { lat: null, lng: null, city: "Nowhere", country: "ZZ", timestamp: "2026-06-02T00:00:00Z" },
    ]);
    expect(pts).toHaveLength(0);
  });

  it("preserves input order", () => {
    const pts = rowsToJourneyPoints([
      { lat: 1, lng: 1, city: "A", country: "US", timestamp: "2026-06-01T00:00:00Z" },
      { lat: 2, lng: 2, city: "B", country: "US", timestamp: "2026-06-02T00:00:00Z" },
    ]);
    expect(pts.map((p) => p.city)).toEqual(["A", "B"]);
  });
});

describe("shouldShowJourney", () => {
  it("requires a genuine scan", () => {
    expect(shouldShowJourney({ genuine: false, pointCount: 5 })).toBe(false);
  });
  it("shows for genuine scan with at least one resolvable point", () => {
    expect(shouldShowJourney({ genuine: true, pointCount: 1 })).toBe(true);
    expect(shouldShowJourney({ genuine: true, pointCount: 2 })).toBe(true);
  });
  it("skips when there are no resolvable points", () => {
    expect(shouldShowJourney({ genuine: true, pointCount: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/qr-journey/journey-loader.test.ts`
Expected: FAIL — cannot resolve `journey-loader`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/qr/journey/journey-loader.ts
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
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { countryCentroid } from "$lib/features/choreo-card/components/scan-activity/country-centroids";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/qr-journey/journey-loader.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/qr/journey/journey-loader.ts tests/unit/qr-journey/journey-loader.test.ts
git commit -m "feat(qr): journey-loader (public projection read + decision gate)" -- src/lib/shared/qr/journey/journey-loader.ts tests/unit/qr-journey/journey-loader.test.ts
```

---

### Task 3: Server load — exact lat/lng from Cloudflare headers

**Files:**
- Modify: `src/routes/q/[code]/+page.server.ts:3-7`

- [ ] **Step 1: Add the header parse**

Replace the `geo` block (lines 4-7) with:

```ts
  const parseCoord = (v: string | null): number | null => {
    if (!v) return null;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const geo = {
    country: request.headers.get("cf-ipcountry") || null,
    city: request.headers.get("cf-ipcity") || null,
    lat: parseCoord(request.headers.get("cf-iplatitude")),
    lng: parseCoord(request.headers.get("cf-iplongitude")),
  };
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run check:fast`
Expected: no new errors in `q/[code]/+page.server.ts`. (`geo` shape now includes `lat`/`lng`; the page's `Props` type is updated in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add "src/routes/q/[code]/+page.server.ts"
git commit -m "feat(qr): capture exact lat/lng from Cloudflare geo headers" -- "src/routes/q/[code]/+page.server.ts"
```

---

### Task 4: `short-code-manager` — lat/lng on scanEvent + `logJourneyPoint`

**Files:**
- Modify: `src/lib/shared/qr/services/short-code-manager.ts:736-760`

- [ ] **Step 1: Add `lat`/`lng` to the `logScanEvent` event type**

In the `event` parameter object type (currently ending `deviceId: string;`), add two optional fields so existing callers that don't pass them still compile:

```ts
      userId: string | null;
      deviceId: string;
      lat?: number | null;
      lng?: number | null;
    }
```

The existing `addDoc({ ...event, timestamp })` already writes whatever is present — no body change needed for the write.

- [ ] **Step 2: Add `logJourneyPoint` right after `logScanEvent`**

```ts
  /**
   * Write the PII-free public journey projection for a scan. Separate from
   * logScanEvent (which is admin-only and carries deviceId/userAgent/referrer)
   * so the scanner-facing journey can be read publicly without exposing
   * fingerprinting data. Fire-and-forget — never blocks the scan UX.
   */
  async logJourneyPoint(
    code: string,
    point: {
      printId: string | null;
      lat: number | null;
      lng: number | null;
      city: string | null;
      country: string | null;
    }
  ): Promise<void> {
    try {
      const firestore = await this.ensureFirestore();
      const ref = collection(firestore, SHORTCODES_COLLECTION, code, "journeyPoints");
      await addDoc(ref, {
        ...point,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log journey point:", error);
    }
  }
```

(`collection` and `addDoc` are already imported at the top of the file.)

- [ ] **Step 3: Verify it typechecks**

Run: `npm run check:fast`
Expected: no new errors in `short-code-manager.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/qr/services/short-code-manager.ts
git commit -m "feat(qr): logJourneyPoint public projection + optional scanEvent coords" -- src/lib/shared/qr/services/short-code-manager.ts
```

---

### Task 5: Firestore rules + index for `journeyPoints`

**Files:**
- Modify: `firestore.rules:937-941`
- Modify: `firestore.indexes.json`
- Test: `tests/integration/firestore-rules/firestore.rules.test.ts`

- [ ] **Step 1: Add the rule block**

Inside `match /shortcodes/{code} { ... }`, directly after the existing `match /scanEvents/{eventId} { ... }` block (closes at line 941), add:

```
      // Public journey projection — PII-free (coords/time/printId only).
      // Readable by anyone so the scanner-facing card-journey reveal works
      // without auth; scanEvents above stays admin-only for the full record.
      match /journeyPoints/{pointId} {
        allow create: if true;
        allow read: if true;
        allow update, delete: if false;
      }
```

- [ ] **Step 2: Add the composite index**

In `firestore.indexes.json`, add to the `indexes` array:

```json
    {
      "collectionGroup": "journeyPoints",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "printId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "ASCENDING" }
      ]
    }
```

- [ ] **Step 3: Write the rules test**

Append to `tests/integration/firestore-rules/firestore.rules.test.ts` (follow the file's existing `describe`/`testEnv` helpers — match the surrounding style for getting authed/unauthed contexts):

```ts
describe("shortcodes/{code}/journeyPoints", () => {
  it("allows unauthenticated read (scanner-facing journey)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDocs(collection(db, "shortcodes", "ABCD", "journeyPoints"))
    );
  });

  it("allows unauthenticated create (fire-and-forget projection)", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      addDoc(collection(db, "shortcodes", "ABCD", "journeyPoints"), {
        printId: "p1", lat: 41.88, lng: -87.63, city: "Chicago",
        country: "US", timestamp: "2026-06-01T00:00:00Z",
      })
    );
  });

  it("forbids update and delete", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, "shortcodes", "ABCD", "journeyPoints", "x1");
    await assertFails(setDoc(ref, { lat: 1 }, { merge: true }));
    await assertFails(deleteDoc(ref));
  });
});
```

Ensure the imports used (`getDocs`, `collection`, `addDoc`, `doc`, `setDoc`, `deleteDoc`, `assertSucceeds`, `assertFails`) match what the test file already imports; add any missing ones to its import block.

- [ ] **Step 4: Run the rules test (needs the emulator)**

Run: `npm run test:rules`
Expected: PASS, including the three new `journeyPoints` cases. If the emulator is unavailable in this environment, note it and verify the rule syntax with `firebase deploy --only firestore:rules --dry-run` instead.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json tests/integration/firestore-rules/firestore.rules.test.ts
git commit -m "feat(qr): public journeyPoints rule + composite index" -- firestore.rules firestore.indexes.json tests/integration/firestore-rules/firestore.rules.test.ts
```

---

### Task 6: Extend `ScanActivityGlobe` with animated arcs

**Files:**
- Modify: `src/lib/features/choreo-card/components/scan-activity/ScanActivityGlobe.svelte`

- [ ] **Step 1: Add the `arcs` prop**

Update the props block (lines 19-25) to accept `arcs`:

```ts
  interface GlobeArc {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
  }

  let {
    points = [],
    arcs = [],
    height = 260,
  }: {
    points?: GlobePoint[];
    arcs?: GlobeArc[];
    height?: number;
  } = $props();
```

- [ ] **Step 2: Configure the arc layer in `onMount`**

In the `new Globe(container)` chain (after `.pointRadius("radius")`/`.pointLabel("label")`, before `.width(...)`), add:

```ts
      .arcsData(arcs)
      .arcColor(() => "#34d399")
      .arcStroke(0.6)
      .arcAltitudeAutoScale(0.4)
      .arcDashLength(0.5)
      .arcDashGap(0.4)
      .arcDashAnimateTime(2200)
```

- [ ] **Step 3: Keep arcs reactive**

Add a second `$effect` next to the existing `globe?.pointsData(enriched)` one (line 73-75):

```ts
  $effect(() => {
    globe?.arcsData(arcs);
  });
```

- [ ] **Step 4: Verify it typechecks and the creator tab still builds**

Run: `npm run check:fast`
Expected: no new errors. `arcs` defaults to `[]`, so the existing `ScanActivityTab` usage is unaffected (backward compatible).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/choreo-card/components/scan-activity/ScanActivityGlobe.svelte
git commit -m "feat(qr): animated arc paths on ScanActivityGlobe (opt-in prop)" -- src/lib/features/choreo-card/components/scan-activity/ScanActivityGlobe.svelte
```

---

### Task 7: `ScanJourneyInterstitial.svelte`

**Files:**
- Create: `src/routes/q/[code]/ScanJourneyInterstitial.svelte`

- [ ] **Step 1: Write the component**

```svelte
<!--
  ScanJourneyInterstitial.svelte

  The viral reveal shown on /q/[code] between loading and playing: a globe with
  the card's travel arcs + a distance headline. Lazy-loads the heavy globe.gl
  component so three.js only arrives with the reveal. Tap-to-skip + auto-advance.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    totalDistanceKm,
    uniqueCities,
    uniqueCountries,
    toArcs,
  } from "$lib/shared/qr/journey/journey-stats";
  import type { JourneyPoint } from "$lib/shared/qr/journey/journey-loader";
  import type { Component } from "svelte";

  let {
    points,
    word,
    onContinue,
  }: {
    points: JourneyPoint[];
    word: string;
    onContinue: () => void;
  } = $props();

  const hasPath = $derived(points.length >= 2);
  const distanceKm = $derived(Math.round(totalDistanceKm(points)));
  const cities = $derived(uniqueCities(points));
  const countries = $derived(uniqueCountries(points));
  const arcs = $derived(toArcs(points));

  const globePoints = $derived(
    points.map((p, i) => ({
      id: `${p.timestamp}-${i}`,
      lat: p.lat,
      lng: p.lng,
      label: p.city ?? p.country ?? "",
      newest: i === points.length - 1,
    }))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GlobeComp = $state<Component<any> | null>(null);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const AUTO_ADVANCE_MS = reduceMotion ? 6500 : 4500;

  onMount(() => {
    import(
      "$lib/features/choreo-card/components/scan-activity/ScanActivityGlobe.svelte"
    )
      .then((m) => (GlobeComp = m.default))
      .catch(() => {
        // Globe chunk failed — skip straight to the sequence.
        onContinue();
      });

    const timer = setTimeout(onContinue, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  });
</script>

<div class="journey" role="button" tabindex="0" onclick={onContinue} onkeydown={(e) => e.key === "Enter" && onContinue()}>
  <div class="globe-wrap">
    {#if GlobeComp && hasPath}
      <GlobeComp points={globePoints} {arcs} height={320} />
    {:else if GlobeComp}
      <GlobeComp points={globePoints} height={320} />
    {/if}
  </div>

  <div class="headline">
    {#if hasPath}
      <p class="lead">This card has traveled</p>
      <p class="stats">
        <span class="num">{cities}</span> cities ·
        <span class="num">{countries}</span> countries ·
        <span class="num">{distanceKm.toLocaleString()}</span> km
      </p>
    {:else}
      <p class="lead">You're the first to scan this card.</p>
      <p class="stats subtle">Its journey starts here.</p>
    {/if}
    <p class="word">{word}</p>
  </div>

  <button class="skip" onclick={(e) => { e.stopPropagation(); onContinue(); }}>
    Tap to continue →
  </button>
</div>

<style>
  .journey {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    background: radial-gradient(ellipse at center, #0a0f1f 0%, #050810 70%);
    color: #fff;
    cursor: pointer;
    padding: 1.5rem;
  }
  .globe-wrap {
    width: min(92vw, 420px);
    height: 320px;
  }
  .headline {
    text-align: center;
  }
  .lead {
    margin: 0;
    font-size: 0.95rem;
    color: var(--theme-text-dim, #9aa4b2);
    letter-spacing: 0.02em;
  }
  .stats {
    margin: 0.35rem 0 0;
    font-size: 1.25rem;
    font-weight: 600;
    /* No layout shift as numbers vary in width. */
    font-variant-numeric: tabular-nums;
  }
  .stats.subtle {
    font-size: 1rem;
    font-weight: 400;
    color: var(--theme-text-dim, #9aa4b2);
  }
  .num {
    color: #34d399;
  }
  .word {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--theme-text-dim, #9aa4b2);
  }
  .skip {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    border-radius: 999px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
    min-height: 44px;
    cursor: pointer;
  }
  .skip:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run check:fast`
Expected: no new errors in `ScanJourneyInterstitial.svelte`.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/q/[code]/ScanJourneyInterstitial.svelte"
git commit -m "feat(qr): ScanJourneyInterstitial reveal (lazy globe, distance headline)" -- "src/routes/q/[code]/ScanJourneyInterstitial.svelte"
```

---

### Task 8: Wire the interstitial into `q/[code]/+page.svelte`

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte` (imports, `Props` geo type, `PageState`, onMount scan block, template)

- [ ] **Step 1: Add imports**

After the existing `getDeviceId` import (line 37), add:

```ts
  import { loadJourney, shouldShowJourney, rowsToJourneyPoints, type JourneyPoint } from "$lib/shared/qr/journey/journey-loader";
```

- [ ] **Step 2: Extend the `Props` geo type**

Update the `geo` field in the `Props` interface (line 66):

```ts
      geo: { country: string | null; city: string | null; lat: number | null; lng: number | null };
```

- [ ] **Step 3: Extend the `PageState` union**

Update (lines 80-83):

```ts
  type PageState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "journey"; word: string; points: JourneyPoint[] }
    | { kind: "playing"; word: string };
```

- [ ] **Step 4: Rework the scan-logging block to reuse one `isGenuineScan` and load the journey**

Replace the block at lines 497-525 (the `if (!isInlineEncoded(shortCode) && isGenuineScan(shortCode)) { ... }`) with:

```ts
      // isGenuineScan side-effects sessionStorage and returns false on a 2nd
      // call — so compute it ONCE and reuse for both telemetry and the journey
      // gate. Calling it again would always return false.
      const genuine = !isInlineEncoded(shortCode) && isGenuineScan(shortCode);
      let journeyPoints: JourneyPoint[] = [];

      if (genuine) {
        const printId = page.url.searchParams.get("pid") || null;
        const geo = data?.geo;

        captureEvent("card_scanned", {
          short_code: shortCode,
          sequence_word: word,
          deck_id: data?.meta?.deckId || null,
          deck_name: data?.meta?.deckName || null,
          country: geo?.country || null,
          city: geo?.city || null,
        });

        shortCodeManager.incrementScanCount(shortCode).catch(() => {});
        void shortCodeManager
          .logScanEvent(shortCode, {
            printId,
            country: geo?.country ?? null,
            city: geo?.city ?? null,
            userAgent: navigator.userAgent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            referrer: document.referrer || null,
            userId: null,
            deviceId: getDeviceId(),
            lat: geo?.lat ?? null,
            lng: geo?.lng ?? null,
          })
          .catch(() => {});
        void shortCodeManager
          .logJourneyPoint(shortCode, {
            printId,
            lat: geo?.lat ?? null,
            lng: geo?.lng ?? null,
            city: geo?.city ?? null,
            country: geo?.country ?? null,
          })
          .catch(() => {});

        // Load prior journey + optimistically append this scan (the projection
        // write above may not have committed yet, and the scanner is the
        // newest dot).
        const prior = await loadJourney(shortCode, printId);
        const thisScan = rowsToJourneyPoints([
          {
            lat: geo?.lat ?? null,
            lng: geo?.lng ?? null,
            city: geo?.city ?? null,
            country: geo?.country ?? null,
            timestamp: new Date().toISOString(),
          },
        ]);
        journeyPoints = [...prior, ...thisScan];
      }
```

- [ ] **Step 5: Branch to journey vs playing at the end of the success path**

Replace lines 527-529 (`stopTrickle(); setProgress(100); pageState = { kind: "playing", word };`) with:

```ts
      stopTrickle();
      setProgress(100);

      if (shouldShowJourney({ genuine, pointCount: journeyPoints.length })) {
        pageState = { kind: "journey", word, points: journeyPoints };
      } else {
        pageState = { kind: "playing", word };
      }
```

- [ ] **Step 6: Add the journey render branch**

In the template, immediately before the `{:else if pageState.kind === "playing" ...}` branch (line 607), add:

```svelte
  {:else if pageState.kind === "journey"}
    {#await import("./ScanJourneyInterstitial.svelte") then { default: ScanJourneyInterstitial }}
      <ScanJourneyInterstitial
        points={pageState.points}
        word={pageState.word}
        onContinue={() => (pageState = { kind: "playing", word: seqWord })}
      />
    {/await}
```

(`seqWord` is already assigned at line 475 before this point, so the continue transition has the resolved word.)

- [ ] **Step 7: Full typecheck**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "q/\[code\]|journey|ScanJourney" /tmp/check.log`
Expected: no errors referencing the scan page or journey modules.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/q/[code]/+page.svelte"
git commit -m "feat(qr): journey interstitial state on scan landing (reuse genuine-scan)" -- "src/routes/q/[code]/+page.svelte"
```

---

### Task 9: Verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite for the new modules**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/qr-journey/`
Expected: all tests PASS.

- [ ] **Step 2: Full project check (one cold run, per fast-iteration rule)**

Run: `npm run check > /tmp/check.log 2>&1; grep -ciE "error" /tmp/check.log`
Expected: `0` (no errors). If non-zero, `grep -niE "error" /tmp/check.log`, fix, re-run once.

- [ ] **Step 3: Seed multi-city journey + verify the reveal (runtime evidence — verification-protocol)**

Seed a few `journeyPoints` for a test code via the Firebase MCP (or emulator), then load `https://localhost:5173/q/<code>?pid=<printId>` and either:
  - take a DevTools screenshot of the globe + headline (with explicit browser permission), OR
  - `evaluate_script` to assert `document.querySelector(".journey .stats")?.textContent` contains the expected city/country/km, OR
  - state plainly: "I can't verify the globe render without browser permission — please load `https://localhost:5173/q/<code>?pid=<printId>` and confirm the globe + 'N cities · M countries · X km' headline appears, then the sequence."

Do NOT claim the reveal works without one of these.

- [ ] **Step 4: Confirm code-split held (three.js not in the base scan bundle)**

Run: `npm run build:fast > /tmp/build.log 2>&1; grep -iE "three|globe" /tmp/build.log | head`
Expected: globe/three land in their own lazy chunk, not the `q/[code]` entry. Confirms the interstitial's dynamic import preserved the lean-page boundary.

---

## Self-Review

**Spec coverage:**
- Exact lat/lng capture → Task 3. ✅
- Public `journeyPoints` projection (not scanEvents) → Tasks 4, 5. ✅
- Per-printId journey query + composite index + public-read rule → Tasks 2, 5. ✅
- `journey-stats.ts` pure module → Task 1. ✅
- Extend globe with arcs → Task 6. ✅
- `ScanJourneyInterstitial` + new pageState between loading/playing → Tasks 7, 8. ✅
- Low-data state + reduced motion + no-layout-shift headline → Task 7. ✅
- Reuse single `isGenuineScan` result (side-effect gotcha) → Task 8 Step 4. ✅
- Optimistic append of current scan → Task 8 Step 4. ✅
- Error handling (journey never load-bearing; globe chunk failure → continue) → Tasks 2, 7. ✅
- Verification with runtime evidence → Task 9. ✅
- Cloudflare Managed Transform → noted as non-code prerequisite. ✅
- Out of scope (ordinal/rarity, creator paths, geocoders) → not built. ✅

**Type consistency:** `JourneyPoint` defined once in `journey-loader.ts`, imported by stats consumers and the interstitial. `GlobeArc`/`Arc` shape (`startLat/startLng/endLat/endLng`) identical across `journey-stats.toArcs`, the globe prop, and `.arcsData`. `shouldShowJourney({ genuine, pointCount })` signature matches its call in Task 8 Step 5. `logJourneyPoint(code, {printId,lat,lng,city,country})` signature matches the Task 8 call.

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output.
