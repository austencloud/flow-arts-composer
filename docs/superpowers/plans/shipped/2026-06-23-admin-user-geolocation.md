# Admin User Geolocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show where logged-in users (real and anonymous) connect from, using Cloudflare IP-geo headers, surfaced as city/country on admin user cards and as pins on a reused community map.

**Architecture:** A root `+layout.server.ts` load reads Cloudflare edge geo headers and passes them to the client. `+layout.svelte` pushes that geo into the presence-tracker singleton, which writes `location` onto the RTDB presence record (live) and `lastLocation` onto the Firestore user doc (persistent last-known). The admin activity tracker carries `location` onto every merged user; `UserPresenceCard` renders a `City, CC` line and `ActiveUsersPanel` mounts a `User Map` section feeding users as generic pins to the existing `GlobalUserMap`.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@sveltejs/adapter-cloudflare`, Firebase RTDB + Firestore, Google Maps (via existing `GlobalUserMap`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-admin-user-geolocation-design.md`

**Deviation from spec (resolves spec open-item #2):** The persistent `lastLocation` write is owned by the **presence tracker**, not `user-document-manager`. The tracker already holds Firestore access (`getFirestoreInstance`, `doc`, `getDoc`) and is the single client-side place where geo lands, so both the RTDB `location` write and the Firestore `lastLocation` write live together. `user-document-manager` has no request/geo context and is left untouched.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/shared/presence/domain/models/presence-models.ts` | `PresenceLocation` type, `location?` on `UserPresence`, `parseCloudflareGeo()` pure helper, `formatLocationLabel()` pure helper |
| `src/routes/+layout.server.ts` | Read CF geo headers → return `{ geo }` |
| `src/routes/+layout.svelte` | Push `data.geo` into presence-tracker singleton |
| `src/lib/shared/presence/services/presence-tracker.ts` | `setLocation()`; write `location` to RTDB + `lastLocation` to user doc on `initialize()` |
| `src/lib/features/admin/services/types.ts` | `lastLocation` on `CachedUserMetadata` |
| `src/lib/features/admin/services/system-state-manager.ts` | Parse `lastLocation` from user doc |
| `src/lib/features/admin/services/user-activity-tracker.ts` | Read `lastLocation`, carry `location` onto merged records |
| `src/lib/features/admin/services/user-pins.ts` | `buildUserPins()` pure derivation (new, testable) |
| `src/lib/features/admin/components/active-users/UserPresenceCard.svelte` | Reserved `City, CC` location line |
| `src/lib/features/admin/components/ActiveUsersPanel.svelte` | `User Map` section reusing `GlobalUserMap` |
| `messages/en.json` | New i18n keys |
| `tests/unit/presence-geo.test.ts` | `parseCloudflareGeo` + `formatLocationLabel` |
| `tests/unit/admin-user-pins.test.ts` | `buildUserPins` |

---

## Task 1: `PresenceLocation` type + pure helpers

**Files:**
- Modify: `src/lib/shared/presence/domain/models/presence-models.ts`
- Test: `tests/unit/presence-geo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/presence-geo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseCloudflareGeo,
  formatLocationLabel,
} from "$lib/shared/presence/domain/models/presence-models";

describe("parseCloudflareGeo", () => {
  const h = (entries: Record<string, string>) => new Headers(entries);

  it("returns null when no geo headers present", () => {
    expect(parseCloudflareGeo(h({}))).toBeNull();
  });

  it("parses country/city/lat/lng", () => {
    const geo = parseCloudflareGeo(
      h({
        "cf-ipcountry": "DE",
        "cf-ipcity": "Berlin",
        "cf-iplatitude": "52.52",
        "cf-iplongitude": "13.405",
      })
    );
    expect(geo).toEqual({ country: "DE", city: "Berlin", lat: 52.52, lng: 13.405 });
  });

  it("returns geo with nulls for missing coords but present country", () => {
    const geo = parseCloudflareGeo(h({ "cf-ipcountry": "US" }));
    expect(geo).toEqual({ country: "US", city: null, lat: null, lng: null });
  });

  it("ignores non-finite coords", () => {
    const geo = parseCloudflareGeo(
      h({ "cf-ipcountry": "US", "cf-iplatitude": "abc", "cf-iplongitude": "" })
    );
    expect(geo?.lat).toBeNull();
    expect(geo?.lng).toBeNull();
  });
});

describe("formatLocationLabel", () => {
  it("formats city + country", () => {
    expect(formatLocationLabel({ city: "Berlin", country: "DE", lat: 1, lng: 2 })).toBe(
      "Berlin, DE"
    );
  });
  it("country only when no city", () => {
    expect(formatLocationLabel({ city: null, country: "US", lat: null, lng: null })).toBe(
      "US"
    );
  });
  it("empty string when neither", () => {
    expect(formatLocationLabel(null)).toBe("");
    expect(formatLocationLabel({ city: null, country: null, lat: 1, lng: 2 })).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/presence-geo.test.ts`
Expected: FAIL — `parseCloudflareGeo`/`formatLocationLabel` not exported.

- [ ] **Step 3: Add type + helpers**

In `presence-models.ts`, add near the top-level type declarations:

```ts
/** Coarse IP-derived location (admin view). City-level, not precise. */
export interface PresenceLocation {
  city: string | null;
  country: string | null; // ISO-2, e.g. "DE"; CF sentinels ("XX","T1") pass through
  lat: number | null;
  lng: number | null;
}

/** Parse Cloudflare edge geo headers into a PresenceLocation, or null if none present. */
export function parseCloudflareGeo(headers: Headers): PresenceLocation | null {
  const parseCoord = (v: string | null): number | null => {
    if (!v) return null;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const country = headers.get("cf-ipcountry") || null;
  const city = headers.get("cf-ipcity") || null;
  const lat = parseCoord(headers.get("cf-iplatitude"));
  const lng = parseCoord(headers.get("cf-iplongitude"));
  const hasGeo = !!(country || city || (lat !== null && lng !== null));
  return hasGeo ? { city, country, lat, lng } : null;
}

/** Human label for a location: "City, CC" / "CC" / "". */
export function formatLocationLabel(loc: PresenceLocation | null | undefined): string {
  if (!loc) return "";
  if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
  if (loc.country) return loc.country;
  if (loc.city) return loc.city;
  return "";
}
```

Add `location?: PresenceLocation;` to the `UserPresence` interface (alongside the existing admin-view optional fields like `isAnonymous`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/presence-geo.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/presence/domain/models/presence-models.ts tests/unit/presence-geo.test.ts
git commit -m "feat(presence): PresenceLocation type + CF geo parse/label helpers" -- src/lib/shared/presence/domain/models/presence-models.ts tests/unit/presence-geo.test.ts
```

---

## Task 2: Capture geo in root layout server load

**Files:**
- Modify: `src/routes/+layout.server.ts`

- [ ] **Step 1: Replace the empty file**

`src/routes/+layout.server.ts` is currently a one-line comment. Replace its contents:

```ts
import type { LayoutServerLoad } from "./$types";
import { parseCloudflareGeo } from "$lib/shared/presence/domain/models/presence-models";

export const load: LayoutServerLoad = ({ request }) => {
  return { geo: parseCloudflareGeo(request.headers) };
};
```

- [ ] **Step 2: Verify types**

Run: `npm run check:fast`
Expected: no new errors referencing `+layout.server.ts` or `geo`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.server.ts
git commit -m "feat(geo): read Cloudflare IP-geo headers in root layout load" -- src/routes/+layout.server.ts
```

---

## Task 3: Presence tracker writes location (RTDB) + lastLocation (Firestore)

**Files:**
- Modify: `src/lib/shared/presence/services/presence-tracker.ts`

- [ ] **Step 1: Add imports and a pending-location field**

At the top of `presence-tracker.ts`, extend the firestore import (currently `import { doc, getDoc } from "firebase/firestore";`) to include the write helpers:

```ts
import { doc, getDoc, setDoc, serverTimestamp as fsServerTimestamp } from "firebase/firestore";
```

Note: RTDB's `serverTimestamp` is already imported from `firebase/database`. Alias the Firestore one as `fsServerTimestamp` to avoid the name clash.

Add the `PresenceLocation` type to the existing type import from `../domain/models/presence-models`:

```ts
import type {
  UserPresence,
  UserPresenceWithId,
  PresenceStats,
  ActivityStatus,
  PresenceLocation,
} from "../domain/models/presence-models";
```

Add a private field to the class (near `private userDeleted = false;`):

```ts
private pendingLocation: PresenceLocation | null = null;
```

- [ ] **Step 2: Add `setLocation`**

Add this public method to the `PresenceTracker` class:

```ts
/**
 * Provide the caller's IP-derived location (from the layout server load).
 * Stored and written into the presence record + user doc on initialize().
 * Null is ignored so a prior good location is never clobbered.
 */
setLocation(location: PresenceLocation | null): void {
  if (!location) return;
  this.pendingLocation = location;
  // If already initialized this session, persist immediately.
  if (this.initialized) {
    void this.persistLocation();
  }
}
```

- [ ] **Step 3: Add `persistLocation` (writes both stores)**

Add this private method:

```ts
/** Write the pending location to the RTDB presence record and the user doc. */
private async persistLocation(): Promise<void> {
  const loc = this.pendingLocation;
  if (!loc) return;
  const user = auth.currentUser;
  if (!user) return;

  // 1) Live location on the presence record (for the map of online users).
  if (this.presenceRef && this.currentPresence) {
    this.currentPresence.location = loc;
    await update(this.presenceRef, { location: loc });
  }

  // 2) Persistent last-known location on the Firestore user doc.
  try {
    const firestore = await getFirestoreInstance();
    await setDoc(
      doc(firestore, "users", user.uid),
      { lastLocation: { ...loc, updatedAt: fsServerTimestamp() } },
      { merge: true }
    );
  } catch (error) {
    console.warn("[PresenceTracker] lastLocation write failed:", error);
  }
}
```

- [ ] **Step 4: Include location in the initial presence record**

In `initialize()`, add `location` to the `currentPresence` object literal (after the `device` line, before the spread of optional auth fields):

```ts
    this.currentPresence = {
      online: true,
      activityStatus: "active",
      lastActivity: now,
      lastSeen: now,
      currentModule: "create",
      currentTab: null,
      sessionId: this.getSessionId(),
      device: this.detectDevice(),
      ...(this.pendingLocation ? { location: this.pendingLocation } : {}),
      ...(user.displayName ? { displayName: user.displayName } : {}),
      ...(user.email ? { email: user.email } : {}),
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    };
```

Then, immediately after `this.initialized = true;` at the end of `initialize()`, persist the last-known copy to Firestore:

```ts
    this.initialized = true;

    // Persist last-known location to the user doc (non-blocking).
    if (this.pendingLocation) {
      void this.persistLocation();
    }
```

RTDB rejects `undefined` but accepts `null`, and `PresenceLocation` fields are `string|number|null` (never `undefined`), so writing the object directly is safe.

- [ ] **Step 5: Verify types**

Run: `npm run check:fast`
Expected: no new errors in `presence-tracker.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/presence/services/presence-tracker.ts
git commit -m "feat(presence): write IP location to presence record + user-doc lastLocation" -- src/lib/shared/presence/services/presence-tracker.ts
```

---

## Task 4: Push layout geo into the presence tracker

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Inspect how the layout consumes data**

Run: `grep -nE "let \{ data|\\$props\(\)|data\.|getPresenceTracker" src/routes/+layout.svelte`
Expected: confirms whether `data` is already destructured from `$props()`. If `data` is not yet destructured, add it to the existing `$props()` destructure (e.g. `let { children, data } = $props();`).

- [ ] **Step 2: Add the geo push**

Near the other boot logic in `+layout.svelte` `<script>`, add an import and an effect. The effect runs on the client whenever `data.geo` is available, handing it to the singleton (which holds it until presence initializes during auth boot):

```ts
import { getPresenceTracker } from "$lib/shared/presence/get-presence-tracker";

$effect(() => {
  if (data?.geo) {
    getPresenceTracker()?.setLocation(data.geo);
  }
});
```

Place the `import` with the other imports and the `$effect` in the top-level script (not inside a function), so it reacts to `data.geo`.

- [ ] **Step 3: Verify types + runtime boot**

Run: `npm run check:fast`
Expected: no new errors. (`data.geo` is typed from the layout load return.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat(geo): hand layout IP-geo to the presence tracker on boot" -- src/routes/+layout.svelte
```

---

## Task 5: Plumb `lastLocation` through the admin cache layer

**Files:**
- Modify: `src/lib/features/admin/services/types.ts`
- Modify: `src/lib/features/admin/services/system-state-manager.ts`

- [ ] **Step 1: Add `lastLocation` to `CachedUserMetadata`**

Run: `grep -nE "isAnonymous|interface CachedUserMetadata" src/lib/features/admin/services/types.ts`
Find the `CachedUserMetadata` interface (where `isAnonymous: boolean;` was added in the prior spec) and add:

```ts
  /** Persistent last-known IP location (admin view). */
  lastLocation?: import("$lib/shared/presence/domain/models/presence-models").PresenceLocation | null;
```

- [ ] **Step 2: Parse it in `parseUserDocument`**

Run: `grep -nE "isAnonymous|parseUserDocument" src/lib/features/admin/services/system-state-manager.ts`
In `parseUserDocument` (where `isAnonymous: (data["isAnonymous"] as boolean) ?? false` was added), add:

```ts
    lastLocation: (data["lastLocation"] as
      | import("$lib/shared/presence/domain/models/presence-models").PresenceLocation
      | undefined) ?? null,
```

- [ ] **Step 3: Verify types**

Run: `npm run check:fast`
Expected: no new errors in `types.ts` / `system-state-manager.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/admin/services/types.ts src/lib/features/admin/services/system-state-manager.ts
git commit -m "feat(admin): parse lastLocation into the user metadata cache" -- src/lib/features/admin/services/types.ts src/lib/features/admin/services/system-state-manager.ts
```

---

## Task 6: Carry `location` onto merged admin records

**Files:**
- Modify: `src/lib/features/admin/services/user-activity-tracker.ts`

- [ ] **Step 1: Read `lastLocation` into the firestore-user map**

In `subscribeToAllUsers`, the firestore snapshot loop builds `allFirestoreUsers` with `{ displayName, email, photoURL, isAnonymous }`. Extend the map's value type and the `.set(...)` call to include `lastLocation`:

```ts
const allFirestoreUsers: Map<
  string,
  {
    displayName: string;
    email: string;
    photoURL: string | null;
    isAnonymous: boolean;
    lastLocation: import("$lib/shared/presence/domain/models/presence-models").PresenceLocation | null;
  }
> = new Map();
```

In the `snapshot.docs.forEach`:

```ts
allFirestoreUsers.set(doc.id, {
  displayName: (data["displayName"] as string) ?? "Unknown",
  email: (data["email"] as string) ?? "",
  photoURL: (data["photoURL"] as string | null) ?? null,
  isAnonymous: (data["isAnonymous"] as boolean) ?? false,
  lastLocation:
    (data["lastLocation"] as
      | import("$lib/shared/presence/domain/models/presence-models").PresenceLocation
      | undefined) ?? null,
});
```

- [ ] **Step 2: Carry `location` onto both merge branches**

In `mergeAndNotify`, the has-presence branch spreads `...presence` then overrides admin fields; the no-presence branch builds a default. Add `location` to each, preferring live presence location then falling back to the doc's `lastLocation`.

Has-presence branch (after `isAnonymous: userData.isAnonymous,`):

```ts
          location: presence.location ?? userData.lastLocation,
```

No-presence branch (after `isAnonymous: userData.isAnonymous,`):

```ts
          location: userData.lastLocation,
```

- [ ] **Step 3: Verify types**

Run: `npm run check:fast`
Expected: no new errors. `location` is the optional field added to `UserPresence` in Task 1, so `UserPresenceWithId` accepts it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/admin/services/user-activity-tracker.ts
git commit -m "feat(admin): carry IP location onto merged user records" -- src/lib/features/admin/services/user-activity-tracker.ts
```

---

## Task 7: Location line on `UserPresenceCard`

**Files:**
- Modify: `src/lib/features/admin/components/active-users/UserPresenceCard.svelte`

- [ ] **Step 1: Compute the label**

In the `<script>`, import the formatter and derive the label:

```ts
import { formatLocationLabel } from "$lib/shared/presence/domain/models/presence-models";

let locationLabel = $derived(formatLocationLabel(user.location));
```

(Add the import next to the existing `formatActivityTime` import from the same module — combine into one import statement.)

- [ ] **Step 2: Render a reserved location line**

Inside the `.info` block, after the `.email` span, add:

```svelte
    <span class="geo" class:empty={!locationLabel}>
      {#if locationLabel}
        <i class="fas fa-earth-americas" aria-hidden="true"></i>
        {locationLabel}
      {/if}
    </span>
```

- [ ] **Step 3: Add reserved-height styles (no layout shift)**

In the `<style>` block, add (mirror the `.email` metadata styling, fixed height so empty and filled cards match):

```css
  .geo {
    min-height: 16px; /* reserved so cards without location are the same height */
    font-size: var(--font-size-compact);
    color: var(--theme-text-secondary, var(--theme-text-dim));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .geo.empty {
    /* keep the reserved height even with no content */
    visibility: hidden;
  }

  .geo i {
    font-size: var(--font-size-compact);
  }
```

- [ ] **Step 4: Verify types + visual**

Run: `npm run check:fast`
Expected: no new errors.

Manual: load admin Users with the dev server. Cards with a known `lastLocation` show `🌎 City, CC`; cards without show an empty same-height slot (no card-height jitter). Localhost has no CF geo, so verification of populated labels happens against prod data or a seeded `lastLocation` — note in the PR.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/admin/components/active-users/UserPresenceCard.svelte
git commit -m "feat(admin): show IP city/country on user cards, height-reserved" -- src/lib/features/admin/components/active-users/UserPresenceCard.svelte
```

---

## Task 8: `buildUserPins` pure derivation

**Files:**
- Create: `src/lib/features/admin/services/user-pins.ts`
- Test: `tests/unit/admin-user-pins.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-user-pins.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildUserPins } from "$lib/features/admin/services/user-pins";
import type { UserPresenceWithId } from "$lib/shared/presence/domain/models/presence-models";

const mk = (over: Partial<UserPresenceWithId>): UserPresenceWithId =>
  ({
    userId: "u1",
    displayName: "Alice",
    online: false,
    activityStatus: "offline",
    lastActivity: 0,
    lastSeen: 0,
    currentModule: "",
    currentTab: null,
    sessionId: "",
    device: "desktop",
    ...over,
  }) as UserPresenceWithId;

describe("buildUserPins", () => {
  it("skips users without coordinates", () => {
    const pins = buildUserPins([
      mk({ userId: "a", location: { city: "X", country: "US", lat: null, lng: null } }),
      mk({ userId: "b", location: null }),
    ]);
    expect(pins).toHaveLength(0);
  });

  it("builds a pin with label from city", () => {
    const pins = buildUserPins([
      mk({
        userId: "a",
        displayName: "Bob",
        location: { city: "Berlin", country: "DE", lat: 52.5, lng: 13.4 },
      }),
    ]);
    expect(pins[0]).toEqual({
      id: "a",
      lat: 52.5,
      lng: 13.4,
      label: "Bob · Berlin",
      styleClass: "pin",
    });
  });

  it("active users get pin-new; label falls back to displayName only", () => {
    const pins = buildUserPins([
      mk({
        userId: "a",
        displayName: "Cara",
        activityStatus: "active",
        location: { city: null, country: "US", lat: 1, lng: 2 },
      }),
    ]);
    expect(pins[0].styleClass).toBe("pin-new");
    expect(pins[0].label).toBe("Cara");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/admin-user-pins.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/features/admin/services/user-pins.ts`:

```ts
import type { UserPresenceWithId } from "$lib/shared/presence/domain/models/presence-models";

/** A generic map pin matching GlobalUserMap's `scanMarkers` prop shape. */
export interface UserMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  styleClass: "pin" | "pin-new";
}

/**
 * Build map pins from admin users that have finite coordinates. Active users
 * render as the pulsing "pin-new" so live connections stand out. Label is the
 * display name plus city when known. Pure for unit testing.
 */
export function buildUserPins(users: UserPresenceWithId[]): UserMapPin[] {
  const pins: UserMapPin[] = [];
  for (const u of users) {
    const lat = u.location?.lat;
    const lng = u.location?.lng;
    if (lat == null || lng == null) continue;
    const name = u.displayName ?? "User";
    const city = u.location?.city;
    pins.push({
      id: u.userId,
      lat,
      lng,
      label: city ? `${name} · ${city}` : name,
      styleClass: u.activityStatus === "active" ? "pin-new" : "pin",
    });
  }
  return pins;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/admin-user-pins.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/admin/services/user-pins.ts tests/unit/admin-user-pins.test.ts
git commit -m "feat(admin): buildUserPins derivation for the user map" -- src/lib/features/admin/services/user-pins.ts tests/unit/admin-user-pins.test.ts
```

---

## Task 9: i18n keys

**Files:**
- Modify: `messages/en.json`

- [ ] **Step 1: Add keys (alphabetical, in the `admin_*` block)**

Insert near the other `admin_` keys (keep the file's existing alphabetical ordering):

```json
  "admin_user_map": "User Map",
  "admin_user_map_hint": "Where signed-in users connect from (approximate)",
  "admin_user_map_key_missing": "Add PUBLIC_GOOGLE_MAPS_API_KEY to enable the user map.",
```

- [ ] **Step 2: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(admin): i18n keys for the user map section" -- messages/en.json
```

---

## Task 10: `User Map` section in `ActiveUsersPanel`

**Files:**
- Modify: `src/lib/features/admin/components/ActiveUsersPanel.svelte`

- [ ] **Step 1: Imports + derived pins + key**

In the `<script>` add:

```ts
import { env } from "$env/dynamic/public";
import GlobalUserMap from "$lib/features/community/components/GlobalUserMap.svelte";
import { buildUserPins } from "$lib/features/admin/services/user-pins";

const userPins = $derived(buildUserPins(users));
const mapsApiKey = $derived(env.PUBLIC_GOOGLE_MAPS_API_KEY ?? "");
const mapsKeyMissing = $derived(
  !mapsApiKey || mapsApiKey === "your-google-maps-api-key"
);
```

(`users` is the existing merged `$state` array in this component. The map uses ALL users with coordinates — real and anonymous — which is intended.)

- [ ] **Step 2: Render the section**

After the existing Anonymous Activity section (and before the `<UserDetailModal>`), add:

```svelte
<!-- User Map: where signed-in users connect from (IP geo) -->
{#if !isLoading && userPins.length > 0}
  <section class="user-map-section" aria-label={t("admin_user_map")}>
    <header class="user-map-header">
      <h3 class="user-map-title">{t("admin_user_map")}</h3>
      <p class="user-map-hint">{t("admin_user_map_hint")}</p>
    </header>
    {#if mapsKeyMissing}
      <p class="user-map-key-missing">{t("admin_user_map_key_missing")}</p>
    {:else}
      <div class="user-map-container">
        <GlobalUserMap
          locations={[]}
          userLocation={null}
          apiKey={mapsApiKey}
          scanMarkers={userPins}
          onScanMarkerClick={(id) => selectUser(id)}
        />
      </div>
    {/if}
  </section>
{/if}
```

`selectUser(id)` is the existing handler this component already uses to open `UserDetailModal` (confirm name with `grep -n "selectUser" src/lib/features/admin/components/ActiveUsersPanel.svelte`; if it differs, use the existing one).

- [ ] **Step 3: Styles**

In the `<style>` block, add (match the existing `.anon-activity` section conventions):

```css
  .user-map-section {
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke);
    padding: 1rem 1.5rem 1.5rem;
  }

  .user-map-header {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin-bottom: 0.75rem;
  }

  .user-map-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .user-map-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .user-map-key-missing {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .user-map-container {
    border-radius: 12px;
    overflow: hidden;
  }
```

- [ ] **Step 4: Verify types + build**

Run: `npm run check:fast`
Expected: no new errors. If `GlobalUserMap` requires props beyond those passed (it declares `locations`, `userLocation`, `apiKey` required; `scanMarkers`, `onScanMarkerClick`, `size` optional), the four passed satisfy it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/admin/components/ActiveUsersPanel.svelte
git commit -m "feat(admin): User Map section plotting IP locations via GlobalUserMap" -- src/lib/features/admin/components/ActiveUsersPanel.svelte
```

---

## Task 11: Full verification gate

- [ ] **Step 1: Full type check**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head`
Expected: no errors introduced by these files. Fix any that trace to this work; pre-existing warnings in unrelated files are out of scope.

- [ ] **Step 2: Run the new unit tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/presence-geo.test.ts tests/unit/admin-user-pins.test.ts`
Expected: all PASS.

- [ ] **Step 3: Runtime proof**

Because localhost has no Cloudflare headers, `geo` is null locally and no location renders — that is expected and not a failure. Verify against real data one of two ways:
  - **Prod/preview** (Cloudflare edge present): open admin → Users; confirm cards show `🌎 City, CC` and the User Map plots pins; an active user is the pulsing pin; clicking a pin opens the detail modal.
  - **Local seeded check**: temporarily write a `lastLocation` onto your own user doc via the Firebase MCP (`{ city, country, lat, lng, updatedAt }`), reload admin, confirm the card label + a map pin appear. Remove the seed after.

Capture a screenshot or the runtime confirmation per `verification-protocol.md` before claiming done.

- [ ] **Step 4: Final note**

No squash needed — each task committed atomically with an explicit pathspec.

---

## Self-Review Notes

- **Spec coverage:** Capture (Task 2), stamp presence + lastLocation (Task 3), layout push (Task 4), cache plumb (Task 5), merge carry (Task 6), card display (Task 7), map display (Tasks 8–10), i18n (Task 9), edge cases (null geo handled in Tasks 1/3, sentinel countries pass through Task 1, coords-without-city in Tasks 1/7/8). All spec sections mapped.
- **Deviation:** `lastLocation` written by the presence tracker, not `user-document-manager` — documented at the top; resolves spec open-item #2.
- **Type consistency:** `PresenceLocation` (Task 1) is the single shared type used by every later task; `UserMapPin` matches `GlobalUserMap`'s `scanMarkers` shape (`id/lat/lng/label/styleClass`); `buildUserPins` (Task 8) name matches its use in Task 10.
