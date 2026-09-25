import "@testing-library/jest-dom";
import { vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Serve root-relative URLs out of `static/`, the way the real server does.
//
// Bulk data (sequence snapshots, terrain fields, seed corpora) is FETCHED from
// `static/` rather than imported, so it stays out of the JS bundle. Under node
// a root-relative fetch has no base and throws ERR_INVALID_URL, which would
// force every test touching that data to hand-roll its own stub. This resolves
// `/data/x.json` to `static/data/x.json` on disk instead.
//
// The content-type matters: SimpleJsonCache treats a non-JSON content-type as
// "file not found", because SvelteKit answers missing static files with its
// HTML fallback at status 200.
// `process.cwd()`, not `import.meta.url`: vite transforms this setup file, so
// its `import.meta.url` is not a file:// URL the way the vitest config's is.
// Vitest resolves setupFiles against the repo root, which is the cwd here.
const STATIC_ROOT = path.resolve(process.cwd(), "static");
const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  svg: "image/svg+xml",
  txt: "text/plain",
};

const upstreamFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();

  if (!url.startsWith("/")) {
    if (!upstreamFetch) throw new Error(`No fetch available for ${url}`);
    return upstreamFetch(input, init);
  }

  try {
    // Strip any query string, then decode the way the real server does.
    // Callers encode non-ASCII file names, so β's special placements arrive
    // as %CE%B2_placements.json. A malformed escape throws URIError and a
    // decoded path that leaves static/ is refused; both answer 404 below.
    const relativePath = decodeURIComponent(url.slice(1).split("?")[0] ?? "");
    const filePath = path.join(STATIC_ROOT, relativePath);
    if (!filePath.startsWith(STATIC_ROOT + path.sep)) {
      throw new Error(`${url} resolves outside static/`);
    }
    const extension = relativePath.split(".").pop()?.toLowerCase() ?? "";
    const body = await readFile(filePath, "utf8");
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain" },
    });
  }
}) as typeof globalThis.fetch;

// Mock browser APIs BEFORE any imports that might use them
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: query === "(pointer: fine)" ? true : false, // Return true for pointer: fine
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock DOM APIs for document.
//
// Canvas elements need a working 2D context for tests that capture
// pixels (e.g. CanvasFrameCapturer). jsdom's built-in canvas returns
// null for getContext("2d") unless the native `canvas` package loads,
// which is unreliable on Windows. We return a lightweight canvas-like
// object with a fake 2D context whose getImageData produces a real
// ImageData of the requested size.

// Polyfill Blob.prototype.arrayBuffer — jsdom's Blob predates it, so any code
// or test that reads bytes back out of a generated Blob (PDF exports, image
// encoders, share intake) throws "blob.arrayBuffer is not a function" under
// jsdom while passing in a node environment. FileReader is what jsdom does
// implement, so route through it.
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

// Polyfill ImageData for environments where jsdom omits it. Mirrors
// the real browser constructor overloads so tests that previously
// installed their own per-file polyfill (e.g. video-trails detectors)
// keep working when they share the same global:
//   new ImageData(width, height)
//   new ImageData(data, width, height?)
if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
  class ImageDataShim {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      maybeHeight?: number
    ) {
      if (typeof dataOrWidth === "number") {
        // (width, height) — blank buffer.
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        // (data, width, height?) — derive height when omitted.
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height =
          maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight;
      }
    }
  }
  (globalThis as { ImageData?: unknown }).ImageData = ImageDataShim;
}
Object.defineProperty(document, "createElement", {
  writable: true,
  value: vi.fn().mockImplementation((tagName: string) => {
    if (tagName.toLowerCase() === "canvas") {
      const canvas = {
        tagName: "CANVAS",
        width: 0,
        height: 0,
        style: {},
        getContext: vi.fn().mockImplementation((kind: string) => {
          if (kind !== "2d") return null;
          return {
            fillStyle: "#000000",
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            getImageData: vi
              .fn()
              .mockImplementation(
                (_x: number, _y: number, w: number, h: number) =>
                  new ImageData(w, h)
              ),
          };
        }),
        toDataURL: vi.fn(() => "data:image/png;base64,"),
        toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob())),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      return canvas;
    }

    const element = {
      tagName: tagName.toUpperCase(),
      style: {},
      href: "",
      download: "",
      click: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      remove: vi.fn(),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      getAttribute: vi.fn(() => null),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    return element;
  }),
});

// Mock document.body if not already available
if (!document.body) {
  Object.defineProperty(document, "body", {
    writable: true,
    value: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  });
}

// Mock SvelteKit globals for tests
(globalThis as any).__SVELTEKIT_PAYLOAD__ = {
  data: {},
  nodes: [],
  errors: [],
};

