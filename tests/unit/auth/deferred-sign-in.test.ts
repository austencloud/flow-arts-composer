/**
 * Quiet sign-in on public pages (deferred-sign-in.ts).
 *
 * Both failures here are invisible. If a page never signs a returning visitor
 * in, their prop, color and grip changes stay on this device and are replaced
 * by their account's copy on their next app visit. If it signs everyone in, a
 * signed-out visitor pays for Firebase sign-in and a live feature-flag
 * listener on every visit. The site header starts it, and so do Shape Engine
 * and the sequence viewer, which have no header; all use the one saved-user
 * check. Embeds run inside other sites and must never start it.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { flushSync, mount, unmount, type Component } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chainTo, importGraph, repoPath } from "../../helpers/import-graph";

const auth = vi.hoisted(() => ({
  initialize: vi.fn(() => Promise.resolve()),
}));

// The real auth state restores the session through Firebase. What matters
// here is whether, and when, a page asks it to start.
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { initialize: auth.initialize },
}));

// The full Shape Engine app is irrelevant to sign-in and far too heavy to mount.
vi.mock("#lib/shared/shape-matrix/app/ShapeMatrixApp.svelte", () => ({
  default: () => {},
}));

const { hasSavedFirebaseUser, signInWhenIdle } =
  await import("#lib/shared/auth/services/deferred-sign-in.js");
const { default: SiteHeader } =
  await import("#lib/shared/landing/components/SiteHeader.svelte");
const { default: ShapeEnginePage } =
  await import("../../../src/routes/(public)/shape-engine/+page.svelte");
const { default: SequenceViewerRoute } =
  await import("../../../src/routes/sequence/[id]/+page.svelte");

// The viewer route renders only its head outside a browser; these are the
// fields that head reads.
const VIEWER_DATA = {
  seo: {
    title: "ABC",
    description: "A sequence",
    canonical: "https://tkaflowarts.com/sequence/abc",
    indexable: false,
  },
  meta: {},
};

// Firebase Auth's own storage layout (@firebase/auth, indexedDB persistence):
// database firebaseLocalStorageDb, store firebaseLocalStorage keyed by
// fbase_key, user record "firebase:authUser:<apiKey>:<appName>". "__sak" is the
// throwaway key Firebase writes to test that storage works.
const AUTH_DATABASE = "firebaseLocalStorageDb";
const AUTH_STORE = "firebaseLocalStorage";
const SAVED_USER_KEY = "firebase:authUser:test-api-key:[DEFAULT]";

function createFirebaseAuthDatabase(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUTH_DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(AUTH_STORE, { keyPath: "fbase_key" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(AUTH_STORE, "readwrite");
      for (const key of keys) {
        transaction
          .objectStore(AUTH_STORE)
          .put({ fbase_key: key, value: { uid: "user-1" } });
      }
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((database) => database.name ?? "");
}

let idleQueue: Array<(() => void) | null> = [];

function runIdleCallbacks(): void {
  const due = idleQueue;
  idleQueue = [];
  for (const callback of due) callback?.();
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  auth.initialize.mockClear();
  idleQueue = [];
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
    idleQueue.push(callback);
    return idleQueue.length;
  });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => {
    idleQueue[handle - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("saved-session check", () => {
  it("finds the user Firebase saved in IndexedDB", async () => {
    await createFirebaseAuthDatabase(["__sak", SAVED_USER_KEY]);
    expect(await hasSavedFirebaseUser()).toBe(true);
  });

  it("finds the user Firebase saved in localStorage on Safari and iOS, where its database never exists", async () => {
    // WebKit keeps the session in localStorage (indexeddb-persistence-policy.ts).
    // The site header once asked only whether the database existed, and so
    // never signed a Safari or iOS visitor in.
    localStorage.setItem(SAVED_USER_KEY, JSON.stringify({ uid: "user-1" }));
    expect(await hasSavedFirebaseUser()).toBe(true);
    expect(await databaseNames()).not.toContain(AUTH_DATABASE);
  });

  it("says no once the user has signed out, although Firebase's database stays", async () => {
    // Signing out deletes the user record and keeps the database, and any
    // page that loads Firebase creates the database for signed-out visitors.
    await createFirebaseAuthDatabase(["__sak"]);
    expect(await hasSavedFirebaseUser()).toBe(false);
    expect(await databaseNames()).toContain(AUTH_DATABASE);
  });

  it("never creates Firebase's database for a first-time visitor", async () => {
    expect(await hasSavedFirebaseUser()).toBe(false);
    expect(await databaseNames()).not.toContain(AUTH_DATABASE);
  });
});

describe("signInWhenIdle", () => {
  it("starts the shared auth state once, and only after the page goes idle", async () => {
    const onProbed = vi.fn();
    signInWhenIdle({ hasSession: async () => true, onProbed, label: "test" });

    await vi.waitFor(() => expect(onProbed).toHaveBeenCalledWith(true));
    expect(auth.initialize).not.toHaveBeenCalled();

    runIdleCallbacks();
    await vi.waitFor(() => expect(auth.initialize).toHaveBeenCalledTimes(1));
  });

  it("schedules nothing for a visitor without a session", async () => {
    const onProbed = vi.fn();
    signInWhenIdle({ hasSession: async () => false, onProbed, label: "test" });

    await vi.waitFor(() => expect(onProbed).toHaveBeenCalledWith(false));
    expect(idleQueue).toEqual([]);
    expect(auth.initialize).not.toHaveBeenCalled();
  });

  it("drops a start still waiting for idle time when the page unmounts", async () => {
    const onProbed = vi.fn();
    const signIn = vi.fn(() => Promise.resolve());
    const stop = signInWhenIdle({
      hasSession: async () => true,
      onProbed,
      signIn,
      label: "test",
    });
    await vi.waitFor(() => expect(onProbed).toHaveBeenCalled());

    stop();
    runIdleCallbacks();
    expect(signIn).not.toHaveBeenCalled();
  });
});

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/** Registers the hooks that mount `component` fresh in each test of a block. */
function mountEachTest(
  component: Component<any>,
  props: Record<string, unknown> = {}
): () => void {
  let stubbedCreateElement: typeof document.createElement;
  let mounted: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
  });

  afterEach(() => {
    if (mounted) unmount(mounted);
    mounted = null;
    document.body.innerHTML = "";
    document.createElement = stubbedCreateElement;
  });

  return () => {
    const host = realCreateElement.call(document, "div");
    document.body.append(host);
    mounted = mount(component, { target: host, props });
    flushSync();
  };
}

