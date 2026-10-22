/**
 * One report per visit, so Austen hears when someone without an account finds
 * the site: where they are, how they got here, and what they opened first.
 *
 * The report goes to /api/visit, which adds the city and country from
 * Cloudflare and stores it; the pulseSiteVisit Cloud Function turns that into
 * an admin push. Signed-in members are left out (they already get "is back"
 * alerts), and so is any browser Austen has used as an admin.
 *
 * Deliberately Firebase-free: public pages never download Firebase, so a
 * signed-in member is recognized from the auth session Firebase left in this
 * browser's storage rather than by starting Auth.
 */

import { getCurrentPostHogSessionId } from "./posthog";

const LIVE_HOSTS: ReadonlySet<string> = new Set([
  "tkaflowarts.com",
  "www.tkaflowarts.com",
]);

/** A gap this long without a page load starts a new visit. */
const VISIT_GAP_MS = 30 * 60 * 1000;

/** QR-code landings already raise their own scan alert. */
const UNREPORTED_PREFIXES = ["/q/", "/admin"];

const STATE_KEY = "tka-visit-report";
const POSTHOG_WAIT_MS = 4000;

interface VisitState {
  /** Visits reported from this browser so far. */
  count: number;
  /** Last page load, epoch ms. */
  lastSeenAt: number;
  /** Set once an admin has signed in here; this browser never reports. */
  admin?: boolean;
}

function readState(): VisitState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<VisitState>) : {};
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      lastSeenAt: typeof parsed.lastSeenAt === "number" ? parsed.lastSeenAt : 0,
      ...(parsed.admin === true ? { admin: true } : {}),
    };
  } catch {
    return { count: 0, lastSeenAt: 0 };
  }
}

function writeState(state: VisitState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Private windows can refuse storage; the report still goes out.
  }
}

/**
 * Called once auth has settled in the app. An admin marks this browser so his
 * own visits stay quiet, even later when he is signed out on it.
 */
export function rememberAdminBrowser(isAdmin: boolean): void {
  if (!isAdmin) return;
  const state = readState();
  if (state.admin) return;
  writeState({ ...state, admin: true });
}

function isFullAccountRecord(value: unknown): boolean {
  const user = value as { isAnonymous?: unknown; uid?: unknown } | null;
  return !!user && typeof user.uid === "string" && user.isAnonymous !== true;
}

/** Firebase's localStorage persistence keys: firebase:authUser:<key>:<app>. */
function hasStoredFullAccount(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("firebase:authUser:")) continue;
      if (
        isFullAccountRecord(JSON.parse(localStorage.getItem(key) ?? "null"))
      ) {
        return true;
      }
    }
  } catch {
    // Unreadable storage reads as signed out.
  }
  return false;
}

/** Firebase's IndexedDB persistence: firebaseLocalStorageDb / firebaseLocalStorage. */
function hasIndexedDbFullAccount(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(false);
      const open = indexedDB.open("firebaseLocalStorageDb");
      // Never create the database here; Firebase owns its schema.
      open.onupgradeneeded = () => {
        open.transaction?.abort();
        resolve(false);
      };
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const db = open.result;
        try {
          if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
            db.close();
            return resolve(false);
          }
          const all = db
            .transaction("firebaseLocalStorage", "readonly")
            .objectStore("firebaseLocalStorage")
            .getAll();
          all.onsuccess = () => {
            const rows = all.result as Array<{
              fbase_key?: unknown;
              value?: unknown;
            }>;
            db.close();
            resolve(
              rows.some(
                (row) =>
                  typeof row.fbase_key === "string" &&
                  row.fbase_key.startsWith("firebase:authUser:") &&
                  isFullAccountRecord(row.value)
              )
            );
          };
          all.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
    } catch {
      resolve(false);
    }
  });
}

function utmTags(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const tags: Record<string, string> = {};
  for (const name of ["source", "medium", "campaign", "content", "term"]) {
    const value = params.get(`utm_${name}`);
    if (value) tags[name] = value;
  }
  return tags;
}

async function postHogSessionId(): Promise<string | null> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), POSTHOG_WAIT_MS)
  );
  try {
    return await Promise.race([getCurrentPostHogSessionId(), timeout]);
  } catch {
    return null;
  }
}

let started = false;

/** Report this visit if it is a new one from a visitor without an account. */
export async function reportVisit(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;

  if (!LIVE_HOSTS.has(location.hostname)) return;
  if (navigator.webdriver) return;
  const landingPath = location.pathname;
  if (UNREPORTED_PREFIXES.some((prefix) => landingPath.startsWith(prefix))) {
    return;
  }

  const state = readState();
  const now = Date.now();
  const isNewVisit = now - state.lastSeenAt > VISIT_GAP_MS;
  const next: VisitState = {
    ...state,
    lastSeenAt: now,
    count: isNewVisit ? state.count + 1 : state.count,
  };
  // Written before any await so a second tab opened a moment later sees this
  // visit as already reported.
  writeState(next);

  if (!isNewVisit || state.admin) return;
  if (hasStoredFullAccount() || (await hasIndexedDbFullAccount())) return;

  const report = {
    referrer: document.referrer,
    landingPath,
    utm: utmTags(location.search),
    visitNumber: next.count,
    sinceLastVisitMs: state.lastSeenAt ? now - state.lastSeenAt : null,
    postHogSessionId: await postHogSessionId(),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };

  fetch("/api/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {});
}