// Mock $app/stores for SvelteKit
vi.mock("$app/stores", () => ({
  page: {
    subscribe: vi.fn(),
  },
  navigating: {
    subscribe: vi.fn(),
  },
  updated: {
    subscribe: vi.fn(),
  },
}));

// Mock $app/environment
vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));

// Mock Vite environment variables
vi.mock("$env/dynamic/public", () => ({
  env: {},
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_FIREBASE_API_KEY: "test-api-key",
  PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  PUBLIC_FIREBASE_PROJECT_ID: "test-project",
  PUBLIC_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
  PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  PUBLIC_FIREBASE_APP_ID: "1:123456789:web:abcdef",
  PUBLIC_POSTHOG_HOST: "https://test.posthog.com",
  PUBLIC_POSTHOG_KEY: "test-posthog-key",
  PUBLIC_POSTHOG_PROJECT_ID: "test-posthog-project",
}));

// Mock Firebase to prevent actual initialization
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ name: "[DEFAULT]" })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: "[DEFAULT]" })),
}));

vi.mock("firebase/auth", () => {
  const createMockAuth = () => ({
    currentUser: null,
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
  });

  return {
    getAuth: vi.fn(createMockAuth),
    initializeAuth: vi.fn(createMockAuth),
    browserLocalPersistence: {},
    browserPopupRedirectResolver: {},
    indexedDBLocalPersistence: {},
    inMemoryPersistence: {},
    setPersistence: vi.fn(() => Promise.resolve()),
    signInWithEmailAndPassword: vi.fn(() => Promise.resolve()),
    createUserWithEmailAndPassword: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    onAuthStateChanged: vi.fn(),
    GoogleAuthProvider: vi.fn(),
    signInWithPopup: vi.fn(() => Promise.resolve()),
  };
});

// FieldValue is a real exported class in firebase/firestore (see
// @firebase/firestore dist: `class FieldValue { ... }`, with
// DeleteFieldValueImpl/ServerTimestampFieldValueImpl/ArrayUnionFieldValueImpl/
// ArrayRemoveFieldValueImpl/NumericIncrementFieldValueImpl all extending it).
// firestore-helpers.ts's stripUndefined() does `value instanceof FieldValue`
// to pass sentinels through untouched — the mock MUST be a real class, and
// every sentinel factory below MUST return an instance of it, or that branch
// silently stops being exercised.
class MockFieldValue {
  readonly _methodName: string;
  constructor(methodName: string) {
    this._methodName = methodName;
  }
}

vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({
    type: "firestore",
    toJSON: () => ({}),
  })),
  getFirestore: vi.fn(() => ({
    type: "firestore",
    toJSON: () => ({}),
  })),
  // firebase.ts dynamically imports this in emulator mode. Without it the
  // import rejects, and vitest fails the run on the unhandled rejection even
  // when every assertion passes — matching connectFunctionsEmulator below.
  connectFirestoreEmulator: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  memoryLocalCache: vi.fn(() => ({})),
  FieldValue: MockFieldValue,
  serverTimestamp: vi.fn(() => new MockFieldValue("serverTimestamp")),
  increment: vi.fn(() => new MockFieldValue("increment")),
  arrayUnion: vi.fn(() => new MockFieldValue("arrayUnion")),
  arrayRemove: vi.fn(() => new MockFieldValue("arrayRemove")),
  deleteField: vi.fn(() => new MockFieldValue("deleteField")),
}));

vi.mock("firebase/database", () => ({
	getDatabase: vi.fn(() => ({ type: "database" })),
	connectDatabaseEmulator: vi.fn(),
	ref: vi.fn(),
	get: vi.fn(),
	set: vi.fn(),
	update: vi.fn(),
	remove: vi.fn(),
	onValue: vi.fn(),
	off: vi.fn(),
	onDisconnect: vi.fn(() => ({
		update: vi.fn(() => Promise.resolve()),
		set: vi.fn(() => Promise.resolve()),
		cancel: vi.fn(() => Promise.resolve()),
	})),
	serverTimestamp: vi.fn(() => ({ ".sv": "timestamp" })),
}));

vi.mock("firebase/functions", () => ({
	getFunctions: vi.fn(() => ({ type: "functions" })),
	httpsCallable: vi.fn(() => vi.fn()),
	connectFunctionsEmulator: vi.fn(),
}));

vi.mock("firebase/analytics", () => ({
  getAnalytics: vi.fn(),
  logEvent: vi.fn(),
  isSupported: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({
    type: "storage",
  })),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

// Mock SequenceData to avoid loading the entire module graph
vi.mock(
  "../../src/lib/shared/foundation/domain/models/sequence-data",
  async (importOriginal) => {
    // Import the actual implementation to get all exports
    const actual =
      await importOriginal<
        typeof import("../../src/lib/shared/foundation/domain/models/sequence-data")
      >();
    return actual;
  }
);