describe("site header", () => {
  const mountHeader = mountEachTest(SiteHeader);
  const signInButton = () =>
    document.querySelector<HTMLButtonElement>(".desktop-nav button.signin");

  it.each([
    [
      "in IndexedDB",
      () => createFirebaseAuthDatabase(["__sak", SAVED_USER_KEY]),
    ],
    [
      "in localStorage, as on Safari and iOS",
      async () =>
        localStorage.setItem(SAVED_USER_KEY, JSON.stringify({ uid: "user-1" })),
    ],
  ])(
    "signs a returning visitor in at idle time, with their session %s",
    async (_where, saveSession) => {
      await saveSession();
      mountHeader();

      await vi.waitFor(() => expect(idleQueue).toHaveLength(1));
      expect(auth.initialize).not.toHaveBeenCalled();

      runIdleCallbacks();
      await vi.waitFor(() => expect(auth.initialize).toHaveBeenCalledTimes(1));
    }
  );

  it("offers a signed-out visitor Sign in at once, without loading sign-in, although Firebase's database exists", async () => {
    await createFirebaseAuthDatabase(["__sak"]);
    mountHeader();

    // The button replaces the placeholder only once the check has answered no.
    await vi.waitFor(() => expect(signInButton()).not.toBeNull());
    expect(idleQueue).toEqual([]);
    expect(auth.initialize).not.toHaveBeenCalled();
  });
});

describe("Shape Engine page", () => {
  const mountPage = mountEachTest(ShapeEnginePage);

  it("signs a returning visitor in at idle time, as the site header does", async () => {
    await createFirebaseAuthDatabase(["__sak", SAVED_USER_KEY]);
    mountPage();

    await vi.waitFor(() => expect(idleQueue).toHaveLength(1));
    expect(auth.initialize).not.toHaveBeenCalled();

    runIdleCallbacks();
    await vi.waitFor(() => expect(auth.initialize).toHaveBeenCalledTimes(1));
  });

  it("leaves a signed-out visitor alone although Firebase's database exists", async () => {
    await createFirebaseAuthDatabase(["__sak"]);
    mountPage();

    // The page's check started first, so once this identical one has
    // answered, the page's has answered too, and a start would be queued.
    expect(await hasSavedFirebaseUser()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idleQueue).toEqual([]);
    expect(auth.initialize).not.toHaveBeenCalled();
  });
});

describe("sequence viewer page", () => {
  const mountPage = mountEachTest(SequenceViewerRoute, { data: VIEWER_DATA });

  it("signs a returning visitor in at idle time, as the site header does", async () => {
    await createFirebaseAuthDatabase(["__sak", SAVED_USER_KEY]);
    mountPage();

    await vi.waitFor(() => expect(idleQueue).toHaveLength(1));
    expect(auth.initialize).not.toHaveBeenCalled();

    runIdleCallbacks();
    await vi.waitFor(() => expect(auth.initialize).toHaveBeenCalledTimes(1));
  });

  it("leaves a signed-out visitor alone although Firebase's database exists", async () => {
    await createFirebaseAuthDatabase(["__sak"]);
    mountPage();

    expect(await hasSavedFirebaseUser()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idleQueue).toEqual([]);
    expect(auth.initialize).not.toHaveBeenCalled();
  });
});

describe("who can start the quiet sign-in", () => {
  const SIGN_IN = repoPath("src/lib/shared/auth/services/deferred-sign-in.ts");

  // importGraph walks the repository's source one readFileSync at a time: 0.7
  // to 2.9 s per test with the cores free (ten-file run, 2026-10-09), and five
  // to eight times that under the full suite's 31 forks, where on 2026-10-08
  // one full run blew the 30 s default. The walk lives in
  // tests/helpers/import-graph.ts and serves other contracts, so this file
  // budgets the scan, at the 120 s tests/unit/3d-animation gives a loaded
  // machine, rather than reshaping the helper.
  const GRAPH_TIMEOUT_MS = 120_000;

  it("is the one owner the site header, Shape Engine and the viewer all use", () => {
    for (const entry of [
      "src/lib/shared/landing/components/SiteHeader.svelte",
      "src/routes/(public)/shape-engine/+page.svelte",
      "src/routes/sequence/[id]/+page.svelte",
    ]) {
      expect(importGraph([repoPath(entry)]).files, entry).toContain(SIGN_IN);
    }
  }, GRAPH_TIMEOUT_MS);

  // Embeds run inside other people's sites and stay device-only. Dynamic
  // imports count: /embed/sequence loads its whole viewer that way.
  it.each([
    "src/routes/embed/spinner/+page.svelte",
    "src/routes/embed/sequence/+layout.svelte",
    "src/routes/embed/sequence/[id]/+page.svelte",
  ])("never reaches it from %s", (entry) => {
    const graph = importGraph([repoPath(entry)], { dynamic: true });
    expect(
      graph.files.has(SIGN_IN) ? chainTo(graph, SIGN_IN) : null
    ).toBeNull();
  }, GRAPH_TIMEOUT_MS);
});
