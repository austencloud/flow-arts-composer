# Feature Video Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post Studio opens, edits and saves feature videos kept as folders on disk, from the Post tab and from the CLI alike.

**Architecture:** A dev-only, loopback-only store keeps each feature video as `<root>/<slug>/project.json`, with numbered history and a byte-range media route for its footage. `/post?feature=<slug>` opens the ordinary Post editor through a pluggable store, so the ordinary post for that sequence is never read or written. Saves are revision-checked PUTs: when the file changed on disk, disk wins and Undo brings back the editor's copy. The CLI edits through the open editor's bridge when an editor holds the project, and through a server ops route when none does.

**Tech Stack:** SvelteKit 2.61, Svelte 5 runes, Zod 4.3, Node `fs/promises`, Vitest (jsdom), ffmpeg/ffprobe 8.0.1.

**Spec:** `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md`, piece 1.

---

## Ground rules for every task

- Work only in `E:/worktrees/tka-platform/feature-video-projects` on branch `codex/feature-video-projects`. Never edit, stage or commit anything in `E:/tka-platform`.
- Never run `pnpm install` or `npm install`. Never delete, move or recreate `node_modules`: it is a junction into the primary checkout, and removing it empties the primary's packages.
- Never start a dev server and never touch port 5173. Tasks 6 and 16 belong to the coordinator; an implementer skips them.
- Run tests from the worktree root with `npx vitest run --config tests/config/vitest.config.ts <file>`. The config runs jsdom with Node's own `fetch`, `Request` and `Response`; do not add `@vitest-environment` comments.
- Commit only the paths the task names: `git add <paths>`, then `git commit -m "<message>" -- <paths>`. End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use `git add -A`, `git add .`, `git add -u`, `git stash`, `git reset --hard`, `git checkout --`, `git clean`, or any force flag.
- Format each touched file with `npx prettier --write <files>` before committing.
- Comments and user-facing messages use plain words: no em dashes, and none of robust, comprehensive, crucial, seamless, leverage, navigate, landscape, delve, utilize.
- When a command's output differs from the step's expected output for a reason the step does not explain, stop and report the output instead of improvising.

## Coordinator steps outside the tasks

The coordinator (the session running this plan) does these; implementers skip them.

- Before Task 1, pass the resource gate in `.claude/rules/resource-budget.md` (at least 4096 MB free, no other `svelte-check` running), then record which type errors already exist in the files this plan touches. Run in Git Bash from the worktree root:

  ```bash
  npm run check:fast -- --no-svelte-warnings 2>&1 | grep -E "feature-video|dev-loopback|post-editor-store|post-editor-history-store|post-editor-state|post-project-ops|post-project-bridge-guard|post-project-dev-bridge|post-project-dev-client|post-module-state|PostModule\.svelte|PostStudio\.svelte|PostEditorWorkspace\.svelte|api.dev.post-project" > "/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad/check-fast-plan1-before.txt"
  ```

  An empty file is a fine baseline. Task 16 runs the same command and compares.

- Task 6 (real footage in a real browser) and Task 16 (final checks and integration) run in the coordinator session.

## File map

New:

| File | Responsibility |
| --- | --- |
| `src/lib/shared/media-composition/domain/feature-video.ts` | Names, the `project.json` schema, media URLs, and moving media URLs to a copied project |
| `src/lib/server/dev-loopback.ts` | Dev-only, this-computer-only guard and JSON body reader shared by dev routes |
| `src/lib/server/feature-video-media.ts` | Safe media path resolution and byte-range responses |
| `src/lib/server/feature-video-store.ts` | The folder store: create, read, revision-checked write, history, list, named edits, duplicate |
| `src/routes/api/dev/feature-videos/+server.ts` | List and create |
| `src/routes/api/dev/feature-videos/[slug]/+server.ts` | Read and save |
| `src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts` | Media files with byte ranges |
| `src/routes/api/dev/feature-videos/[slug]/ops/+server.ts` | Named edits when no editor holds the project |
| `src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts` | Copy a project, such as a 30 s cut from the 60 s one |
| `src/lib/shared/media-composition/services/post-editor-store.ts` | The editor's storage port and the device (browser storage) implementation |
| `src/lib/shared/media-composition/services/feature-video-client.ts` | Browser side: list, load, the disk-backed editor store, save with conflict handling |
| `scripts/feature-video/media-import.mjs` | Probe and, when needed, transcode a take into a project's footage folder |

Modified:

| File | Change |
| --- | --- |
| `src/routes/api/dev/post-project/+server.ts` | Uses the shared guard and reader; the heartbeat carries a feature slug and answers with the disk revision |
| `src/lib/shared/media-composition/domain/post-project-ops.ts` | `add-take` and `remove-take` |
| `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts` | The bridge may add and remove feature video takes |
| `src/lib/server/post-project-dev-bridge.ts` | Sessions remember which feature video they hold |
| `src/lib/shared/media-composition/services/post-project-dev-client.ts` | Sends the feature slug; reports disk revisions |
| `src/lib/shared/media-composition/state/post-editor-state.svelte.ts` | Storage through the port; `adoptSaved` can take an older copy; bridge-added takes load at once |
| `src/lib/shared/media-composition/services/post-editor-history-store.ts` | Undo history storage under any key prefix |
| `src/lib/features/post/state/post-module-state.svelte.ts` | Feature video list and feature mode |
| `src/lib/features/post/PostModule.svelte` | `?feature=` routing and the "Feature videos" list |
| `src/lib/shared/share/components/post-studio/PostStudio.svelte` | Passes `feature` through |
| `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` | Feature store, bridge options, the disk-wins notice, no tab sync in feature mode |
| `scripts/post-project.mjs` | Feature video commands |
| `docs/development/post-studio-manifest-bridge.md`, `docs/architecture/canonical-capabilities.md` | How to use it, and where it lives |

Tests, all new in `tests/unit/media-composition/` unless noted: `feature-video-test-helpers.ts`, `feature-video-domain.test.ts`, `dev-loopback.test.ts`, `feature-video-media.test.ts`, `feature-video-store.test.ts`, `feature-video-routes.test.ts`, `feature-video-ops.test.ts`, `feature-video-bridge.test.ts`, `post-editor-store.test.ts`, `feature-video-client.test.ts`, `feature-video-media-import.test.ts`, `post-project-cli.test.ts`, and additions to `tests/unit/post-module-state.test.ts`.

---

### Task 1: Feature video names, files and media URLs

**Files:**
- Create: `src/lib/shared/media-composition/domain/feature-video.ts`
- Test: `tests/unit/media-composition/feature-video-domain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_FILE_FORMAT,
  FeatureVideoFileSchema,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
  rehomeFeatureMediaUrls,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  takeFileKey,
  type PostTake,
} from "$lib/shared/media-composition/domain/post-plan";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";

const NOW = 1_780_000_000_000;
const SEQUENCE = "DCK\u03a8-";

function featureTake(id: string, url: string): PostTake {
  const ref = { kind: "linked" as const, url };
  return {
    id,
    label: `Take ${id}`,
    ref,
    takeKey: takeFileKey(ref),
    durationSeconds: 10,
  };
}

function postWith(
  takes: PostTake[],
  extra: Partial<PostProject> = {}
): PostProject {
  return {
    ...createEmptyPostProject({ sequenceId: SEQUENCE, now: NOW }),
    takes,
    ...extra,
  };
}

describe("feature video names", () => {
  it.each(["promo-1-0", "a", "0", "promo-1-0-30s", "x".repeat(63)])(
    "accepts %s",
    (slug) => {
      expect(isFeatureVideoSlug(slug)).toBe(true);
    }
  );

  it.each([
    "",
    "-promo",
    "Promo",
    "promo_1",
    "promo 1",
    "../promo",
    "promo/1",
    "x".repeat(64),
    "\u00e9",
    5,
    null,
  ])("refuses %s", (slug) => {
    expect(isFeatureVideoSlug(slug)).toBe(false);
  });
});

describe("feature video media urls", () => {
  it("encodes each path segment", () => {
    expect(featureVideoMediaUrl("promo-1-0", "footage/take 03.mp4")).toBe(
      `${FEATURE_VIDEO_API}/promo-1-0/media/footage/take%2003.mp4`
    );
  });

  it("refuses a bad name or an empty path", () => {
    expect(() => featureVideoMediaUrl("Promo", "footage/a.mp4")).toThrow(
      '"Promo" is not a feature video name.'
    );
    expect(() => featureVideoMediaUrl("promo", "/")).toThrow(
      "A media path is required."
    );
  });

  it("recognizes only media urls of a well-named project", () => {
    expect(
      isFeatureVideoMediaUrl("/api/dev/feature-videos/promo/media/footage/a.mp4")
    ).toBe(true);
    expect(isFeatureVideoMediaUrl("/api/dev/feature-videos/promo/media/")).toBe(
      false
    );
    expect(
      isFeatureVideoMediaUrl("/api/dev/feature-videos/Promo/media/a.mp4")
    ).toBe(false);
    expect(
      isFeatureVideoMediaUrl(
        "https://example.test/api/dev/feature-videos/promo/media/a.mp4"
      )
    ).toBe(false);
    expect(isFeatureVideoMediaUrl("/api/dev/post-project")).toBe(false);
    expect(isFeatureVideoMediaUrl(42)).toBe(false);
  });
});

describe("moving media urls to a copied project", () => {
  const from = `${FEATURE_VIDEO_API}/promo-1-0/media/footage/a.mp4`;
  const to = `${FEATURE_VIDEO_API}/promo-1-0-30s/media/footage/a.mp4`;

  it("moves the project's own takes, their keys and their timing", () => {
    const own = featureTake("take-1", from);
    const project = postWith([own], {
      timings: {
        "take-1": createTakeTiming({
          sequenceId: SEQUENCE,
          takeKey: own.takeKey,
          durationSeconds: 10,
          now: NOW,
        }),
      },
    });
    const moved = rehomeFeatureMediaUrls(project, "promo-1-0", "promo-1-0-30s");
    expect(moved.takes[0]).toEqual({
      ...own,
      ref: { kind: "linked", url: to },
      takeKey: `linked:${to}`,
    });
    expect(moved.timings?.["take-1"]?.takeKey).toBe(`linked:${to}`);
  });

  it("keeps a take key that was chosen by hand", () => {
    const own = { ...featureTake("take-1", from), takeKey: "my-key" };
    const moved = rehomeFeatureMediaUrls(
      postWith([own]),
      "promo-1-0",
      "promo-1-0-30s"
    );
    expect(moved.takes[0]?.takeKey).toBe("my-key");
    expect(moved.takes[0]?.ref).toEqual({ kind: "linked", url: to });
  });

  it("leaves another project's media and outside links alone", () => {
    const longerName = featureTake("take-1", to);
    const outside = featureTake("take-2", "https://example.test/a.mp4");
    const project = postWith([longerName, outside]);
    expect(rehomeFeatureMediaUrls(project, "promo-1-0", "copy")).toEqual(
      project
    );
  });

  it("moves linked images too", () => {
    const image = {
      id: "image-1",
      label: "Logo",
      ref: {
        kind: "linked" as const,
        url: `${FEATURE_VIDEO_API}/promo-1-0/media/images/logo.png`,
      },
    };
    const moved = rehomeFeatureMediaUrls(
      postWith([], { images: [image] }),
      "promo-1-0",
      "copy"
    );
    expect(moved.images?.[0]?.ref).toEqual({
      kind: "linked",
      url: `${FEATURE_VIDEO_API}/copy/media/images/logo.png`,
    });
  });
});

describe("feature video file", () => {
  const file = {
    format: FEATURE_VIDEO_FILE_FORMAT,
    slug: "promo-1-0",
    title: "Promo 1.0",
    revision: 1,
    savedAt: NOW,
    project: postWith([]),
  };

  it("accepts a well-formed file", () => {
    expect(FeatureVideoFileSchema.safeParse(file).success).toBe(true);
  });

  it.each([
    ["an extra key", { ...file, extra: true }],
    ["revision 0", { ...file, revision: 0 }],
    ["a blank title", { ...file, title: "   " }],
    ["a bad name", { ...file, slug: "Promo" }],
    ["another format", { ...file, format: "feature-video-v2" }],
  ])("refuses %s", (_name, value) => {
    expect(FeatureVideoFileSchema.safeParse(value).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-domain.test.ts`
Expected: FAIL, with an error that `$lib/shared/media-composition/domain/feature-video` cannot be resolved.

- [ ] **Step 3: Write the module**

Create `src/lib/shared/media-composition/domain/feature-video.ts`:

```ts
import { z } from "zod";
import { takeFileKey } from "$lib/shared/media-composition/domain/post-plan";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * A feature video is a Post project kept as a folder on this computer, such
 * as a promo or a feature walkthrough, instead of as the one post each
 * sequence has. Only the dev server reads and writes the folder; nothing
 * here touches the account or this browser's saved posts.
 *
 *   <root>/<slug>/project.json   the post, its title and its revision
 *   <root>/<slug>/history/       each earlier save, as r000001.json and on
 *   <root>/<slug>/media/         footage, captures, music and images it plays
 *   <root>/<slug>/captures/      raw capture output before it becomes media
 *   <root>/<slug>/exports/       finished renders
 */

/** Lowercase letters, digits and dashes; it names the folder and the URL. */
export const FEATURE_VIDEO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const FEATURE_VIDEO_API = "/api/dev/feature-videos";
export const FEATURE_VIDEO_FILE_FORMAT = "feature-video-v1";
/** The largest project.json the dev server writes. */
export const FEATURE_VIDEO_MAX_FILE_BYTES = 12_000_000;
/** How many earlier saves history/ keeps. */
export const FEATURE_VIDEO_HISTORY_LIMIT = 200;
export const FEATURE_VIDEO_MEDIA_FOLDERS = [
  "footage",
  "captures",
  "music",
  "images",
] as const;
/** The media route serves only these kinds of file, with these types. */
export const FEATURE_VIDEO_MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const FeatureVideoFileSchema = z
  .object({
    format: z.literal(FEATURE_VIDEO_FILE_FORMAT),
    slug: z.string().regex(FEATURE_VIDEO_SLUG_PATTERN),
    title: z.string().trim().min(1).max(120),
    /** Goes up by one with each save; a save names the revision it started from. */
    revision: z.number().int().positive(),
    savedAt: z.number().finite(),
    project: PostProjectSchema,
  })
  .strict();

export type FeatureVideoFile = z.infer<typeof FeatureVideoFileSchema>;

export interface FeatureVideoSummary {
  slug: string;
  title: string;
  revision: number;
  savedAt: number;
  sequenceId: string;
}

export function isFeatureVideoSlug(value: unknown): value is string {
  return typeof value === "string" && FEATURE_VIDEO_SLUG_PATTERN.test(value);
}

/** The URL the editor plays a file in a project's media folder from. */
export function featureVideoMediaUrl(
  slug: string,
  relativePath: string
): string {
  if (!isFeatureVideoSlug(slug))
    throw new Error(`"${slug}" is not a feature video name.`);
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length === 0) throw new Error("A media path is required.");
  return `${FEATURE_VIDEO_API}/${slug}/media/${segments
    .map(encodeURIComponent)
    .join("/")}`;
}

const MEDIA_URL =
  /^\/api\/dev\/feature-videos\/[a-z0-9][a-z0-9-]{0,62}\/media\/.+$/;

export function isFeatureVideoMediaUrl(url: unknown): url is string {
  return typeof url === "string" && MEDIA_URL.test(url);
}

/**
 * The same post for a copy of its folder: the project's own media URLs point
 * into the copy. A take's key moves with its URL only when it was the key the
 * URL gave it, and the timing filed under that take follows. Anything else,
 * including another project's media, stays as it was.
 */
export function rehomeFeatureMediaUrls(
  project: PostProject,
  from: string,
  to: string
): PostProject {
  const prefix = `${FEATURE_VIDEO_API}/${from}/media/`;
  const target = `${FEATURE_VIDEO_API}/${to}/media/`;
  const move = (url: string) =>
    url.startsWith(prefix) ? target + url.slice(prefix.length) : url;
  const keyMoves = new Map<string, string>();
  const takes = project.takes.map((take) => {
    if (take.ref.kind !== "linked") return take;
    const url = move(take.ref.url);
    if (url === take.ref.url) return take;
    const ref = { kind: "linked" as const, url };
    if (take.takeKey !== takeFileKey(take.ref)) return { ...take, ref };
    const takeKey = takeFileKey(ref);
    keyMoves.set(take.takeKey, takeKey);
    return { ...take, ref, takeKey };
  });
  const timings =
    project.timings &&
    Object.fromEntries(
      Object.entries(project.timings).map(([takeId, timing]) => {
        const takeKey = keyMoves.get(timing.takeKey);
        return [takeId, takeKey ? { ...timing, takeKey } : timing];
      })
    );
  const images = project.images?.map((image) => {
    if (image.ref.kind !== "linked") return image;
    const url = move(image.ref.url);
    return url === image.ref.url
      ? image
      : { ...image, ref: { kind: "linked" as const, url } };
  });
  return {
    ...project,
    takes,
    ...(timings ? { timings } : {}),
    ...(images ? { images } : {}),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-domain.test.ts`
Expected: PASS, 29 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-domain.test.ts
git add src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-domain.test.ts
git commit -m "Name, file and media URL rules for feature videos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-domain.test.ts
```

---

### Task 2: Shared dev-route guard and JSON body reader

The post-project route already guards itself and reads its body inline. The feature video routes need the same two things, so both move into one server module and the post-project route uses it, with no change in behavior. GET and HEAD may come without an Origin header; any other method needs the page's own origin.

**Files:**
- Create: `src/lib/server/dev-loopback.ts`
- Modify: `src/routes/api/dev/post-project/+server.ts` (lines 1-75: the imports, `authorize`, and the inline body reader in `POST`)
- Create: `tests/unit/media-composition/feature-video-test-helpers.ts`
- Test: `tests/unit/media-composition/dev-loopback.test.ts`

- [ ] **Step 1: Write the test helpers**

Create `tests/unit/media-composition/feature-video-test-helpers.ts`:

```ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The origin route tests pretend the editor page has. */
export const ORIGIN = "http://localhost:5173";

export function tempFeatureRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "feature-videos-"));
}

export type RouteInit = RequestInit & {
  params?: Record<string, string>;
  /** The caller's address; this computer unless a test says otherwise. */
  client?: string;
  /** The Origin header; null sends none. */
  origin?: string | null;
};

/**
 * The parts of a SvelteKit request event the dev routes read. Pass it to a
 * handler as `routeEvent(...) as never`.
 */
export function routeEvent(pathname: string, init: RouteInit = {}) {
  const { params = {}, client = "::1", origin = ORIGIN, headers, ...rest } =
    init;
  const merged = new Headers({ accept: "application/json" });
  if (origin) merged.set("origin", origin);
  if (rest.body !== undefined && rest.body !== null)
    merged.set("content-type", "application/json");
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  const request = new Request(new URL(pathname, ORIGIN), {
    ...rest,
    headers: merged,
  });
  return {
    request,
    url: new URL(request.url),
    params,
    getClientAddress: () => client,
  };
}

/** The HTTP status a handler failed with; fails the test when it succeeded. */
export async function thrownStatus(run: () => unknown): Promise<number> {
  try {
    await run();
  } catch (cause) {
    if (cause && typeof cause === "object" && "status" in cause)
      return Number((cause as { status: unknown }).status);
    throw cause;
  }
  throw new Error("Expected the handler to fail.");
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/media-composition/dev-loopback.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import { POST as postProjectRoute } from "../../../src/routes/api/dev/post-project/+server";
import {
  routeEvent,
  thrownStatus,
  type RouteInit,
} from "./feature-video-test-helpers";

afterEach(() => {
  vi.doUnmock("$app/environment");
  vi.resetModules();
});

const PATH = "/api/dev/feature-videos";

describe("authorizeLoopback", () => {
  it("lets this computer read without an Origin header", () => {
    const { request, getClientAddress } = routeEvent(PATH, { origin: null });
    expect(() => authorizeLoopback(request, getClientAddress)).not.toThrow();
  });

  it("lets the page's own origin write", () => {
    const { request, getClientAddress } = routeEvent(PATH, {
      method: "POST",
      body: "{}",
    });
    expect(() => authorizeLoopback(request, getClientAddress)).not.toThrow();
  });

  it.each<[string, string, RouteInit]>([
    ["another host name", "http://example.test/api/dev/feature-videos", {}],
    ["a caller on another computer", PATH, { client: "203.0.113.5" }],
    ["another origin", PATH, { origin: "http://evil.test" }],
    [
      "a write without an Origin header",
      PATH,
      { method: "POST", body: "{}", origin: null },
    ],
  ])("refuses %s with 403", async (_name, pathname, init) => {
    const { request, getClientAddress } = routeEvent(pathname, init);
    expect(
      await thrownStatus(() => authorizeLoopback(request, getClientAddress))
    ).toBe(403);
  });

  it("answers 404 when the server is not a dev server", async () => {
    vi.resetModules();
    vi.doMock("$app/environment", () => ({
      dev: false,
      browser: false,
      building: false,
      version: "test",
    }));
    const { authorizeLoopback: guard } = await import(
      "$lib/server/dev-loopback"
    );
    const { request, getClientAddress } = routeEvent(PATH);
    expect(await thrownStatus(() => guard(request, getClientAddress))).toBe(
      404
    );
  });
});

describe("readJsonBody", () => {
  const post = (init: RouteInit) =>
    routeEvent(PATH, { method: "POST", ...init }).request;

  it("reads a JSON object", async () => {
    expect(await readJsonBody(post({ body: '{"a":1}' }))).toEqual({ a: 1 });
  });

  it.each<[string, RouteInit]>([
    ["no body", {}],
    ["broken JSON", { body: "{" }],
    ["a list", { body: "[1]" }],
  ])("refuses %s with 400", async (_name, init) => {
    expect(await thrownStatus(() => readJsonBody(post(init)))).toBe(400);
  });

  it("refuses a declared length over the limit with 413", async () => {
    const request = post({ body: "{}", headers: { "content-length": "65" } });
    expect(await thrownStatus(() => readJsonBody(request, 64))).toBe(413);
  });

  it("refuses a streamed body over the limit with 413", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"a":"${"x".repeat(100)}"}`));
        controller.close();
      },
    });
    const request = post({ body: stream, duplex: "half" } as RouteInit);
    expect(await thrownStatus(() => readJsonBody(request, 64))).toBe(413);
  });
});

describe("the post-project route after the move", () => {
  it("still answers a first heartbeat", async () => {
    const response = await postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId: randomUUID(),
          revision: 0,
          snapshot: createEmptyPostProject({
            sequenceId: "loopback-check",
            now: 1,
          }),
        }),
      }) as never
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ command: null });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/dev-loopback.test.ts`
Expected: FAIL, with an error that `$lib/server/dev-loopback` cannot be resolved.

- [ ] **Step 4: Write the module**

Create `src/lib/server/dev-loopback.ts`:

```ts
import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

/**
 * Guards for dev routes that read and write files on this computer. They
 * answer only on a dev server, only to this computer, and only to the page's
 * own origin, so another site open in the same browser cannot reach them.
 */

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LOCAL_CLIENTS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
/** The largest JSON body a dev route reads. */
export const DEV_JSON_LIMIT_BYTES = 12_000_000;

export function authorizeLoopback(
  request: Request,
  getClientAddress: () => string
): void {
  if (!dev) error(404, "Not found");
  const url = new URL(request.url);
  if (!LOCAL_HOSTS.includes(url.hostname)) error(403, "Local editor only");
  if (!LOCAL_CLIENTS.includes(getClientAddress()))
    error(403, "Local editor only");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) error(403, "Forbidden origin");
  const reading = request.method === "GET" || request.method === "HEAD";
  if (!reading && origin !== url.origin) error(403, "Origin required");
}

/** Reads a JSON object body, refusing one longer than `maxBytes`. */
export async function readJsonBody(
  request: Request,
  maxBytes = DEV_JSON_LIMIT_BYTES
): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    error(413, "Manifest too large");
  const reader = request.body?.getReader();
  if (!reader) error(400, "Missing request body");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel();
        error(413, "Manifest too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    error(400, "Invalid JSON");
  }
}
```

- [ ] **Step 5: Move the post-project route onto it**

In `src/routes/api/dev/post-project/+server.ts`, replace lines 1-24 (the `dev` import, the kit import, the bridge import and `function authorize`) with:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";
```

In `GET`, change `authorize(request, getClientAddress);` to `authorizeLoopback(request, getClientAddress);`.

In `POST`, replace everything from `authorize(request, getClientAddress);` down to and including the `catch { error(400, "Invalid JSON"); }` block (old lines 44-75) with:

```ts
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request);
```

The `try { if (input.kind === "heartbeat") ...` block below it stays exactly as it is.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/dev-loopback.test.ts tests/unit/media-composition/post-project-dev-bridge.test.ts src/routes/api/dev/post-project/post-project-route.test.ts`
Expected: PASS for all three files (dev-loopback: 14 tests). The route's existing access test (3 tests) proves the move kept its 404, 403 and 413 answers.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/server/dev-loopback.ts "src/routes/api/dev/post-project/+server.ts" tests/unit/media-composition/feature-video-test-helpers.ts tests/unit/media-composition/dev-loopback.test.ts
git add src/lib/server/dev-loopback.ts "src/routes/api/dev/post-project/+server.ts" tests/unit/media-composition/feature-video-test-helpers.ts tests/unit/media-composition/dev-loopback.test.ts
git commit -m "Share the dev-route guard and JSON reader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/server/dev-loopback.ts "src/routes/api/dev/post-project/+server.ts" tests/unit/media-composition/feature-video-test-helpers.ts tests/unit/media-composition/dev-loopback.test.ts
```

---

### Task 3: Media files with byte ranges

The editor's video element seeks by asking for byte ranges, so the media route must answer `Range` requests with 206 and the right bytes. It must also never serve a file outside the project's `media/` folder, whatever the path or a link inside the folder says.

**Files:**
- Create: `src/lib/server/feature-video-media.ts`
- Test: `tests/unit/media-composition/feature-video-media.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-media.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureMediaError,
  mediaResponse,
  parseByteRange,
  resolveFeatureMediaFile,
} from "$lib/server/feature-video-media";
import { tempFeatureRoot } from "./feature-video-test-helpers";

describe("parseByteRange", () => {
  it.each<[string | null, ReturnType<typeof parseByteRange>]>([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=500-", { start: 500, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=1000-", "unsatisfiable"],
    ["bytes=-0", "unsatisfiable"],
    ["bytes=5-2", null],
    ["bytes=0-1,5-9", null],
    ["items=0-9", null],
    ["bytes=-", null],
    [null, null],
  ])("reads %s of a 1000-byte file", (header, expected) => {
    expect(parseByteRange(header, 1000)).toEqual(expected);
  });
});

describe("feature video media files", () => {
  let project: string;

  beforeEach(async () => {
    project = await tempFeatureRoot();
    const footage = path.join(project, "media", "footage");
    await fs.mkdir(path.join(footage, "folder.mp4"), { recursive: true });
    await fs.writeFile(path.join(footage, "a.mp4"), "0123456789");
    await fs.writeFile(path.join(project, "project.json"), "{}");
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  async function status(relativePath: string): Promise<number> {
    try {
      await resolveFeatureMediaFile(project, relativePath);
      return 200;
    } catch (cause) {
      if (cause instanceof FeatureMediaError) return cause.status;
      throw cause;
    }
  }

  it("finds a file in the media folder", async () => {
    expect(
      await resolveFeatureMediaFile(project, "footage/a.mp4")
    ).toMatchObject({ size: 10, contentType: "video/mp4" });
  });

  it.each([
    "",
    "../project.json",
    "footage/../../project.json",
    "footage\\a.mp4",
    "%2e%2e/a.mp4",
    "C:/a.mp4",
    "footage//a.mp4",
    "./footage/a.mp4",
  ])("refuses %j with 400", async (relativePath) => {
    expect(await status(relativePath)).toBe(400);
  });

  it.each(["footage/run.exe", "project.json"])(
    "refuses %s with 415",
    async (relativePath) => {
      expect(await status(relativePath)).toBe(415);
    }
  );

  it.each(["footage/missing.mp4", "footage/folder.mp4"])(
    "answers 404 for %s",
    async (relativePath) => {
      expect(await status(relativePath)).toBe(404);
    }
  );

  it("refuses a link that leads out of the media folder", async () => {
    const outside = await tempFeatureRoot();
    await fs.writeFile(path.join(outside, "secret.mp4"), "secret");
    const link = path.join(project, "media", "footage", "link");
    await fs.symlink(outside, link, "junction");
    try {
      expect(await status("footage/link/secret.mp4")).toBe(403);
    } finally {
      // Remove the link itself before anything deletes folders recursively.
      await fs.unlink(link);
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("sends the whole file without a range", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, null);
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("0123456789");
  });

  it("sends only the asked-for bytes", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, "bytes=2-5");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("2345");
  });

  it("answers 416 for a range past the end", async () => {
    const media = await resolveFeatureMediaFile(project, "footage/a.mp4");
    const response = mediaResponse(media, "bytes=10-");
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-media.test.ts`
Expected: FAIL, with an error that `$lib/server/feature-video-media` cannot be resolved.

- [ ] **Step 3: Write the module**

Create `src/lib/server/feature-video-media.ts`:

```ts
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { FEATURE_VIDEO_MEDIA_TYPES } from "$lib/shared/media-composition/domain/feature-video";

/**
 * Serves the files in a feature video's media folder to the editor's video
 * and audio elements. Browsers fetch video in byte ranges to seek, so a
 * range request gets only those bytes. Nothing outside the media folder is
 * served, whether the path tries `..`, a drive letter, an encoded path or a
 * link inside the folder.
 */

export class FeatureMediaError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 415
  ) {
    super(message);
    this.name = "FeatureMediaError";
  }
}

export interface FeatureMediaFile {
  file: string;
  size: number;
  contentType: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The bytes a Range header asks for. Null means send the whole file: no
 * header, a kind this route does not serve (several ranges), or a range that
 * makes no sense. "unsatisfiable" means the range starts past the end.
 */
export function parseByteRange(
  header: string | null,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const length = Number(to);
    if (length === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return end < start ? null : { start, end };
}

const BAD_PATH = /[\\%:\0]/;

/** The file a media path names, once it is known to sit inside media/. */
export async function resolveFeatureMediaFile(
  projectDir: string,
  relativePath: string
): Promise<FeatureMediaFile> {
  const segments = relativePath.split("/");
  if (
    !relativePath ||
    BAD_PATH.test(relativePath) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new FeatureMediaError("Bad media path.", 400);
  const contentType =
    FEATURE_VIDEO_MEDIA_TYPES[path.extname(relativePath).toLowerCase()];
  if (!contentType)
    throw new FeatureMediaError("That kind of file is not served.", 415);
  let root: string;
  let file: string;
  try {
    root = await fs.realpath(path.join(projectDir, "media"));
    file = await fs.realpath(path.join(root, ...segments));
  } catch {
    throw new FeatureMediaError("Media not found.", 404);
  }
  const inside = path.relative(root, file);
  if (
    !inside ||
    inside === ".." ||
    inside.startsWith(`..${path.sep}`) ||
    path.isAbsolute(inside)
  )
    throw new FeatureMediaError("Media must stay inside its project.", 403);
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new FeatureMediaError("Media not found.", 404);
  return { file, size: stat.size, contentType };
}

/** The whole file, or the asked-for bytes of it. */
export function mediaResponse(
  media: FeatureMediaFile,
  rangeHeader: string | null
): Response {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": media.contentType,
  });
  const range = parseByteRange(rangeHeader, media.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${media.size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: media.size - 1 };
  const length = media.size === 0 ? 0 : end - start + 1;
  headers.set("Content-Length", String(length));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${media.size}`);
  const body =
    length === 0
      ? null
      : (Readable.toWeb(
          createReadStream(media.file, { start, end })
        ) as unknown as ReadableStream);
  return new Response(body, { status: range ? 206 : 200, headers });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-media.test.ts`
Expected: PASS, 29 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/server/feature-video-media.ts tests/unit/media-composition/feature-video-media.test.ts
git add src/lib/server/feature-video-media.ts tests/unit/media-composition/feature-video-media.test.ts
git commit -m "Serve feature video media in byte ranges, inside its folder only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/server/feature-video-media.ts tests/unit/media-composition/feature-video-media.test.ts
```

---

### Task 4: The folder store

**Files:**
- Create: `src/lib/server/feature-video-store.ts`
- Test: `tests/unit/media-composition/feature-video-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-store.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureVideoError,
  createFeatureVideoStore,
  type FeatureVideoStore,
} from "$lib/server/feature-video-store";
import { tempFeatureRoot } from "./feature-video-test-helpers";

const NOW = 1_780_000_000_000;
const SEQUENCE = "DCK\u03a8-";
const promo = { slug: "promo", title: "Promo 1.0", sequenceId: SEQUENCE };

let root: string;
let store: FeatureVideoStore;

beforeEach(async () => {
  root = await tempFeatureRoot();
  store = createFeatureVideoStore(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function refusal(run: () => Promise<unknown>): Promise<FeatureVideoError> {
  try {
    await run();
  } catch (cause) {
    if (cause instanceof FeatureVideoError) return cause;
    throw cause;
  }
  throw new Error("Expected the store to refuse.");
}

describe("creating", () => {
  it("lays out the folder and writes revision 1", async () => {
    const { file, folder } = await store.create({ ...promo, canvas: "16:9" }, NOW);
    expect(folder).toBe(path.join(root, "promo"));
    expect(file).toMatchObject({
      format: "feature-video-v1",
      slug: "promo",
      title: "Promo 1.0",
      revision: 1,
      savedAt: NOW,
    });
    expect(file.project).toMatchObject({
      sequenceId: SEQUENCE,
      canvas: "16:9",
      takes: [],
    });
    for (const sub of [
      "history",
      "captures",
      "exports",
      "media/footage",
      "media/captures",
      "media/music",
      "media/images",
    ])
      expect((await fs.stat(path.join(folder, sub))).isDirectory()).toBe(true);
    const written = JSON.parse(
      await fs.readFile(path.join(folder, "project.json"), "utf8")
    ) as unknown;
    expect(written).toEqual(file);
  });

  it("leaves the default 9:16 canvas unset", async () => {
    const { file } = await store.create({ ...promo, canvas: "9:16" }, NOW);
    expect(file.project.canvas).toBeUndefined();
  });

  it("refuses a name in use, a bad name, a bad canvas and a blank title", async () => {
    await store.create(promo, NOW);
    expect((await refusal(() => store.create(promo, NOW))).status).toBe(409);
    expect(
      (await refusal(() => store.create({ ...promo, slug: "Promo" }, NOW))).status
    ).toBe(400);
    expect(
      (
        await refusal(() =>
          store.create({ ...promo, slug: "other", canvas: "2:7" }, NOW)
        )
      ).status
    ).toBe(400);
    expect(
      (
        await refusal(() =>
          store.create({ ...promo, slug: "other", title: "   " }, NOW)
        )
      ).status
    ).toBe(400);
  });
});

describe("reading", () => {
  it("returns the file and its fingerprint", async () => {
    const { file } = await store.create(promo, NOW);
    const read = await store.read("promo");
    expect(read.file).toEqual(file);
    expect(read.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(read.folder).toBe(path.join(root, "promo"));
  });

  it("answers 404 for a missing project", async () => {
    expect((await refusal(() => store.read("missing"))).status).toBe(404);
  });

  it("answers 422 for a broken file and points at history", async () => {
    await store.create(promo, NOW);
    await fs.writeFile(path.join(root, "promo", "project.json"), "{ broken");
    const refused = await refusal(() => store.read("promo"));
    expect(refused.status).toBe(422);
    expect(refused.message).toContain("history/");
  });
});

describe("saving", () => {
  it("writes the next revision and keeps the old file in history", async () => {
    const { file } = await store.create(promo, NOW);
    const before = await fs.readFile(
      path.join(root, "promo", "project.json"),
      "utf8"
    );
    const saved = await store.write(
      "promo",
      { baseRevision: 1, project: { ...file.project, audio: "silent" } },
      NOW + 5
    );
    expect(saved).toMatchObject({ revision: 2, savedAt: NOW + 5 });
    expect((await store.read("promo")).file).toMatchObject({
      revision: 2,
      project: { audio: "silent" },
    });
    expect(
      await fs.readFile(
        path.join(root, "promo", "history", "r000001.json"),
        "utf8"
      )
    ).toBe(before);
  });

  it("refuses a save from an older revision and names the newer one", async () => {
    const { file } = await store.create(promo, NOW);
    await store.write(
      "promo",
      { baseRevision: 1, project: { ...file.project, audio: "silent" } },
      NOW + 1
    );
    const refused = await refusal(() =>
      store.write("promo", { baseRevision: 1, project: file.project }, NOW + 2)
    );
    expect(refused).toMatchObject({ status: 409, revision: 2 });
    expect((await store.read("promo")).file.project.audio).toBe("silent");
  });

  it("refuses an invalid post and a change of sequence", async () => {
    const { file } = await store.create(promo, NOW);
    expect(
      (
        await refusal(() =>
          store.write(
            "promo",
            { baseRevision: 1, project: { ...file.project, tracks: [] } },
            NOW
          )
        )
      ).status
    ).toBe(422);
    expect(
      (
        await refusal(() =>
          store.write(
            "promo",
            { baseRevision: 1, project: { ...file.project, sequenceId: "other" } },
            NOW
          )
        )
      ).status
    ).toBe(422);
  });

  it("keeps only the newest saves in history", async () => {
    const small = createFeatureVideoStore(root, { historyLimit: 3 });
    const { file } = await small.create(promo, NOW);
    for (let revision = 1; revision <= 5; revision += 1)
      await small.write(
        "promo",
        {
          baseRevision: revision,
          project: { ...file.project, updatedAt: NOW + revision },
        },
        NOW + revision
      );
    expect(
      (await fs.readdir(path.join(root, "promo", "history"))).sort()
    ).toEqual(["r000003.json", "r000004.json", "r000005.json"]);
  });

  it("takes one of two saves from the same revision and refuses the other", async () => {
    const { file } = await store.create(promo, NOW);
    const results = await Promise.allSettled([
      store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, audio: "silent" } },
        NOW + 1
      ),
      store.write(
        "promo",
        { baseRevision: 1, project: { ...file.project, mirrored: true } },
        NOW + 2
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
    });
  });
});

describe("revision", () => {
  it("follows saves and hand edits, and is null once the file is gone", async () => {
    const { file } = await store.create(promo, NOW);
    expect(await store.revision("promo")).toBe(1);
    await store.write("promo", { baseRevision: 1, project: file.project }, NOW + 1);
    expect(await store.revision("promo")).toBe(2);
    await fs.writeFile(
      path.join(root, "promo", "project.json"),
      JSON.stringify({ ...file, revision: 17 })
    );
    expect(await store.revision("promo")).toBe(17);
    await fs.rm(path.join(root, "promo", "project.json"));
    expect(await store.revision("promo")).toBeNull();
    expect(await store.revision("missing")).toBeNull();
  });
});

describe("listing", () => {
  it("is empty before the root folder exists", async () => {
    expect(
      await createFeatureVideoStore(path.join(root, "not-yet")).list()
    ).toEqual({ projects: [], unreadable: [] });
  });

  it("lists projects newest first, skips stray folders and names unreadable ones", async () => {
    await store.create(promo, NOW);
    await store.create({ ...promo, slug: "later", title: "Later" }, NOW + 10);
    await fs.mkdir(path.join(root, "Not A Name"));
    await fs.mkdir(path.join(root, "empty"));
    await store.create({ ...promo, slug: "broken" }, NOW);
    await fs.writeFile(path.join(root, "broken", "project.json"), "nope");
    expect(await store.list()).toEqual({
      projects: [
        {
          slug: "later",
          title: "Later",
          revision: 1,
          savedAt: NOW + 10,
          sequenceId: SEQUENCE,
        },
        {
          slug: "promo",
          title: "Promo 1.0",
          revision: 1,
          savedAt: NOW,
          sequenceId: SEQUENCE,
        },
      ],
      unreadable: ["broken"],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-store.test.ts`
Expected: FAIL, with an error that `$lib/server/feature-video-store` cannot be resolved.

- [ ] **Step 3: Write the store**

Create `src/lib/server/feature-video-store.ts`:

```ts
import { error } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";
import { fingerprint } from "$lib/server/post-project-dev-bridge";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  FEATURE_VIDEO_HISTORY_LIMIT,
  FEATURE_VIDEO_MAX_FILE_BYTES,
  FEATURE_VIDEO_MEDIA_FOLDERS,
  FeatureVideoFileSchema,
  isFeatureVideoSlug,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  POST_CANVAS_RATIOS,
  POST_DEFAULT_CANVAS,
  PostProjectSchema,
  createEmptyPostProject,
  type PostCanvasRatio,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * Feature videos on disk: one folder per project under a root folder,
 * E:/tka-platform-media/feature-videos unless TKA_FEATURE_VIDEO_ROOT names
 * another. Only dev routes use this, and only for this computer.
 *
 * Each save names the revision it started from. When the file has moved on
 * since, through another editor, the CLI or a hand edit, the save is refused
 * with the newer revision, so nothing on disk is overwritten unseen. Each
 * save first copies the file it replaces into history/.
 */

export type FeatureVideoStatus = 400 | 404 | 409 | 413 | 422 | 500;

export class FeatureVideoError extends Error {
  constructor(
    message: string,
    readonly status: FeatureVideoStatus,
    /** On a 409, the revision now on disk. */
    readonly revision?: number
  ) {
    super(message);
    this.name = "FeatureVideoError";
  }
}

export interface FeatureVideoSaved {
  revision: number;
  savedAt: number;
  fingerprint: string;
}

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

function code(cause: unknown): string | undefined {
  return cause && typeof cause === "object" && "code" in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

/** Windows refuses a rename while a scanner or indexer holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (cause) {
      if (attempt >= 3 || !RETRY_CODES.has(code(cause) ?? "")) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Two posts that differ at most in when they were saved. */
export function sameContent(a: PostProject, b: PostProject): boolean {
  return (
    JSON.stringify({ ...a, updatedAt: 0 }) ===
    JSON.stringify({ ...b, updatedAt: 0 })
  );
}

export function createFeatureVideoStore(
  root: string,
  options: { historyLimit?: number } = {}
) {
  const historyLimit = options.historyLimit ?? FEATURE_VIDEO_HISTORY_LIMIT;
  const chains = new Map<string, Promise<unknown>>();
  const revisions = new Map<string, { signature: string; revision: number }>();

  function folder(slug: string): string {
    if (!isFeatureVideoSlug(slug))
      throw new FeatureVideoError(
        `"${slug}" is not a feature video name. Use lowercase letters, digits and dashes.`,
        400
      );
    return path.join(root, slug);
  }

  /** One change at a time per project, in the order they arrived. */
  function serialize<T>(slug: string, run: () => Promise<T>): Promise<T> {
    const result = (chains.get(slug) ?? Promise.resolve()).then(run);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    chains.set(slug, settled);
    void settled.then(() => {
      if (chains.get(slug) === settled) chains.delete(slug);
    });
    return result;
  }

  async function readFile(slug: string): Promise<FeatureVideoFile> {
    let text: string;
    try {
      text = await fs.readFile(path.join(folder(slug), "project.json"), "utf8");
    } catch (cause) {
      if (code(cause) === "ENOENT")
        throw new FeatureVideoError(`No feature video named ${slug}.`, 404);
      throw cause;
    }
    const unreadable = new FeatureVideoError(
      `${slug}/project.json is unreadable. Restore it from history/ (the newest file there is the last good save).`,
      422
    );
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw unreadable;
    }
    const parsed = FeatureVideoFileSchema.safeParse(value);
    if (!parsed.success || parsed.data.slug !== slug) throw unreadable;
    return parsed.data;
  }

  async function writeFile(slug: string, file: FeatureVideoFile): Promise<void> {
    const text = `${JSON.stringify(file, null, 2)}\n`;
    if (Buffer.byteLength(text) > FEATURE_VIDEO_MAX_FILE_BYTES)
      throw new FeatureVideoError(
        `${slug} is too large to save (over 12 MB).`,
        413
      );
    const dir = folder(slug);
    const target = path.join(dir, "project.json");
    const temp = path.join(dir, `.project.${process.pid}.${randomUUID()}.tmp`);
    await fs.writeFile(temp, text, { flag: "wx" });
    try {
      await renameWithRetry(temp, target);
    } catch (cause) {
      await fs.rm(temp, { force: true });
      throw cause;
    }
    if ((await fs.readFile(target, "utf8")) !== text)
      throw new FeatureVideoError(
        `${slug}/project.json did not save as written. Try the edit again.`,
        500
      );
  }

  /** Copies the current file into history/ and keeps the newest saves. */
  async function archive(slug: string, revision: number): Promise<void> {
    const history = path.join(folder(slug), "history");
    await fs.mkdir(history, { recursive: true });
    try {
      await fs.copyFile(
        path.join(folder(slug), "project.json"),
        path.join(history, `r${String(revision).padStart(6, "0")}.json`),
        fsConstants.COPYFILE_EXCL
      );
    } catch (cause) {
      if (code(cause) !== "EEXIST") throw cause;
    }
    const saves = (await fs.readdir(history))
      .filter((name) => /^r\d+\.json$/.test(name))
      .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));
    for (const name of saves.slice(0, Math.max(0, saves.length - historyLimit)))
      await fs.rm(path.join(history, name), { force: true });
  }

  async function commit(
    slug: string,
    current: FeatureVideoFile,
    project: PostProject,
    now: number
  ): Promise<FeatureVideoSaved> {
    await archive(slug, current.revision);
    const next: FeatureVideoFile = {
      ...current,
      revision: current.revision + 1,
      savedAt: now,
      project,
    };
    await writeFile(slug, next);
    return {
      revision: next.revision,
      savedAt: next.savedAt,
      fingerprint: fingerprint(project),
    };
  }

  async function create(
    input: { slug: string; title: string; sequenceId: string; canvas?: string },
    now = Date.now()
  ): Promise<{ file: FeatureVideoFile; folder: string }> {
    const dir = folder(input.slug);
    if (
      input.canvas !== undefined &&
      !(POST_CANVAS_RATIOS as readonly string[]).includes(input.canvas)
    )
      throw new FeatureVideoError(
        `canvas must be one of ${POST_CANVAS_RATIOS.join(", ")}.`,
        400
      );
    const empty = createEmptyPostProject({ sequenceId: input.sequenceId, now });
    const canvas = input.canvas as PostCanvasRatio | undefined;
    const project =
      canvas && canvas !== POST_DEFAULT_CANVAS ? { ...empty, canvas } : empty;
    const parsed = FeatureVideoFileSchema.safeParse({
      format: FEATURE_VIDEO_FILE_FORMAT,
      slug: input.slug,
      title: input.title,
      revision: 1,
      savedAt: now,
      project,
    });
    if (!parsed.success)
      throw new FeatureVideoError(
        "A feature video needs a title of 1 to 120 characters and a sequence id.",
        400
      );
    const file = parsed.data;
    return serialize(input.slug, async () => {
      await fs.mkdir(root, { recursive: true });
      try {
        await fs.mkdir(dir);
      } catch (cause) {
        if (code(cause) === "EEXIST")
          throw new FeatureVideoError(
            `A feature video named ${input.slug} already exists.`,
            409
          );
        throw cause;
      }
      for (const sub of [
        "history",
        "captures",
        "exports",
        ...FEATURE_VIDEO_MEDIA_FOLDERS.map((name) => path.join("media", name)),
      ])
        await fs.mkdir(path.join(dir, sub), { recursive: true });
      await writeFile(input.slug, file);
      return { file, folder: dir };
    });
  }

  async function read(
    slug: string
  ): Promise<{ file: FeatureVideoFile; fingerprint: string; folder: string }> {
    const file = await readFile(slug);
    return { file, fingerprint: fingerprint(file.project), folder: folder(slug) };
  }

  function write(
    slug: string,
    input: { baseRevision: number; project: unknown },
    now = Date.now()
  ): Promise<FeatureVideoSaved> {
    return serialize(slug, async () => {
      const current = await readFile(slug);
      if (input.baseRevision !== current.revision)
        throw new FeatureVideoError(
          `${slug} changed on disk (now revision ${current.revision}). Load it again before saving.`,
          409,
          current.revision
        );
      const parsed = PostProjectSchema.safeParse(input.project);
      if (!parsed.success)
        throw new FeatureVideoError("That is not a valid Post project.", 422);
      if (parsed.data.sequenceId !== current.project.sequenceId)
        throw new FeatureVideoError("A feature video keeps its sequence.", 422);
      return commit(slug, current, parsed.data, now);
    });
  }

  /** The revision on disk, or null when the project is missing or unreadable. */
  async function revision(slug: string): Promise<number | null> {
    const file = path.join(folder(slug), "project.json");
    let signature: string;
    try {
      const stat = await fs.stat(file);
      signature = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    } catch {
      revisions.delete(slug);
      return null;
    }
    const cached = revisions.get(slug);
    if (cached?.signature === signature) return cached.revision;
    try {
      const current = await readFile(slug);
      revisions.set(slug, { signature, revision: current.revision });
      return current.revision;
    } catch {
      revisions.delete(slug);
      return null;
    }
  }

  async function list(): Promise<{
    projects: FeatureVideoSummary[];
    unreadable: string[];
  }> {
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch (cause) {
      if (code(cause) === "ENOENT") return { projects: [], unreadable: [] };
      throw cause;
    }
    const projects: FeatureVideoSummary[] = [];
    const unreadable: string[] = [];
    for (const name of names.filter(isFeatureVideoSlug).sort()) {
      try {
        const file = await readFile(name);
        projects.push({
          slug: file.slug,
          title: file.title,
          revision: file.revision,
          savedAt: file.savedAt,
          sequenceId: file.project.sequenceId,
        });
      } catch (cause) {
        if (cause instanceof FeatureVideoError && cause.status === 422)
          unreadable.push(name);
      }
    }
    projects.sort((a, b) => b.savedAt - a.savedAt || a.slug.localeCompare(b.slug));
    return { projects, unreadable };
  }

  return { root, folder, create, read, write, revision, list };
}

export type FeatureVideoStore = ReturnType<typeof createFeatureVideoStore>;

const DEFAULT_ROOT = "E:/tka-platform-media/feature-videos";
const stores = new Map<string, FeatureVideoStore>();

/** Where feature videos live; TKA_FEATURE_VIDEO_ROOT moves them. */
export function featureVideoRoot(): string {
  return process.env.TKA_FEATURE_VIDEO_ROOT || DEFAULT_ROOT;
}

/** The store for the current root, one per root so saves stay in order. */
export function featureVideos(): FeatureVideoStore {
  const root = path.resolve(featureVideoRoot());
  let store = stores.get(root);
  if (!store) {
    store = createFeatureVideoStore(root);
    stores.set(root, store);
  }
  return store;
}

/** Turns a store refusal into the route's HTTP error. */
export function featureVideoFailure(cause: unknown): never {
  if (cause instanceof FeatureVideoError) error(cause.status, cause.message);
  throw cause;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-store.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
git add src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
git commit -m "Keep feature videos as folders with revision-checked saves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
```

---

### Task 5: List, create, read, save and media routes

**Files:**
- Create: `src/routes/api/dev/feature-videos/+server.ts`
- Create: `src/routes/api/dev/feature-videos/[slug]/+server.ts`
- Create: `src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts`
- Test: `tests/unit/media-composition/feature-video-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-routes.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET as listRoute,
  POST as createRoute,
} from "../../../src/routes/api/dev/feature-videos/+server";
import {
  GET as readRoute,
  PUT as saveRoute,
} from "../../../src/routes/api/dev/feature-videos/[slug]/+server";
import { GET as mediaRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";

const SEQUENCE = "DCK\u03a8-";
const promo = { slug: "promo", title: "Promo 1.0", sequenceId: SEQUENCE };

let root: string;
let savedRoot: string | undefined;

beforeEach(async () => {
  savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
  root = await tempFeatureRoot();
  process.env.TKA_FEATURE_VIDEO_ROOT = root;
});

afterEach(async () => {
  if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
  else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
  await fs.rm(root, { recursive: true, force: true });
});

const create = (body: Record<string, unknown>) =>
  createRoute(
    routeEvent("/api/dev/feature-videos", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
const read = (slug: string) =>
  readRoute(
    routeEvent(`/api/dev/feature-videos/${slug}`, { params: { slug } }) as never
  );
const save = (slug: string, body: Record<string, unknown>) =>
  saveRoute(
    routeEvent(`/api/dev/feature-videos/${slug}`, {
      method: "PUT",
      params: { slug },
      body: JSON.stringify(body),
    }) as never
  );

describe("feature video routes", () => {
  it("creates, lists, reads and saves", async () => {
    expect((await create({ ...promo, canvas: "9:16" })).status).toBe(201);
    const listed = await (
      await listRoute(routeEvent("/api/dev/feature-videos") as never)
    ).json();
    expect(listed.projects.map((entry: { slug: string }) => entry.slug)).toEqual([
      "promo",
    ]);
    const { file } = await (await read("promo")).json();
    expect(file.revision).toBe(1);
    const saved = await save("promo", {
      baseRevision: 1,
      project: { ...file.project, audio: "silent" },
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ revision: 2 });
  });

  it("answers a stale save with 409 and the newer revision", async () => {
    await create(promo);
    const { file } = await (await read("promo")).json();
    await save("promo", {
      baseRevision: 1,
      project: { ...file.project, audio: "silent" },
    });
    const stale = await save("promo", { baseRevision: 1, project: file.project });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ revision: 2 });
    expect(
      await thrownStatus(() =>
        save("promo", { baseRevision: "1", project: file.project })
      )
    ).toBe(400);
  });

  it("turns refusals into HTTP errors", async () => {
    expect(await thrownStatus(() => create({ ...promo, slug: "Bad" }))).toBe(400);
    expect(await thrownStatus(() => create({ ...promo, title: 5 }))).toBe(400);
    await create(promo);
    expect(await thrownStatus(() => create(promo))).toBe(409);
    expect(await thrownStatus(() => read("missing"))).toBe(404);
    expect(
      await thrownStatus(() =>
        listRoute(
          routeEvent("/api/dev/feature-videos", {
            origin: "http://evil.test",
          }) as never
        )
      )
    ).toBe(403);
  });

  it("serves media whole and in byte ranges, and nothing outside it", async () => {
    await create(promo);
    await fs.writeFile(
      path.join(root, "promo", "media", "footage", "a.mp4"),
      "0123456789"
    );
    const media = (file: string, range?: string) =>
      mediaRoute(
        routeEvent(`/api/dev/feature-videos/promo/media/${file}`, {
          params: { slug: "promo", path: file },
          ...(range ? { headers: { range } } : {}),
        }) as never
      );
    const whole = await media("footage/a.mp4");
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("0123456789");
    const part = await media("footage/a.mp4", "bytes=4-");
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("456789");
    expect(await thrownStatus(() => media("../project.json"))).toBe(400);
    expect(await thrownStatus(() => media("footage/missing.mp4"))).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-routes.test.ts`
Expected: FAIL, with an error that the route modules cannot be resolved.

- [ ] **Step 3: Write the list and create route**

Create `src/routes/api/dev/feature-videos/+server.ts`:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";

/** Dev only: the feature videos on this computer, and new ones. */
export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  try {
    return json(await featureVideos().list());
  } catch (cause) {
    featureVideoFailure(cause);
  }
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request, 64_000);
  if (
    typeof input.slug !== "string" ||
    typeof input.title !== "string" ||
    typeof input.sequenceId !== "string" ||
    (input.canvas !== undefined && typeof input.canvas !== "string")
  )
    error(
      400,
      "Send slug, title and sequenceId as text, and canvas when you want one."
    );
  try {
    const created = await featureVideos().create({
      slug: input.slug,
      title: input.title,
      sequenceId: input.sequenceId,
      ...(typeof input.canvas === "string" ? { canvas: input.canvas } : {}),
    });
    return json(created, { status: 201 });
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 4: Write the read and save route**

Create `src/routes/api/dev/feature-videos/[slug]/+server.ts`:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  FeatureVideoError,
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";

/** Dev only: one feature video, read whole and saved whole. */
export const GET: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  try {
    return json(await featureVideos().read(params.slug ?? ""));
  } catch (cause) {
    featureVideoFailure(cause);
  }
};

/**
 * Saves the whole post. A save from an older revision gets 409 with the
 * revision now on disk, so the editor can load it instead.
 */
export const PUT: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request);
  if (
    typeof input.baseRevision !== "number" ||
    !Number.isSafeInteger(input.baseRevision)
  )
    error(400, "Send baseRevision, the revision this edit started from.");
  try {
    return json(
      await featureVideos().write(params.slug ?? "", {
        baseRevision: input.baseRevision,
        project: input.project,
      })
    );
  } catch (cause) {
    if (cause instanceof FeatureVideoError && cause.status === 409)
      return json(
        { message: cause.message, revision: cause.revision },
        { status: 409 }
      );
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 5: Write the media route**

Create `src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts`:

```ts
import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback } from "$lib/server/dev-loopback";
import {
  FeatureMediaError,
  mediaResponse,
  resolveFeatureMediaFile,
} from "$lib/server/feature-video-media";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";

/** Dev only: a file from a feature video's media folder, in byte ranges. */
export const GET: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  try {
    const media = await resolveFeatureMediaFile(
      featureVideos().folder(params.slug ?? ""),
      params.path ?? ""
    );
    return mediaResponse(media, request.headers.get("range"));
  } catch (cause) {
    if (cause instanceof FeatureMediaError) error(cause.status, cause.message);
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-routes.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write "src/routes/api/dev/feature-videos/+server.ts" "src/routes/api/dev/feature-videos/[slug]/+server.ts" "src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
git add "src/routes/api/dev/feature-videos/+server.ts" "src/routes/api/dev/feature-videos/[slug]/+server.ts" "src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
git commit -m "Dev routes to list, create, read, save and stream feature videos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/routes/api/dev/feature-videos/+server.ts" "src/routes/api/dev/feature-videos/[slug]/+server.ts" "src/routes/api/dev/feature-videos/[slug]/media/[...path]/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
```

---

### Task 6: Coordinator checkpoint, real footage in a real browser

This task is run by the coordinator in its own session, not by an implementer subagent. It proves the riskiest assumption before the editor work starts: a 4K 60 fps file served by the media route seeks in the browser. It also finds out whether a signed-out browser can open the sequence, which decides whether piece 3's capture profile needs Austen to sign in once.

**Files:** none changed.

- [ ] **Step 1: Pass the resource gate**

Run in PowerShell:

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|vite\\bin\\vite\.js' } | Select-Object ProcessId, CommandLine
Get-NetTCPConnection -LocalPort 5191 -ErrorAction SilentlyContinue
```

Expected: at least 4096 MB available; at most one other agent-owned Vite server (the primary's 5173 server does not count against this task, and is never touched); nothing on port 5191. If any check fails, wait or report contention instead of stopping anyone else's process.

- [ ] **Step 2: Start a task-owned preview on port 5191**

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$env:TKA_FEATURE_VIDEO_ROOT = "$scratch\feature-videos"
$p = Start-Process -FilePath node -ArgumentList 'node_modules/vite/bin/vite.js','--port','5191','--strictPort','--host','localhost' -WorkingDirectory 'E:\worktrees\tka-platform\feature-video-projects' -RedirectStandardOutput "$scratch\preview-5191.log" -RedirectStandardError "$scratch\preview-5191.err.log" -PassThru -WindowStyle Hidden
$p.Id
```

Record the process id, port 5191, the worktree and both log paths in the task notes. Then wait, with a Monitor until-loop rather than sleeps, until this prints `200`:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:5191/api/dev/feature-videos
```

The first request compiles the routes and can take a minute. A 404 means the server is not in dev mode; a 500 means read `preview-5191.err.log`.

- [ ] **Step 3: Create a scratch project and a 4K 60 fps file**

```powershell
node -e "fetch('http://localhost:5191/api/dev/feature-videos',{method:'POST',headers:{origin:'http://localhost:5191','content-type':'application/json'},body:JSON.stringify({slug:'range-check',title:'Range check',sequenceId:'DCK\u03a8-',canvas:'9:16'})}).then(async r=>console.log(r.status, await r.text()))"
& 'C:\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe' -hide_banner -loglevel error -f lavfi -i testsrc2=size=3840x2160:rate=60 -t 20 -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad\feature-videos\range-check\media\footage\4k60.mp4'
```

Expected: `201` and the new file's JSON; ffmpeg prints nothing and the file exists.

- [ ] **Step 4: Check ranges from the command line**

```powershell
curl.exe -s -D - -o NUL -H "Range: bytes=0-99" http://localhost:5191/api/dev/feature-videos/range-check/media/footage/4k60.mp4
curl.exe -s -D - -o NUL -H "Range: bytes=999999999-" http://localhost:5191/api/dev/feature-videos/range-check/media/footage/4k60.mp4
curl.exe -s -o NUL -w "%{http_code}" "http://localhost:5191/api/dev/feature-videos/range-check/media/..%2Fproject.json"
```

Expected: the first answers `206` with `Content-Range: bytes 0-99/<size>` and `Content-Length: 100`; the second answers `416` with `Content-Range: bytes */<size>`; the third prints `400` (the encoded slash decodes to `../project.json`, which the resolver refuses). Any 200 there is a stop-the-line failure.

- [ ] **Step 5: Seek the file in the task browser**

Open [http://localhost:5191/](http://localhost:5191/) in the task browser (the in-app browser, or Chrome DevTools MCP on the agent profile from `scripts/launch-chrome-debug.ps1`), then run in the page:

```js
const v = document.createElement("video");
v.muted = true;
v.preload = "auto";
v.src = "/api/dev/feature-videos/range-check/media/footage/4k60.mp4";
document.body.append(v);
await new Promise((resolve, reject) => {
  v.onloadedmetadata = resolve;
  v.onerror = () => reject(v.error);
});
v.currentTime = 15;
await new Promise((resolve) => (v.onseeked = resolve));
({ readyState: v.readyState, width: v.videoWidth, height: v.videoHeight, time: v.currentTime });
```

Expected: `readyState` 2 or more, width 3840, height 2160, time near 15. The network list for `4k60.mp4` shows 206 answers. If the browser cannot decode H.264, repeat in Chrome on the agent profile before drawing any conclusion.

- [ ] **Step 6: Find out whether a signed-out browser can open the sequence**

In the same page:

```js
const { resolveSyncedPostSequence } = await import("/src/lib/features/post/services/post-account-projects.ts");
const sequence = await resolveSyncedPostSequence("DCK\u03a8-");
({ found: sequence !== null, id: sequence?.id, steps: sequence?.steps?.length });
```

Write the answer into the task notes. When `found` is false, feature mode still works for Austen, who is signed in, but piece 3's capture profile will need his one-time sign-in; say so in the milestone note.

- [ ] **Step 7: Stop the preview**

Stop only the recorded process (`Stop-Process -Id <recorded id>`), confirm port 5191 is free again, and leave the scratch project folder for Task 16. Task 16 starts a fresh preview.

---

### Task 7: Named edits that add and remove takes

A take in a feature video is a file in its `media/footage` folder, played from the media route. Two new named edits let the CLI add one (optionally putting the whole take on the end of the main track) and remove one. The take's key is the one the URL gives it, so adding the same file again refreshes the take instead of adding a second one.

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project-ops.ts` (the imports at lines 1-28, the `PostProjectOp` union at lines 41-59, and two new cases before `default:` at line 244)
- Test: `tests/unit/media-composition/feature-video-ops.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-ops.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, project } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const URL_03 = featureVideoMediaUrl("promo", "footage/take-03.mp4");
const empty = () => project([], [], []);

describe("add-take", () => {
  it("adds a feature video file as a take, with no clip", () => {
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5 }],
      ctx
    );
    expect(next.takes).toEqual([
      {
        id: "take-1",
        label: "take-03",
        ref: { kind: "linked", url: URL_03 },
        takeKey: `linked:${URL_03}`,
        durationSeconds: 12.5,
      },
    ]);
    expect(next.tracks[0]?.items).toEqual([]);
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("puts the whole take on the end of the main track when asked", () => {
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5, append: true }],
      ctx
    );
    expect(next.tracks[0]?.items).toHaveLength(1);
    expect(next.tracks[0]?.items[0]).toMatchObject({
      kind: "video",
      takeId: "take-1",
      sourceIn: 0,
      sourceOut: 12.5,
    });
  });

  it("refreshes the take when the same file comes again, keeping its name", () => {
    const first = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5, label: "Opening" }],
      ctx
    );
    const again = applyPostProjectOps(
      first,
      [{ op: "add-take", url: URL_03, durationSeconds: 13 }],
      ctx
    );
    expect(again.takes).toHaveLength(1);
    expect(again.takes[0]).toMatchObject({
      id: "take-1",
      label: "Opening",
      durationSeconds: 13,
    });
  });

  it("names a take after its file", () => {
    const url = featureVideoMediaUrl("promo", "footage/take 04.mov");
    expect(url).toContain("take%2004.mov");
    const next = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url, durationSeconds: 3 }],
      ctx
    );
    expect(next.takes[0]?.label).toBe("take 04");
  });

  it.each([
    [
      { op: "add-take", url: "https://example.test/a.mp4", durationSeconds: 5 },
      "feature video media url",
    ],
    [{ op: "add-take", url: URL_03, durationSeconds: 0 }, "positive number"],
    [
      { op: "add-take", url: URL_03, durationSeconds: Number.NaN },
      "positive number",
    ],
    [
      { op: "add-take", url: URL_03, durationSeconds: 5, label: "x".repeat(121) },
      "1 to 120 characters",
    ],
  ])("refuses %o", (op, message) => {
    expect(() =>
      applyPostProjectOps(empty(), [op as PostProjectOp], ctx)
    ).toThrow(message);
  });
});

describe("remove-take", () => {
  it("removes the take and every clip cut from it", () => {
    const added = applyPostProjectOps(
      empty(),
      [{ op: "add-take", url: URL_03, durationSeconds: 12.5, append: true }],
      ctx
    );
    const next = applyPostProjectOps(
      added,
      [{ op: "remove-take", take: "take-1" }],
      ctx
    );
    expect(next.takes).toEqual([]);
    expect(next.tracks[0]?.items).toEqual([]);
  });

  it("names a take that is not there", () => {
    expect(() =>
      applyPostProjectOps(empty(), [{ op: "remove-take", take: "nope" }], ctx)
    ).toThrow('No take "nope" in this post.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-ops.test.ts`
Expected: FAIL. The add-take tests fail with `Unknown edit "add-take"` and the remove-take tests with `Unknown edit "remove-take"`.

- [ ] **Step 3: Add the two edits**

In `src/lib/shared/media-composition/domain/post-project-ops.ts`:

1. Add `addTake`, `appendVideoClip` and `removeTake` to the existing import from `post-project-edits` (keep the names in alphabetical order with the others), and add two imports after it:

```ts
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import {
  PostTakeSchema,
  takeFileKey,
} from "$lib/shared/media-composition/domain/post-plan";
```

2. Replace the last two members of the `PostProjectOp` union:

```ts
  | { op: "canvas"; canvas: string }
  | { op: "background"; background: string };
```

with:

```ts
  | { op: "canvas"; canvas: string }
  | { op: "background"; background: string }
  | {
      op: "add-take";
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
      label?: string;
      /** Also put the whole take on the end of the main track. */
      append?: boolean;
    }
  | { op: "remove-take"; take: string };
```

3. Add this helper directly above `function applyOp(`:

```ts
/** A take's default name: its file name without the extension. */
function mediaLabel(url: string): string {
  const last = url.split("/").pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // A name that does not decode stays as written.
  }
  return name.replace(/\.[^.]+$/, "").slice(0, 120);
}
```

4. Add these two cases directly above `default:` in `applyOp`:

```ts
    case "add-take": {
      if (!isFeatureVideoMediaUrl(op.url))
        throw new Error(
          "A take's url must be a feature video media url (/api/dev/feature-videos/<slug>/media/...)."
        );
      if (
        typeof op.durationSeconds !== "number" ||
        !Number.isFinite(op.durationSeconds) ||
        op.durationSeconds <= 0
      )
        throw new Error("durationSeconds must be a positive number.");
      const ref = { kind: "linked" as const, url: op.url };
      const takeKey = takeFileKey(ref);
      const existing = project.takes.find((take) => take.takeKey === takeKey);
      const label = typeof op.label === "string" ? op.label.trim() : "";
      const parsed = PostTakeSchema.safeParse({
        id: existing?.id ?? `take-${project.takes.length + 1}`,
        label: label || existing?.label || mediaLabel(op.url),
        ref,
        takeKey,
        durationSeconds: op.durationSeconds,
      });
      if (!parsed.success)
        throw new Error("A take label is 1 to 120 characters.");
      const next = addTake(project, parsed.data, ctx);
      if (!op.append) return next;
      const added = next.takes.find((take) => take.takeKey === takeKey);
      const placed = added ? appendVideoClip(next, added.id, ctx) : null;
      if (!placed)
        throw new Error("The take could not be placed on the timeline.");
      return placed.project;
    }
    case "remove-take": {
      if (!project.takes.some((take) => take.id === op.take))
        throw new Error(`No take "${op.take}" in this post.`);
      return removeTake(project, op.take, ctx);
    }
```

`addTake` moves a colliding id to the next free `take-<n>`, so the id picked here only has to be a sensible first guess.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-ops.test.ts tests/unit/media-composition/post-project-ops.test.ts`
Expected: PASS. The new file has 10 tests; the existing ops tests pass unchanged.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/feature-video-ops.test.ts
git add src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/feature-video-ops.test.ts
git commit -m "Named edits to add and remove feature video takes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/feature-video-ops.test.ts
```

---

### Task 8: Named edits and copies in the folder store

When no editor has a feature video open, the CLI's named edits are applied to the file on disk, as one revision per batch. A copy, such as a 30 s cut of the 60 s promo, starts at revision 1 with an empty history. By default it gets its own copy of the media and its URLs move to its own folder; with `shareMedia` it plays the original's files instead.

**Files:**
- Modify: `src/lib/server/feature-video-store.ts` (imports; two new functions inside `createFeatureVideoStore`; its return line)
- Modify: `tests/unit/media-composition/feature-video-store.test.ts` (one import; two new `describe` blocks at the end)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/media-composition/feature-video-store.test.ts`, add this import after the `$lib/server/feature-video-store` import:

```ts
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
```

Then append at the end of the file:

```ts
describe("named edits", () => {
  it("applies them as the next revision, and writes nothing when they change nothing", async () => {
    await store.create(promo, NOW);
    expect(
      await store.applyOps(
        "promo",
        [{ op: "background", background: "blur" }],
        NOW + 1
      )
    ).toMatchObject({ status: "applied", revision: 2, savedAt: NOW + 1 });
    expect((await store.read("promo")).file.project.background).toBe("blur");
    expect(
      await store.applyOps(
        "promo",
        [{ op: "background", background: "blur" }],
        NOW + 2
      )
    ).toMatchObject({ status: "unchanged", revision: 2 });
    expect(await fs.readdir(path.join(root, "promo", "history"))).toEqual([
      "r000001.json",
    ]);
  });

  it("refuses an edit that fails and leaves the file alone", async () => {
    await store.create(promo, NOW);
    const refused = await refusal(() =>
      store.applyOps("promo", [{ op: "remove-take", take: "nope" }], NOW + 1)
    );
    expect(refused.status).toBe(400);
    expect(refused.message).toContain('No take "nope"');
    expect(await store.revision("promo")).toBe(1);
  });
});

describe("duplicating", () => {
  async function promoWithTake() {
    await store.create(promo, NOW);
    await fs.writeFile(
      path.join(root, "promo", "media", "footage", "a.mp4"),
      "video"
    );
    const url = featureVideoMediaUrl("promo", "footage/a.mp4");
    await store.applyOps(
      "promo",
      [{ op: "add-take", url, durationSeconds: 4, append: true }],
      NOW + 1
    );
    return url;
  }

  it("copies the media and points the copy at its own files", async () => {
    const original = await promoWithTake();
    const { file, folder } = await store.duplicate(
      "promo",
      { slug: "promo-30s" },
      NOW + 5
    );
    const moved = featureVideoMediaUrl("promo-30s", "footage/a.mp4");
    expect(file).toMatchObject({
      slug: "promo-30s",
      title: "Promo 1.0 (copy)",
      revision: 1,
      savedAt: NOW + 5,
    });
    expect(file.project.takes[0]).toMatchObject({
      ref: { kind: "linked", url: moved },
      takeKey: `linked:${moved}`,
    });
    expect(
      await fs.readFile(path.join(folder, "media", "footage", "a.mp4"), "utf8")
    ).toBe("video");
    expect(await fs.readdir(path.join(folder, "history"))).toEqual([]);
    expect((await store.read("promo")).file.project.takes[0]?.ref).toEqual({
      kind: "linked",
      url: original,
    });
  });

  it("can play the original's media instead of copying it", async () => {
    const original = await promoWithTake();
    const { file, folder } = await store.duplicate(
      "promo",
      { slug: "promo-cut", title: "Cut", shareMedia: true },
      NOW + 5
    );
    expect(file.title).toBe("Cut");
    expect(file.project.takes[0]?.ref).toEqual({ kind: "linked", url: original });
    expect(await fs.readdir(path.join(folder, "media", "footage"))).toEqual([]);
  });

  it("refuses a name in use and a missing original", async () => {
    await store.create(promo, NOW);
    await store.create({ ...promo, slug: "taken" }, NOW);
    expect(
      (await refusal(() => store.duplicate("promo", { slug: "taken" }))).status
    ).toBe(409);
    expect(
      (await refusal(() => store.duplicate("missing", { slug: "new" }))).status
    ).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-store.test.ts`
Expected: FAIL. The five new tests fail with `store.applyOps is not a function` or `store.duplicate is not a function`; the 14 earlier tests still pass.

- [ ] **Step 3: Add the edits and the copy to the store**

In `src/lib/server/feature-video-store.ts`:

1. Add `rehomeFeatureMediaUrls` to the import from `$lib/shared/media-composition/domain/feature-video`, and add this import after it:

```ts
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
```

2. Inside `createFeatureVideoStore`, directly above `return { root, folder, create, read, write, revision, list };`, add:

```ts
  /**
   * Named edits applied to the file on disk, for when no editor has the
   * project open. The batch is one revision; edits that change nothing
   * write nothing.
   */
  function applyOps(
    slug: string,
    ops: unknown,
    now = Date.now()
  ): Promise<FeatureVideoSaved & { status: "applied" | "unchanged" }> {
    return serialize(slug, async () => {
      const current = await readFile(slug);
      let next: PostProject;
      try {
        next = applyPostProjectOps(current.project, ops as PostProjectOp[], {
          now,
        });
      } catch (cause) {
        throw new FeatureVideoError(
          cause instanceof Error ? cause.message : String(cause),
          400
        );
      }
      if (next === current.project || sameContent(next, current.project))
        return {
          status: "unchanged" as const,
          revision: current.revision,
          savedAt: current.savedAt,
          fingerprint: fingerprint(current.project),
        };
      const parsed = PostProjectSchema.safeParse(next);
      if (!parsed.success)
        throw new FeatureVideoError(
          "Those edits would leave the post invalid.",
          400
        );
      return {
        status: "applied" as const,
        ...(await commit(slug, current, parsed.data, now)),
      };
    });
  }

  /**
   * Copies a project under a new name, such as a 30 s cut of the 60 s
   * promo. The copy starts at revision 1 with an empty history. It gets its
   * own copy of the media unless shareMedia is set; then it plays the
   * original's files, and the original must stay where it is.
   */
  async function duplicate(
    slug: string,
    input: { slug: string; title?: string; shareMedia?: boolean },
    now = Date.now()
  ): Promise<{ file: FeatureVideoFile; folder: string }> {
    const source = await readFile(slug);
    const dir = folder(input.slug);
    const project = {
      ...(input.shareMedia
        ? source.project
        : rehomeFeatureMediaUrls(source.project, slug, input.slug)),
      updatedAt: now,
    };
    const parsed = FeatureVideoFileSchema.safeParse({
      format: FEATURE_VIDEO_FILE_FORMAT,
      slug: input.slug,
      title: (input.title ?? `${source.title} (copy)`).slice(0, 120),
      revision: 1,
      savedAt: now,
      project,
    });
    if (!parsed.success)
      throw new FeatureVideoError(
        "The copy needs a title of 1 to 120 characters.",
        400
      );
    const file = parsed.data;
    return serialize(input.slug, async () => {
      await fs.mkdir(root, { recursive: true });
      try {
        await fs.mkdir(dir);
      } catch (cause) {
        if (code(cause) === "EEXIST")
          throw new FeatureVideoError(
            `A feature video named ${input.slug} already exists.`,
            409
          );
        throw cause;
      }
      for (const sub of ["history", "captures", "exports"])
        await fs.mkdir(path.join(dir, sub), { recursive: true });
      if (!input.shareMedia)
        await fs
          .cp(path.join(folder(slug), "media"), path.join(dir, "media"), {
            recursive: true,
          })
          .catch((cause: unknown) => {
            if (code(cause) !== "ENOENT") throw cause;
          });
      for (const name of FEATURE_VIDEO_MEDIA_FOLDERS)
        await fs.mkdir(path.join(dir, "media", name), { recursive: true });
      await writeFile(input.slug, file);
      return { file, folder: dir };
    });
  }
```

3. Replace the return line with:

```ts
  return {
    root,
    folder,
    create,
    read,
    write,
    revision,
    list,
    applyOps,
    duplicate,
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-store.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
git add src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
git commit -m "Apply named edits to feature videos on disk and copy projects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/server/feature-video-store.ts tests/unit/media-composition/feature-video-store.test.ts
```

---

### Task 9: Editor sessions that hold a feature video

The manifest bridge lets the CLI edit the post an editor has open. Three changes make it work for feature videos. The bridge guard lets a script add and remove a feature video's own takes (files in its media folder) while every other take and all timing stay locked. Each editor session remembers which feature video it holds, so the CLI and the ops route can find it, and the heartbeat answers with that project's revision on disk, so the editor learns when the file changed under it. Last, a take that arrives through the bridge loads its video at once.

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts` (whole file)
- Modify: `src/lib/server/post-project-dev-bridge.ts` (imports at line 1, `Session` at lines 29-37, `listPostProjectSessions` at lines 46-63, `readPostProjectSession` at lines 65-76, `heartbeatPostProject` at lines 78-100, one new export after it)
- Modify: `src/routes/api/dev/post-project/+server.ts` (imports; the heartbeat branch of `POST`)
- Modify: `src/lib/shared/media-composition/services/post-project-dev-client.ts` (whole file)
- Modify: `src/lib/shared/media-composition/state/post-editor-state.svelte.ts` (the end of `replaceManifestFromDev`, near line 944)
- Test: `tests/unit/media-composition/feature-video-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-bridge.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { featureVideos } from "$lib/server/feature-video-store";
import {
  activeFeatureVideoSession,
  heartbeatPostProject,
  listPostProjectSessions,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { applyPostProjectOps } from "$lib/shared/media-composition/domain/post-project-ops";
import { createTakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import { startPostProjectDevBridge } from "$lib/shared/media-composition/services/post-project-dev-client";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { POST as postProjectRoute } from "../../../src/routes/api/dev/post-project/+server";
import { routeEvent, tempFeatureRoot } from "./feature-video-test-helpers";
import { NOW, project, take } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const FEATURE_URL = featureVideoMediaUrl("promo", "footage/a.mp4");
const empty = () => project([], [], []);
const withFeatureTake = () =>
  applyPostProjectOps(
    empty(),
    [{ op: "add-take", url: FEATURE_URL, durationSeconds: 4, append: true }],
    ctx
  );

describe("the bridge guard", () => {
  it("lets the bridge add and remove a feature video's own takes", () => {
    const added = withFeatureTake();
    expect(bridgeLockedChange(empty(), added)).toBeNull();
    const removed = applyPostProjectOps(
      added,
      [{ op: "remove-take", take: "take-1" }],
      ctx
    );
    expect(bridgeLockedChange(added, removed)).toBeNull();
  });

  it("still locks every other take and the timings", () => {
    expect(bridgeLockedChange(empty(), { ...empty(), takes: [take("x")] })).toBe(
      "takes"
    );
    const timed = {
      ...empty(),
      timings: {
        x: createTakeTiming({
          sequenceId: "seq",
          takeKey: "key-x",
          durationSeconds: 20,
          now: NOW,
        }),
      },
    };
    expect(bridgeLockedChange(empty(), timed)).toBe("timings");
  });
});

describe("feature video editor sessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("remember the project they hold", () => {
    const id = randomUUID();
    heartbeatPostProject({
      sessionId: id,
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-a",
    });
    expect(activeFeatureVideoSession("held-a")).toBe(id);
    expect(activeFeatureVideoSession("held-nowhere")).toBeNull();
    expect(
      listPostProjectSessions().find((session) => session.id === id)
        ?.featureSlug
    ).toBe("held-a");
    expect(readPostProjectSession(id)?.featureSlug).toBe("held-a");
  });

  it("cannot change project or name a bad one", () => {
    const id = randomUUID();
    heartbeatPostProject({
      sessionId: id,
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-b",
    });
    expect(() =>
      heartbeatPostProject({ sessionId: id, revision: 1, featureSlug: "held-c" })
    ).toThrow("The editor session changed project.");
    expect(() => heartbeatPostProject({ sessionId: id, revision: 1 })).toThrow(
      "The editor session changed project."
    );
    expect(() =>
      heartbeatPostProject({
        sessionId: randomUUID(),
        revision: 0,
        snapshot: empty(),
        featureSlug: "Bad Name",
      })
    ).toThrow("Invalid editor session.");
  });

  it("let go of the project once the editor goes quiet", () => {
    heartbeatPostProject({
      sessionId: randomUUID(),
      revision: 0,
      snapshot: empty(),
      featureSlug: "held-d",
    });
    const later = Date.now() + 11_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    expect(activeFeatureVideoSession("held-d")).toBeNull();
  });
});

describe("the editor heartbeat", () => {
  let root: string;
  let savedRoot: string | undefined;

  beforeEach(async () => {
    savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
    root = await tempFeatureRoot();
    process.env.TKA_FEATURE_VIDEO_ROOT = root;
  });

  afterEach(async () => {
    if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
    else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
    await fs.rm(root, { recursive: true, force: true });
  });

  const heartbeat = (body: Record<string, unknown>) =>
    postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId: randomUUID(),
          revision: 0,
          ...body,
        }),
      }) as never
    );

  it("answers a feature video editor with the revision on disk", async () => {
    const { file } = await featureVideos().create({
      slug: "beat",
      title: "Beat",
      sequenceId: "seq",
    });
    const response = await heartbeat({
      snapshot: file.project,
      featureSlug: "beat",
    });
    expect(await response.json()).toMatchObject({
      command: null,
      featureRevision: 1,
    });
  });

  it("answers an ordinary editor as before", async () => {
    const response = await heartbeat({ snapshot: empty() });
    expect(await response.json()).not.toHaveProperty("featureRevision");
  });
});

describe("the editor's bridge client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the feature video's name and reports its revision on disk", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return Response.json({
          command: null,
          fingerprint: "f",
          featureRevision: 7,
        });
      })
    );
    const revisions: number[] = [];
    const stop = startPostProjectDevBridge(
      {
        snapshot: empty(),
        saveRevision: 0,
        replaceManifestFromDev: () => ({ ok: true }),
      },
      {
        featureSlug: "promo",
        onFeatureRevision: (revision) => revisions.push(revision),
      }
    );
    try {
      await vi.waitFor(() => expect(revisions.length).toBeGreaterThan(0));
      expect(revisions[0]).toBe(7);
      expect(bodies[0]).toMatchObject({
        kind: "heartbeat",
        featureSlug: "promo",
      });
    } finally {
      stop();
    }
  });
});

describe("a take the bridge adds", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("plays at once, with its timing open", () => {
    const editor = createPostEditorState({
      getSequence: () =>
        ({
          id: "seq",
          steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
        }) as unknown as SequenceData,
      now: () => NOW + 10,
    });
    const base = editor.snapshot;
    const next = applyPostProjectOps(
      base,
      [{ op: "add-take", url: FEATURE_URL, durationSeconds: 4, append: true }],
      { now: NOW + 5 }
    );
    expect(editor.replaceManifestFromDev(next, base)).toEqual({ ok: true });
    const takeId = editor.takes[0]?.id ?? "";
    expect(editor.mediaUrl(takeId)).toBe(FEATURE_URL);
    expect(editor.timing(takeId)).not.toBeNull();
    editor.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-bridge.test.ts`
Expected: FAIL. `activeFeatureVideoSession` is not exported; the guard returns `"takes"` for the feature take; the heartbeat answer has no `featureRevision`; the bridge client sends no `featureSlug`; `editor.mediaUrl` is `null`.

- [ ] **Step 3: Let the guard pass feature video takes**

Replace the whole of `src/lib/shared/media-composition/domain/post-project-bridge-guard.ts` with:

```ts
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

/**
 * Parts of a post the manifest bridge may not change: the media and timing
 * a post is built from. A take's name is only a label, so it may change.
 * A feature video's own footage, a take playing from its media folder, may
 * be added and removed: the CLI puts the file there first.
 */
const LOCKED_KEYS = [
  "takes",
  "images",
  "timings",
  "mappingPreviewAppearances",
  "fonts",
  "importSource",
] as const;

function lockedValue(project: PostProject, key: (typeof LOCKED_KEYS)[number]) {
  if (key !== "takes") return project[key] ?? null;
  return project.takes
    .filter(
      (take) =>
        !(take.ref.kind === "linked" && isFeatureVideoMediaUrl(take.ref.url))
    )
    .map(({ label: _label, ...take }) => take);
}

/** The first locked part `next` changes, or null when it changes none. */
export function bridgeLockedChange(
  current: PostProject,
  next: PostProject
): string | null {
  for (const key of LOCKED_KEYS)
    if (
      JSON.stringify(lockedValue(next, key)) !==
      JSON.stringify(lockedValue(current, key))
    )
      return key;
  return null;
}
```

- [ ] **Step 4: Remember the feature video in each session**

In `src/lib/server/post-project-dev-bridge.ts`:

1. Add after the first import line:

```ts
import { isFeatureVideoSlug } from "$lib/shared/media-composition/domain/feature-video";
```

2. In `type Session`, add after `seenAt: number;`:

```ts
  /** The feature video this editor has open, when it has one. */
  featureSlug?: string;
```

3. In `listPostProjectSessions`, replace the `.map(...)` call with:

```ts
    .map(
      ({
        id,
        revision,
        fingerprint,
        snapshot,
        seenAt,
        featureSlug,
        command,
        result,
      }) => ({
        id,
        sequenceId: snapshot.sequenceId,
        featureSlug: featureSlug ?? null,
        revision,
        fingerprint,
        seenAt,
        pendingCommandId: command?.id ?? null,
        result: result ?? null,
      })
    );
```

4. In `readPostProjectSession`, add `featureSlug: session.featureSlug ?? null,` on the line after `id: session.id,`.

5. In `heartbeatPostProject`, add `featureSlug?: string;` to the input type after `snapshot?: unknown;`. Replace its opening check and session lookup:

```ts
  if (
    !/^[0-9a-f-]{36}$/i.test(input.sessionId) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0
  )
    throw new Error("Invalid editor session.");
  let session = sessions.get(input.sessionId);
```

with:

```ts
  if (
    !/^[0-9a-f-]{36}$/i.test(input.sessionId) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    (input.featureSlug !== undefined && !isFeatureVideoSlug(input.featureSlug))
  )
    throw new Error("Invalid editor session.");
  let session = sessions.get(input.sessionId);
  if (session && (session.featureSlug ?? null) !== (input.featureSlug ?? null))
    throw new Error("The editor session changed project.");
```

In the same function, in the object literal that creates a new session (`session = { id: input.sessionId, ... seenAt: Date.now(), };`), add after `seenAt: Date.now(),`:

```ts
        ...(input.featureSlug ? { featureSlug: input.featureSlug } : {}),
```

6. Add this export directly after `heartbeatPostProject`:

```ts
/** The newest active editor session holding this feature video, or null. */
export function activeFeatureVideoSession(slug: string): string | null {
  const now = Date.now();
  let newest: Session | undefined;
  for (const session of sessions.values())
    if (
      session.featureSlug === slug &&
      now - session.seenAt < ACTIVE_MS &&
      (!newest || session.seenAt > newest.seenAt)
    )
      newest = session;
  return newest?.id ?? null;
}
```

- [ ] **Step 5: Answer a feature video heartbeat with the revision on disk**

In `src/routes/api/dev/post-project/+server.ts`, add after the `$lib/server/dev-loopback` import:

```ts
import { featureVideos } from "$lib/server/feature-video-store";
```

Replace the whole `if (input.kind === "heartbeat") { ... }` branch with:

```ts
    if (input.kind === "heartbeat") {
      if (
        typeof input.sessionId !== "string" ||
        typeof input.revision !== "number" ||
        (input.featureSlug !== undefined &&
          typeof input.featureSlug !== "string")
      )
        error(400, "Invalid heartbeat");
      const featureSlug =
        typeof input.featureSlug === "string" ? input.featureSlug : undefined;
      const answer = heartbeatPostProject({
        sessionId: input.sessionId,
        revision: input.revision,
        ...(featureSlug ? { featureSlug } : {}),
        ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
        ...(input.result && typeof input.result === "object"
          ? {
              result: input.result as {
                commandId: string;
                status: "completed" | "failed";
                message: string;
              },
            }
          : {}),
      });
      if (!featureSlug) return json(answer);
      // The editor compares this with the revision it last saved or loaded.
      const featureRevision = await featureVideos()
        .revision(featureSlug)
        .catch(() => null);
      return json({ ...answer, featureRevision });
    }
```

- [ ] **Step 6: Send the slug from the editor and pass back the revision**

Replace the whole of `src/lib/shared/media-composition/services/post-project-dev-client.ts` with:

```ts
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

const ENDPOINT = "/api/dev/post-project";

export interface PostProjectDevBridgeOptions {
  /** The feature video this editor has open, so the CLI edits through it. */
  featureSlug?: string;
  /** Called after each heartbeat with that project's revision on disk. */
  onFeatureRevision?: (revision: number) => void;
}

/** Local editor handshake. The server owns queueing; editor state owns applying. */
export function startPostProjectDevBridge(
  editor: {
    readonly snapshot: PostProject;
    readonly saveRevision: number;
    replaceManifestFromDev(
      project: unknown,
      base: PostProject
    ): { ok: boolean; error?: string };
  },
  options: PostProjectDevBridgeOptions = {}
): () => void {
  const sessionId = crypto.randomUUID();
  const abort = new AbortController();
  const seen = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sentSnapshot = "";
  let result:
    | { commandId: string; status: "completed" | "failed"; message: string }
    | undefined;

  async function poll() {
    if (stopped) return;
    try {
      const snapshot = editor.snapshot;
      const encoded = JSON.stringify(snapshot);
      const includeSnapshot = encoded !== sentSnapshot;
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId,
          revision: editor.saveRevision,
          ...(options.featureSlug ? { featureSlug: options.featureSlug } : {}),
          ...(includeSnapshot ? { snapshot } : {}),
          ...(result ? { result } : {}),
        }),
        signal: abort.signal,
      });
      if (!response.ok)
        throw new Error(`Bridge heartbeat failed: ${response.status}`);
      const data = (await response.json()) as {
        command: {
          id: string;
          baseSnapshot: PostProject;
          project: PostProject;
        } | null;
        featureRevision?: number | null;
      };
      if (!data || !("command" in data))
        throw new Error("Invalid bridge response");
      sentSnapshot = encoded;
      result = undefined;
      const command = data.command;
      if (command && !seen.has(command.id)) {
        seen.add(command.id);
        let applied: { ok: boolean; error?: string };
        try {
          applied = editor.replaceManifestFromDev(
            command.project,
            command.baseSnapshot
          );
        } catch (cause) {
          applied = {
            ok: false,
            error:
              cause instanceof Error
                ? cause.message
                : "Editor rejected the edit.",
          };
        }
        result = {
          commandId: command.id,
          status: applied.ok ? "completed" : "failed",
          message: applied.ok
            ? "Applied in editor."
            : (applied.error ?? "Editor rejected the edit."),
        };
      }
      if (typeof data.featureRevision === "number")
        options.onFeatureRevision?.(data.featureRevision);
    } catch {
      // A stopped or temporarily unavailable dev server must not affect editing.
      sentSnapshot = "";
    } finally {
      if (!stopped) timer = setTimeout(poll, 1000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    abort.abort();
  };
}
```

- [ ] **Step 7: Load a bridge-added take at once**

In `src/lib/shared/media-composition/state/post-editor-state.svelte.ts`, at the end of `replaceManifestFromDev`, replace:

```ts
    commit({
      ...normalized,
      updatedAt: Math.max(now(), project.updatedAt + 1, normalized.updatedAt),
    });
    return { ok: true };
  }
```

with:

```ts
    commit({
      ...normalized,
      updatedAt: Math.max(now(), project.updatedAt + 1, normalized.updatedAt),
    });
    // A take added through the bridge plays straight away.
    loadSavedMedia();
    return { ok: true };
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-bridge.test.ts tests/unit/media-composition/post-project-dev-bridge.test.ts tests/unit/media-composition/post-project-bridge-guard.test.ts tests/unit/media-composition/dev-loopback.test.ts src/routes/api/dev/post-project/post-project-route.test.ts`
Expected: PASS. The new file has 9 tests; the four existing files pass unchanged.

- [ ] **Step 9: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project-bridge-guard.ts src/lib/server/post-project-dev-bridge.ts "src/routes/api/dev/post-project/+server.ts" src/lib/shared/media-composition/services/post-project-dev-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-bridge.test.ts
git add src/lib/shared/media-composition/domain/post-project-bridge-guard.ts src/lib/server/post-project-dev-bridge.ts "src/routes/api/dev/post-project/+server.ts" src/lib/shared/media-composition/services/post-project-dev-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-bridge.test.ts
git commit -m "Editor sessions hold feature videos and hear their disk revision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-project-bridge-guard.ts src/lib/server/post-project-dev-bridge.ts "src/routes/api/dev/post-project/+server.ts" src/lib/shared/media-composition/services/post-project-dev-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-bridge.test.ts
```

---

### Task 10: Ops and copy routes

Two routes complete the server side. The ops route applies named edits to the file on disk, and refuses with 409 while an editor holds the project, so an edit can never land on disk behind an open editor's back. The copy route makes a new project from an old one.

**Files:**
- Create: `src/routes/api/dev/feature-videos/[slug]/ops/+server.ts`
- Create: `src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts`
- Modify: `tests/unit/media-composition/feature-video-routes.test.ts` (imports; one new `describe` block at the end)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/media-composition/feature-video-routes.test.ts`, add these imports to the top of the file, next to the others:

```ts
import { randomUUID } from "node:crypto";
import { heartbeatPostProject } from "$lib/server/post-project-dev-bridge";
import { POST as opsRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/ops/+server";
import { POST as duplicateRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/duplicate/+server";
```

Then append at the end of the file:

```ts
describe("named edits and copies", () => {
  const ops = (slug: string, body: unknown) =>
    opsRoute(
      routeEvent(`/api/dev/feature-videos/${slug}/ops`, {
        method: "POST",
        params: { slug },
        body: JSON.stringify(body),
      }) as never
    );
  const duplicate = (slug: string, body: unknown) =>
    duplicateRoute(
      routeEvent(`/api/dev/feature-videos/${slug}/duplicate`, {
        method: "POST",
        params: { slug },
        body: JSON.stringify(body),
      }) as never
    );

  it("applies named edits to the file", async () => {
    await create(promo);
    const applied = await ops("promo", {
      ops: [{ op: "background", background: "blur" }],
    });
    expect(await applied.json()).toMatchObject({
      status: "applied",
      revision: 2,
    });
    expect(await thrownStatus(() => ops("promo", { ops: "background" }))).toBe(
      400
    );
    expect(
      await thrownStatus(() =>
        ops("promo", { ops: [{ op: "remove-take", take: "nope" }] })
      )
    ).toBe(400);
  });

  it("refuses while an editor holds the project", async () => {
    await create({ ...promo, slug: "held" });
    const { file } = await (await read("held")).json();
    heartbeatPostProject({
      sessionId: randomUUID(),
      revision: 0,
      snapshot: file.project,
      featureSlug: "held",
    });
    expect(
      await thrownStatus(() =>
        ops("held", { ops: [{ op: "background", background: "blur" }] })
      )
    ).toBe(409);
  });

  it("copies a project", async () => {
    await create(promo);
    const copied = await duplicate("promo", { slug: "promo-30s" });
    expect(copied.status).toBe(201);
    expect((await copied.json()).file).toMatchObject({
      slug: "promo-30s",
      title: "Promo 1.0 (copy)",
      revision: 1,
    });
    expect(await thrownStatus(() => duplicate("promo", { slug: 5 }))).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-routes.test.ts`
Expected: FAIL, with an error that the ops and duplicate route modules cannot be resolved.

- [ ] **Step 3: Write the ops route**

Create `src/routes/api/dev/feature-videos/[slug]/ops/+server.ts`:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";
import { activeFeatureVideoSession } from "$lib/server/post-project-dev-bridge";

/**
 * Dev only: named edits to a feature video on disk. While an editor has the
 * project open, edits go through that editor instead, so its undo history
 * and its next save include them.
 */
export const POST: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const slug = params.slug ?? "";
  const input = await readJsonBody(request, 1_000_000);
  if (!Array.isArray(input.ops)) error(400, "Send ops, a list of named edits.");
  if (activeFeatureVideoSession(slug))
    error(
      409,
      `An editor has ${slug} open; send edits through it (the CLI does this for you).`
    );
  try {
    return json(await featureVideos().applyOps(slug, input.ops));
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 4: Write the copy route**

Create `src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts`:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";

/** Dev only: copies a feature video under a new name. */
export const POST: RequestHandler = async ({
  request,
  params,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request, 64_000);
  if (
    typeof input.slug !== "string" ||
    (input.title !== undefined && typeof input.title !== "string") ||
    (input.shareMedia !== undefined && typeof input.shareMedia !== "boolean")
  )
    error(
      400,
      "Send slug, the copy's name, plus title and shareMedia when you want them."
    );
  try {
    const copied = await featureVideos().duplicate(params.slug ?? "", {
      slug: input.slug,
      ...(typeof input.title === "string" ? { title: input.title } : {}),
      ...(input.shareMedia === true ? { shareMedia: true } : {}),
    });
    return json(copied, { status: 201 });
  } catch (cause) {
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-routes.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write "src/routes/api/dev/feature-videos/[slug]/ops/+server.ts" "src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
git add "src/routes/api/dev/feature-videos/[slug]/ops/+server.ts" "src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
git commit -m "Dev routes for named edits on disk and project copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/routes/api/dev/feature-videos/[slug]/ops/+server.ts" "src/routes/api/dev/feature-videos/[slug]/duplicate/+server.ts" tests/unit/media-composition/feature-video-routes.test.ts
```

---

### Task 11: The editor's storage port

The editor reads and writes this device's storage directly: the post, each take's timing, the undo history and the pre-import backup. A feature video must never touch the ordinary post for the same sequence, so every one of those calls moves behind one small interface. The device implementation binds the existing functions, so the ordinary post behaves exactly as before. The undo history store also learns to work under any key prefix, so a feature video's history neither shares nor evicts the ordinary one.

`resolvePostStudioDraft`, which `importProject` also calls, reads only the records it is handed, so it stays as it is.

**Files:**
- Create: `src/lib/shared/media-composition/services/post-editor-store.ts`
- Modify: `src/lib/shared/media-composition/services/post-editor-history-store.ts` (`storageKey` at lines 68-70, `write` at lines 89-109, `savePostEditorHistory` at lines 111-151, `loadPostEditorHistory` at lines 221-241)
- Modify: `src/lib/shared/media-composition/state/post-editor-state.svelte.ts` (imports at lines 69-91, the doc comment at lines 94-104, `PostEditorDeps` at lines 138-148, and the ten storage calls listed in Step 5)
- Test: `tests/unit/media-composition/post-editor-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-editor-store.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTakeTap,
  createTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  createPostEditorHistoryStorage,
  loadPostEditorHistory,
  savePostEditorHistory,
} from "$lib/shared/media-composition/services/post-editor-history-store";
import type { PostEditorStore } from "$lib/shared/media-composition/services/post-editor-store";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const NOW = 1_780_000_000_000;
const FEATURE_PREFIX = "tka:feature-video:v1:promo:history:";

const sequence = () =>
  ({
    id: "seq",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

/** Every Post Studio key in this browser's storage. */
function postStudioKeys(): string[] {
  const keys: string[] = [];
  for (const storage of [localStorage, sessionStorage])
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("tka:post-studio:")) keys.push(key);
    }
  return keys;
}

/** A store that keeps everything in memory and notes each call. */
function memoryStore() {
  const calls: string[] = [];
  const timings = new Map<string, TakeTiming>();
  const history = createPostEditorHistoryStorage("test:memory:history:");
  let saved: PostProject | null = null;
  const store: PostEditorStore = {
    openProject(sequenceId, now) {
      calls.push("openProject");
      return saved ?? createEmptyPostProject({ sequenceId, now });
    },
    saveProject(project) {
      calls.push("saveProject");
      saved = project;
      return { ok: true };
    },
    backupBeforeImport() {
      calls.push("backupBeforeImport");
    },
    loadTiming(sequenceId, takeKey) {
      calls.push("loadTiming");
      return timings.get(`${sequenceId}\n${takeKey}`) ?? null;
    },
    saveTiming(timing) {
      calls.push("saveTiming");
      timings.set(`${timing.sequenceId}\n${timing.takeKey}`, timing);
      return { ok: true };
    },
    openTiming(input) {
      calls.push("openTiming");
      return (
        timings.get(`${input.sequenceId}\n${input.takeKey}`) ??
        createTakeTiming({
          sequenceId: input.sequenceId,
          takeKey: input.takeKey,
          durationSeconds: input.durationSeconds,
          now: input.now,
        })
      );
    },
    loadHistory(head) {
      calls.push("loadHistory");
      return history.load(head);
    },
    saveHistory(entry) {
      calls.push("saveHistory");
      history.save(entry);
    },
  };
  return { store, calls, saved: () => saved };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the editor's storage port", () => {
  it("sends every save and load to the store it is given", () => {
    vi.useFakeTimers();
    const memory = memoryStore();
    const editor = createPostEditorState({
      getSequence: sequence,
      now: () => Date.now(),
      store: memory.store,
    });
    editor.addCatalogVideo({
      videoId: "v1",
      label: "v1",
      url: "https://example.test/v1.mp4",
      durationSeconds: 20,
    });
    const takeId = editor.takes[0]?.id ?? "";
    editor.editTiming(takeId, (timing) =>
      addTakeTap(timing, 2, editor.moveBeats)
    );
    editor.undo();
    editor.redo();
    vi.advanceTimersByTime(1_000);
    editor.dispose();
    expect(memory.calls).toEqual(
      expect.arrayContaining([
        "openProject",
        "loadHistory",
        "saveProject",
        "loadTiming",
        "openTiming",
        "saveTiming",
        "saveHistory",
      ])
    );
    expect(memory.saved()?.takes).toHaveLength(1);
    expect(postStudioKeys()).toEqual([]);
  });

  it("backs up through the store before an import", () => {
    const memory = memoryStore();
    const editor = createPostEditorState({
      getSequence: sequence,
      now: () => Date.now(),
      store: memory.store,
    });
    editor.importProject({
      ...createEmptyPostProject({ sequenceId: "seq", now: NOW }),
      audio: "silent",
    });
    expect(memory.calls).toContain("backupBeforeImport");
    expect(postStudioKeys()).toEqual([]);
    editor.dispose();
  });
});

describe("undo history under its own prefix", () => {
  const head = {
    ...createEmptyPostProject({ sequenceId: "seq", now: NOW }),
    updatedAt: NOW + 2,
  };
  const past = [{ project: createEmptyPostProject({ sequenceId: "seq", now: NOW }) }];

  it("keeps a feature video's history apart from the ordinary post's", () => {
    const feature = createPostEditorHistoryStorage(FEATURE_PREFIX);
    feature.save({ head, past, future: [] });
    expect(sessionStorage.getItem(`${FEATURE_PREFIX}seq`)).not.toBeNull();
    expect(feature.load(head)?.past).toHaveLength(1);
    expect(loadPostEditorHistory(head)).toBeNull();
    expect(postStudioKeys()).toEqual([]);
  });

  it("makes room only among its own histories when the tab is full", () => {
    savePostEditorHistory({ head, past, future: [] });
    const ordinary = sessionStorage.getItem("tka:post-studio:history:v1:seq");
    expect(ordinary).not.toBeNull();
    const realSetItem = Storage.prototype.setItem;
    let failures = 1;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith(FEATURE_PREFIX) && failures > 0) {
        failures -= 1;
        throw new DOMException("The tab is full.", "QuotaExceededError");
      }
      return realSetItem.call(this, key, value);
    });
    createPostEditorHistoryStorage(FEATURE_PREFIX).save({
      head,
      past,
      future: [],
    });
    expect(sessionStorage.getItem("tka:post-studio:history:v1:seq")).toBe(
      ordinary
    );
    expect(sessionStorage.getItem(`${FEATURE_PREFIX}seq`)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-editor-store.test.ts`
Expected: FAIL. `createPostEditorHistoryStorage` is not exported, and the editor ignores `store`, so device keys appear.

- [ ] **Step 3: Let the history store work under any prefix**

In `src/lib/shared/media-composition/services/post-editor-history-store.ts`:

1. Replace `storageKey` (lines 68-70) with:

```ts
function storageKey(prefix: string, sequenceId: string): string {
  return `${prefix}${sequenceId}`;
}
```

2. Replace `write` (lines 89-109) with:

```ts
/**
 * Writes the history; when the tab is full, other posts' histories under
 * the same prefix go first. Histories under another prefix are left alone.
 */
function write(store: Storage, prefix: string, key: string, text: string): void {
  try {
    store.setItem(key, text);
    return;
  } catch {
    // Full or blocked; try once more with room made below.
  }
  try {
    const others: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const other = store.key(index);
      if (other?.startsWith(prefix) && other !== key) others.push(other);
    }
    for (const other of others) store.removeItem(other);
    store.setItem(key, text);
  } catch {
    // An older history would no longer lead to the saved post.
    forget(store, key);
  }
}
```

3. Replace `export function savePostEditorHistory(history: PostEditorHistory): void {` and its first lines:

```ts
export function savePostEditorHistory(history: PostEditorHistory): void {
  const store = storage();
  if (!store) return;
  const key = storageKey(history.head.sequenceId);
```

with:

```ts
function saveHistoryAt(prefix: string, history: PostEditorHistory): void {
  const store = storage();
  if (!store) return;
  const key = storageKey(prefix, history.head.sequenceId);
```

and, in the same function body, change the `write(` call's first two arguments from `store,` `key,` to `store,` `prefix,` `key,`. The rest of the body stays as it is.

4. Replace `loadPostEditorHistory` (lines 221-241, with its doc comment) with:

```ts
function loadHistoryAt(
  prefix: string,
  head: PostProject
): RestoredPostEditorHistory | null {
  const store = storage();
  if (!store) return null;
  const key = storageKey(prefix, head.sequenceId);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const restored = parseHistory(JSON.parse(raw) as unknown, head);
    if (!restored) forget(store, key);
    return restored;
  } catch {
    forget(store, key);
    return null;
  }
}

export function savePostEditorHistory(history: PostEditorHistory): void {
  saveHistoryAt(PREFIX, history);
}

/**
 * The history kept for this post, when it leads up to exactly this save.
 * Any other history for the post is stale and is cleared.
 */
export function loadPostEditorHistory(
  head: PostProject
): RestoredPostEditorHistory | null {
  return loadHistoryAt(PREFIX, head);
}

/**
 * The same history kept under another key prefix, so a post kept somewhere
 * else, such as a feature video on disk, never shares or evicts the
 * ordinary post's history.
 */
export function createPostEditorHistoryStorage(prefix: string): {
  save(history: PostEditorHistory): void;
  load(head: PostProject): RestoredPostEditorHistory | null;
} {
  return {
    save: (history) => saveHistoryAt(prefix, history),
    load: (head) => loadHistoryAt(prefix, head),
  };
}
```

- [ ] **Step 4: Write the port**

Create `src/lib/shared/media-composition/services/post-editor-store.ts`:

```ts
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import type { TakeTiming } from "$lib/shared/media-composition/domain/take-timing";
import {
  loadPostEditorHistory,
  savePostEditorHistory,
  type PostEditorHistory,
  type RestoredPostEditorHistory,
} from "$lib/shared/media-composition/services/post-editor-history-store";
import {
  backupPostProjectBeforeImport,
  openPostProject,
  savePostProject,
  type SaveResult,
} from "$lib/shared/media-composition/services/post-project-store";
import {
  loadTakeTiming,
  openTakeTiming,
  saveTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";

/**
 * Where the Post editor keeps a post, each take's timing and the undo
 * history. The ordinary post uses this device's storage; a feature video
 * passes a store backed by its folder on disk, so it never reads or writes
 * the ordinary post for the same sequence.
 */
export interface PostEditorStore {
  /** The saved post for the sequence, or a new empty one. */
  openProject(sequenceId: string, now: number): PostProject;
  saveProject(project: PostProject): SaveResult;
  /** Keeps the current post before an import replaces it. */
  backupBeforeImport(project: PostProject): void;
  loadTiming(sequenceId: string, takeKey: string): TakeTiming | null;
  saveTiming(timing: TakeTiming): SaveResult;
  /** The saved timing for the take, or a new unmapped one. */
  openTiming(input: {
    sequenceId: string;
    takeKey: string;
    durationSeconds: number;
    movesPerPass: number;
    now: number;
  }): TakeTiming;
  loadHistory(head: PostProject): RestoredPostEditorHistory | null;
  saveHistory(history: PostEditorHistory): void;
}

/** This device's storage, as the ordinary post has always used it. */
export const devicePostEditorStore: PostEditorStore = {
  openProject: openPostProject,
  saveProject: savePostProject,
  backupBeforeImport: backupPostProjectBeforeImport,
  loadTiming: loadTakeTiming,
  saveTiming: saveTakeTiming,
  openTiming: (input) => openTakeTiming(input),
  loadHistory: loadPostEditorHistory,
  saveHistory: savePostEditorHistory,
};
```

- [ ] **Step 5: Send the editor's storage calls through the port**

In `src/lib/shared/media-composition/state/post-editor-state.svelte.ts`:

1. Delete this import (lines 69-73):

```ts
import {
  openPostProject,
  backupPostProjectBeforeImport,
  savePostProject,
} from "$lib/shared/media-composition/services/post-project-store";
```

2. Replace these two imports (lines 80-91):

```ts
import {
  catalogTakeKey,
  loadTakeTiming,
  localTakeKey,
  openTakeTiming,
  saveTakeTiming,
} from "$lib/shared/media-composition/services/take-timing-store";
import {
  loadPostEditorHistory,
  savePostEditorHistory,
  type PostTimingEffect,
} from "$lib/shared/media-composition/services/post-editor-history-store";
```

with:

```ts
import {
  catalogTakeKey,
  localTakeKey,
} from "$lib/shared/media-composition/services/take-timing-store";
import type { PostTimingEffect } from "$lib/shared/media-composition/services/post-editor-history-store";
import {
  devicePostEditorStore,
  type PostEditorStore,
} from "$lib/shared/media-composition/services/post-editor-store";
```

3. In the doc comment above `export type PostEditorMode`, replace:

```ts
 * Nothing here touches Firestore. The project and the timings save on this
 * device as they change, and the undo history is kept in the tab, so Undo
 * still works after a reload.
```

with:

```ts
 * Nothing here touches Firestore. The project and the timings save through
 * the editor's store as they change: this device by default, or a feature
 * video's folder on disk. The undo history is kept in the tab, so Undo
 * still works after a reload.
```

4. In `PostEditorDeps`, add after `hasAnimationOverlay?: () => boolean;`:

```ts
  /**
   * Where the post, its timings and its undo history are kept: this
   * device's storage unless a feature video passes its own.
   */
  store?: PostEditorStore;
```

5. In `createPostEditorState`, add after `const now = deps.now ?? (() => Date.now());`:

```ts
  const store = deps.store ?? devicePostEditorStore;
```

6. Replace the storage calls, each exactly once:

| Near line | Old | New |
| --- | --- | --- |
| 166 | `: openPostProject(sequence.id, now())` | `: store.openProject(sequence.id, now())` |
| 173 | `const restoredHistory = loadPostEditorHistory(project);` | `const restoredHistory = store.loadHistory(project);` |
| 366 | `const result = savePostProject(snapshot);` | `const result = store.saveProject(snapshot);` |
| 402 | `savePostEditorHistory({` | `store.saveHistory({` |
| 650 | `const saved = loadTakeTiming(sequence.id, take.takeKey);` | `const saved = store.loadTiming(sequence.id, take.takeKey);` |
| 676 | `saveTakeTiming(seeded);` | `store.saveTiming(seeded);` |
| 680 | `return openTakeTiming({` | `return store.openTiming({` |
| 736 | `loadTakeTiming(sequence.id, take.takeKey)` | `store.loadTiming(sequence.id, take.takeKey)` |
| 794 | `backupPostProjectBeforeImport(snapshotFor(project));` | `store.backupBeforeImport(snapshotFor(project));` |
| 1325 | `const result = saveTakeTiming(next);` | `const result = store.saveTiming(next);` |

Line numbers are from before this task's edits and move by a few lines; match on the text. Afterwards this must print nothing:

```bash
grep -nE "\b(openPostProject|savePostProject|backupPostProjectBeforeImport|loadTakeTiming|saveTakeTiming|openTakeTiming|loadPostEditorHistory|savePostEditorHistory)\(" src/lib/shared/media-composition/state/post-editor-state.svelte.ts
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-editor-store.test.ts tests/unit/media-composition/post-editor-persistence.test.ts tests/unit/media-composition/post-editor-history.test.ts tests/unit/media-composition/post-editor-reload-history.test.ts tests/unit/media-composition/post-editor-reload.test.ts tests/unit/media-composition/post-editor-import.test.ts tests/unit/media-composition/post-editor-tabs.test.ts`
Expected: PASS. The new file has 4 tests; the six existing editor files pass unchanged, which shows the ordinary post still saves where it did.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/services/post-editor-store.ts src/lib/shared/media-composition/services/post-editor-history-store.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/post-editor-store.test.ts
git add src/lib/shared/media-composition/services/post-editor-store.ts src/lib/shared/media-composition/services/post-editor-history-store.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/post-editor-store.test.ts
git commit -m "Route the Post editor's storage through a store it is given

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/services/post-editor-store.ts src/lib/shared/media-composition/services/post-editor-history-store.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/post-editor-store.test.ts
```

---

### Task 12: The browser side of a feature video

The Post page needs four things from the dev server: the list of feature videos, one video read whole, a store the editor saves through, and a disk save that never overwrites a newer copy unseen. This task builds them in one module that a later task wires into the page.

How the pieces fit:

- The editor saves through `store` on every edit. `store.saveProject` keeps a copy in this tab's `sessionStorage` under `tka:feature-video:v1:<slug>:project`, so a reload before the disk save lands loses nothing. Undo history goes under `tka:feature-video:v1:<slug>:history:`. Timings stay in memory and reach disk inside the post, because the editor embeds each take's timing in every save. No `tka:post-studio:` key is read or written.
- The workspace's autosave calls `save(project)`, which waits a short settle, then PUTs `{ baseRevision, project }`. A post disk already has is not sent again.
- When the server answers 409, or the editor heartbeat reports a revision this tab has not seen, `checkRevision` loads the file and hands it to `editor.adoptSaved(project, { evenIfOlder: true })`. Disk wins even when the editor's edits are later by the clock, and the editor's own version stays one Undo away.
- Saves and disk checks run one at a time in arrival order, so `baseRevision` always matches what this tab last saw. A save that was waiting while a newer disk copy replaced the editor's post is dropped: it belongs to the version now one Undo away.
- A copy this tab kept but never saved comes back after a reload, with the revision it started from. When disk moved on in the meantime, the first save or heartbeat loads disk's copy over it as an undo step, as for any other conflict.

**Files:**
- Create: `src/lib/shared/media-composition/services/feature-video-client.ts`
- Modify: `src/lib/shared/media-composition/state/post-editor-state.svelte.ts` (`adoptSaved`, near line 843)
- Test: `tests/unit/media-composition/feature-video-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { addTakeTap } from "$lib/shared/media-composition/domain/take-timing";
import {
  createFeatureVideoSync,
  listFeatureVideos,
  loadFeatureVideo,
  type FeatureVideoSync,
} from "$lib/shared/media-composition/services/feature-video-client";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

const NOW = 1_780_000_000_000;
const SEQUENCE = "seq";
const VIDEO = {
  videoId: "v1",
  label: "Take one",
  url: "https://example.test/v1.mp4",
  durationSeconds: 20,
};

const sequence = () =>
  ({
    id: SEQUENCE,
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

let clock = NOW;
const tick = () => (clock += 1_000);

function featureFile(): FeatureVideoFile {
  return {
    format: FEATURE_VIDEO_FILE_FORMAT,
    slug: "promo",
    title: "Promo",
    revision: 1,
    savedAt: NOW,
    project: createEmptyPostProject({ sequenceId: SEQUENCE, now: NOW }),
  };
}

/** A dev server stand-in that keeps one project.json in memory. */
function fakeServer(initial: FeatureVideoFile) {
  let file = initial;
  const requests: {
    method: string;
    body?: { baseRevision: number; project: PostProject };
  }[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, body });
    if (method === "GET") return Response.json({ file });
    if (body.baseRevision !== file.revision)
      return Response.json(
        { message: "promo changed on disk.", revision: file.revision },
        { status: 409 }
      );
    file = {
      ...file,
      revision: file.revision + 1,
      savedAt: tick(),
      project: body.project,
    };
    return Response.json({
      revision: file.revision,
      savedAt: file.savedAt,
      fingerprint: "f",
    });
  }) as typeof fetch;
  return {
    fetcher,
    requests,
    get file() {
      return file;
    },
    /** A save from somewhere else: another editor, the CLI or a hand edit. */
    writeElsewhere(change: Partial<PostProject>) {
      file = {
        ...file,
        revision: file.revision + 1,
        project: { ...file.project, ...change },
      };
    },
  };
}

function openEditor(sync: FeatureVideoSync) {
  return createPostEditorState({
    initialProject: sync.initialProject,
    getSequence: sequence,
    now: tick,
    store: sync.store,
  });
}

/** Every Post Studio key and value in this browser's storage. */
function postStudioEntries(): Record<string, string | null> {
  const entries: Record<string, string | null> = {};
  for (const [name, storage] of [
    ["local", localStorage],
    ["session", sessionStorage],
  ] as const)
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("tka:post-studio:"))
        entries[`${name}:${key}`] = storage.getItem(key);
    }
  return entries;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clock = NOW;
});

describe("a feature video in the Post editor", () => {
  it("never reads or writes the ordinary post for the same sequence", async () => {
    const ordinary = createPostEditorState({ getSequence: sequence, now: tick });
    ordinary.addCatalogVideo(VIDEO);
    ordinary.editTiming(ordinary.takes[0]?.id ?? "", (timing) =>
      addTakeTap(timing, 2, ordinary.moveBeats)
    );
    ordinary.dispose();
    const before = postStudioEntries();
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(3);

    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const disconnect = sync.connect(editor, () => {});
    expect(editor.takes).toEqual([]);
    editor.addCatalogVideo(VIDEO);
    const takeId = editor.takes[0]?.id ?? "";
    editor.editTiming(takeId, (timing) =>
      addTakeTap(timing, 3, editor.moveBeats)
    );
    editor.undoTiming(takeId);
    editor.redoTiming(takeId);
    editor.setAudio("silent");
    editor.undo();
    editor.redo();
    await sync.save(editor.snapshot);
    disconnect();
    editor.dispose();

    expect(server.file.revision).toBe(2);
    expect(server.file.project.takes).toHaveLength(1);
    expect(server.file.project.audio).toBe("silent");
    expect(Object.keys(server.file.project.timings ?? {})).toEqual([takeId]);
    expect(
      sessionStorage.getItem(`tka:feature-video:v1:promo:history:${SEQUENCE}`)
    ).not.toBeNull();
    expect(postStudioEntries()).toEqual(before);
  });

  it("saves from the revision it started at and skips copies disk already has", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    await sync.save({ ...server.file.project, updatedAt: NOW + 7 });
    expect(server.requests).toEqual([]);
    const silent = { ...server.file.project, audio: "silent" as const };
    await sync.save(silent);
    await sync.save({ ...silent, audio: "takes" as const });
    expect(
      server.requests.map((request) => [
        request.method,
        request.body?.baseRevision,
      ])
    ).toEqual([
      ["PUT", 1],
      ["PUT", 2],
    ]);
    expect(sync.revision).toBe(3);
    expect(server.file.project.audio).toBe("takes");
    // With the saves landed, a reload opens disk's copy.
    expect(createFeatureVideoSync(server.file).initialProject).toEqual(
      server.file.project
    );
  });

  it("loads disk's newer copy on a conflict, and Undo brings back the editor's", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const loaded = vi.fn();
    sync.connect(editor, loaded);
    editor.addCatalogVideo(VIDEO);
    server.writeElsewhere({ audio: "silent" });
    // Saved before the editor's edit, so another tab's copy would be refused.
    expect(editor.adoptSaved(server.file.project)).toBe(false);

    await expect(sync.save(editor.snapshot)).rejects.toThrow("changed on disk");
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(editor.takes).toEqual([]);
    expect(editor.project.audio).toBe("silent");
    expect(sync.revision).toBe(2);
    editor.undo();
    expect(editor.takes).toHaveLength(1);
    expect(editor.project.audio).toBe("takes");
    editor.dispose();
  });

  it("takes a newer revision the heartbeat reports, once the editor is free", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    const loaded = vi.fn();
    sync.connect(editor, loaded);
    editor.setAudio("silent");
    await sync.save(editor.snapshot);
    await sync.checkRevision(2);
    expect(server.requests.map((request) => request.method)).toEqual(["PUT"]);

    server.writeElsewhere({ audio: "takes" });
    editor.beginGesture();
    await sync.checkRevision(3);
    expect(loaded).not.toHaveBeenCalled();
    expect(sync.revision).toBe(2);
    editor.endGesture();
    await sync.checkRevision(3);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(editor.project.audio).toBe("takes");
    expect(sync.revision).toBe(3);
    editor.dispose();
  });

  it("drops a save that waited while disk's newer copy loaded", async () => {
    const server = fakeServer(featureFile());
    const sync = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(sync);
    sync.connect(editor, () => {});
    editor.setAudio("silent");
    server.writeElsewhere({});
    const check = sync.checkRevision(2);
    const waiting = sync.save(editor.snapshot);
    await check;
    await expect(waiting).resolves.toBeNull();
    expect(server.requests.map((request) => request.method)).toEqual(["GET"]);
    expect(server.file.revision).toBe(2);
    expect(editor.project.audio).toBe("takes");
    editor.undo();
    expect(editor.project.audio).toBe("silent");
    editor.dispose();
  });

  it("brings back this tab's unsaved copy after a reload, under disk's newer one", async () => {
    const server = fakeServer(featureFile());
    const before = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    // Kept in the tab; the disk save never ran.
    before.store.saveProject({
      ...server.file.project,
      audio: "silent",
      updatedAt: NOW + 5,
    });
    const reloaded = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    expect(reloaded.initialProject.audio).toBe("silent");

    server.writeElsewhere({});
    const later = createFeatureVideoSync(server.file, {
      fetcher: server.fetcher,
      settleMs: 0,
    });
    const editor = openEditor(later);
    const loaded = vi.fn();
    later.connect(editor, loaded);
    expect(editor.project.audio).toBe("silent");
    await expect(later.save(editor.snapshot)).rejects.toThrow("changed on disk");
    await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    expect(editor.project.audio).toBe("takes");
    editor.undo();
    expect(editor.project.audio).toBe("silent");
    editor.dispose();
  });

  it("keeps this tab's copy when the disk save fails", async () => {
    const file = featureFile();
    const mine = { ...file.project, audio: "silent" as const };
    const full = createFeatureVideoSync(file, {
      fetcher: (async () =>
        Response.json(
          { message: "The disk is full." },
          { status: 500 }
        )) as typeof fetch,
      settleMs: 0,
    });
    full.store.saveProject(mine);
    await expect(full.save(mine)).rejects.toThrow("The disk is full.");
    const offline = createFeatureVideoSync(file, {
      fetcher: (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch,
      settleMs: 0,
    });
    await expect(offline.save(mine)).rejects.toThrow("could not be reached");
    expect(createFeatureVideoSync(file).initialProject.audio).toBe("silent");
  });
});

describe("listing and loading", () => {
  it("lists and loads feature videos and passes on the server's message", async () => {
    const file = featureFile();
    const summary = {
      slug: "promo",
      title: "Promo",
      revision: 1,
      savedAt: NOW,
      sequenceId: SEQUENCE,
    };
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === FEATURE_VIDEO_API)
        return Response.json({ projects: [summary], unreadable: ["broken"] });
      if (url === `${FEATURE_VIDEO_API}/promo`)
        return Response.json({ file, fingerprint: "f", folder: "x" });
      if (url === `${FEATURE_VIDEO_API}/odd`)
        return Response.json({ file: { slug: "odd" } });
      return Response.json(
        { message: "No feature video named missing." },
        { status: 404 }
      );
    }) as typeof fetch;
    expect(await listFeatureVideos(fetcher)).toEqual({
      projects: [summary],
      unreadable: ["broken"],
    });
    expect(await loadFeatureVideo("promo", fetcher)).toEqual(file);
    await expect(loadFeatureVideo("odd", fetcher)).rejects.toThrow(
      "unreadable copy of odd"
    );
    await expect(loadFeatureVideo("missing", fetcher)).rejects.toThrow(
      "No feature video named missing."
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-client.test.ts`
Expected: FAIL, with an error that `feature-video-client` cannot be resolved.

- [ ] **Step 3: Write the client**

Create `src/lib/shared/media-composition/services/feature-video-client.ts`:

```ts
import {
  FEATURE_VIDEO_API,
  FeatureVideoFileSchema,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  PostProjectSchema,
  createEmptyPostProject,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  createTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import { createPostEditorHistoryStorage } from "$lib/shared/media-composition/services/post-editor-history-store";
import type { PostEditorStore } from "$lib/shared/media-composition/services/post-editor-store";
import { deepEqual } from "$lib/shared/sequence-viewer/services/viewer-url-state-codec";

/**
 * The Post page's side of a feature video: list and load them from the dev
 * server, and keep the open one in step with its folder on disk.
 *
 * Nothing here reads or writes the ordinary post for the same sequence. The
 * editor saves through `store`, whose tab copy and undo history live under
 * `tka:feature-video:v1:<slug>:`, apart from every `tka:post-studio:` key.
 */

type Fetcher = typeof fetch;

const BUFFER_PREFIX = "tka:feature-video:v1:";
const CONFLICT_MESSAGE =
  "This project changed on disk. The newer copy loads in a moment; Undo brings back yours.";

/** The answer's JSON body, or an empty one when it has none. */
async function answer(response: Response): Promise<Record<string, unknown>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or broken answer is reported by its status.
  }
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await answer(response);
  if (!response.ok)
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : `The dev server answered ${response.status}.`
    );
  return body;
}

/** The feature videos on this computer, newest first, and any unreadable ones. */
export async function listFeatureVideos(fetcher: Fetcher = fetch): Promise<{
  projects: FeatureVideoSummary[];
  unreadable: string[];
}> {
  const body = await readJson(await fetcher(FEATURE_VIDEO_API));
  if (!Array.isArray(body.projects) || !Array.isArray(body.unreadable))
    throw new Error("The dev server sent an unreadable list of feature videos.");
  return {
    projects: body.projects as FeatureVideoSummary[],
    unreadable: body.unreadable.filter(
      (name): name is string => typeof name === "string"
    ),
  };
}

/** One feature video, read whole from its folder. */
export async function loadFeatureVideo(
  slug: string,
  fetcher: Fetcher = fetch
): Promise<FeatureVideoFile> {
  const body = await readJson(
    await fetcher(`${FEATURE_VIDEO_API}/${encodeURIComponent(slug)}`)
  );
  const parsed = FeatureVideoFileSchema.safeParse(body.file);
  if (!parsed.success)
    throw new Error(`The dev server sent an unreadable copy of ${slug}.`);
  return parsed.data;
}

interface Buffered {
  /** The revision on disk when this copy was kept. */
  baseRevision: number;
  project: PostProject;
  /** True while disk does not have this copy yet. */
  dirty: boolean;
}

function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readBuffer(key: string, sequenceId: string): Buffered | null {
  try {
    const raw = tabStorage()?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Record<keyof Buffered, unknown>>;
    const project = PostProjectSchema.safeParse(value.project);
    if (
      typeof value.baseRevision !== "number" ||
      typeof value.dirty !== "boolean" ||
      !project.success ||
      project.data.sequenceId !== sequenceId
    )
      return null;
    return {
      baseRevision: value.baseRevision,
      project: project.data,
      dirty: value.dirty,
    };
  } catch {
    return null;
  }
}

function writeBuffer(key: string, value: Buffered): void {
  try {
    tabStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // A full tab loses only the copy that bridges a reload; disk saves go on.
  }
}

/** A post as saved, apart from when it was saved and an empty timing list. */
function comparable(project: PostProject): PostProject {
  return {
    ...project,
    updatedAt: 0,
    timings:
      project.timings && Object.keys(project.timings).length > 0
        ? project.timings
        : undefined,
  };
}

function sameProject(a: PostProject, b: PostProject): boolean {
  return deepEqual(comparable(a), comparable(b));
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the sync needs from the open editor; the Post editor state has both. */
export interface FeatureVideoEditor {
  readonly snapshot: PostProject;
  adoptSaved(next: PostProject, options?: { evenIfOlder?: boolean }): boolean;
}

/**
 * Keeps one open feature video in step with its folder.
 *
 * The editor saves through `store`, which keeps a copy in this tab so a
 * reload before the disk save lands loses nothing. `save` writes the post to
 * disk with the revision it started from. When the file has moved on, through
 * another editor, the CLI or a hand edit, disk wins: the newer copy loads as
 * an undo step, so the editor's own version is one Undo away.
 */
export function createFeatureVideoSync(
  file: FeatureVideoFile,
  options: { fetcher?: Fetcher; settleMs?: number } = {}
) {
  const fetcher = options.fetcher ?? fetch;
  const settleMs = options.settleMs ?? 600;
  const slug = file.slug;
  const url = `${FEATURE_VIDEO_API}/${encodeURIComponent(slug)}`;
  const bufferKey = `${BUFFER_PREFIX}${slug}:project`;
  const history = createPostEditorHistoryStorage(
    `${BUFFER_PREFIX}${slug}:history:`
  );
  const timings = new Map<string, TakeTiming>();
  const timingKey = (sequenceId: string, takeKey: string) =>
    `${sequenceId}\n${takeKey}`;

  /** The revision on disk as this tab last saw it, and its post. */
  let known = file.revision;
  let knownProject = file.project;
  /** The newest copy the editor kept; disk may not have it yet. */
  let latest: PostProject | null = null;
  /** Counts disk copies that replaced the editor's post. */
  let adoptions = 0;
  let editor: FeatureVideoEditor | null = null;
  let onLoaded: (() => void) | null = null;
  let checking = false;
  let chain: Promise<unknown> = Promise.resolve();

  // A copy this tab kept but never saved comes back with the revision it
  // started from. When disk moved on since, the first save or heartbeat
  // loads disk's copy over it as an undo step, as for any other conflict.
  const buffered = readBuffer(bufferKey, file.project.sequenceId);
  if (buffered?.dirty) {
    latest = buffered.project;
    known = buffered.baseRevision;
  }

  function keepBuffer(): void {
    const project = latest ?? knownProject;
    writeBuffer(bufferKey, {
      baseRevision: known,
      project,
      dirty: !sameProject(project, knownProject),
    });
  }

  /** Saves and disk checks run one at a time, in the order they came. */
  function inTurn<T>(run: () => Promise<T>): Promise<T> {
    const result = chain.then(run);
    chain = result.catch(() => undefined);
    return result;
  }

  const store: PostEditorStore = {
    // The editor opens initialProject; this answers only a post for another
    // sequence, which a feature video never holds.
    openProject: (sequenceId, now) =>
      createEmptyPostProject({ sequenceId, now }),
    saveProject(project) {
      latest = project;
      keepBuffer();
      // The disk save is what keeps the post; this copy only bridges a
      // reload before it lands.
      return { ok: true };
    },
    backupBeforeImport() {
      // Every earlier save is already kept in the folder's history/.
    },
    // Timings reach disk inside the post: every save embeds them.
    loadTiming: (sequenceId, takeKey) =>
      timings.get(timingKey(sequenceId, takeKey)) ?? null,
    saveTiming(timing) {
      timings.set(timingKey(timing.sequenceId, timing.takeKey), timing);
      return { ok: true };
    },
    openTiming: (input) =>
      timings.get(timingKey(input.sequenceId, input.takeKey)) ??
      createTakeTiming({
        sequenceId: input.sequenceId,
        takeKey: input.takeKey,
        durationSeconds: input.durationSeconds,
        now: input.now,
      }),
    loadHistory: (head) => history.load(head),
    saveHistory: (entry) => history.save(entry),
  };

  /**
   * Loads a newer revision from disk into the editor as one undo step. The
   * heartbeat calls this with the revision it saw, and a refused save with
   * the revision the server named. While the editor is mid-drag or in the
   * crop screen it refuses, and the next heartbeat asks again.
   */
  function checkRevision(revision: number): Promise<void> {
    if (revision === known || checking || !editor) return Promise.resolve();
    checking = true;
    return inTurn(async () => {
      try {
        if (revision === known || !editor) return;
        const next = await loadFeatureVideo(slug, fetcher);
        if (next.revision === known || !editor) return;
        if (!sameProject(next.project, editor.snapshot)) {
          if (!editor.adoptSaved(next.project, { evenIfOlder: true })) return;
          adoptions += 1;
          onLoaded?.();
        }
        known = next.revision;
        knownProject = next.project;
        latest = null;
        keepBuffer();
      } catch {
        // Unreachable or unreadable for now; the next heartbeat asks again.
      } finally {
        checking = false;
      }
    });
  }

  /**
   * Writes the post to disk. The editor's autosave sends one copy at a time
   * and keeps only the newest waiting, so a slider drag saves about once per
   * settle. Resolves to null, onSaveDraft's "nothing newer to adopt"; throws
   * the message the save banner shows.
   */
  function save(project: PostProject): Promise<null> {
    const seen = adoptions;
    return inTurn(async () => {
      await wait(settleMs);
      // A newer disk copy replaced this one in the editor while it waited;
      // this copy is one Undo away.
      if (adoptions !== seen || sameProject(project, knownProject)) return null;
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseRevision: known, project }),
        });
      } catch {
        throw new Error(
          `The dev server could not be reached to save ${slug}. This tab keeps your edits until it can.`
        );
      }
      const body = await answer(response);
      if (response.status === 409) {
        void checkRevision(
          typeof body.revision === "number" ? body.revision : known + 1
        );
        throw new Error(CONFLICT_MESSAGE);
      }
      if (!response.ok || typeof body.revision !== "number")
        throw new Error(
          typeof body.message === "string"
            ? body.message
            : `The dev server could not save ${slug} (${response.status}).`
        );
      known = body.revision;
      knownProject = project;
      keepBuffer();
      return null;
    });
  }

  return {
    slug,
    title: file.title,
    /** What the editor opens: this tab's newest copy, else disk's. */
    get initialProject(): PostProject {
      return latest ?? knownProject;
    },
    store,
    save,
    checkRevision,
    /**
     * Binds the open editor and what to do when disk's copy replaces its
     * post. Returns the unbind.
     */
    connect(next: FeatureVideoEditor, loaded: () => void): () => void {
      editor = next;
      onLoaded = loaded;
      return () => {
        if (editor !== next) return;
        editor = null;
        onLoaded = null;
      };
    },
    /** The revision on disk as this tab last saw it. */
    get revision(): number {
      return known;
    },
  };
}

export type FeatureVideoSync = ReturnType<typeof createFeatureVideoSync>;
```

- [ ] **Step 4: Let `adoptSaved` take an older copy when asked**

In `src/lib/shared/media-composition/state/post-editor-state.svelte.ts`, replace:

```ts
  /**
   * Takes a newer save of this post from another open tab, so tabs on one
   * post never drift apart. It joins the undo history like an edit but is
   * not saved again: the other tab already saved it. A copy that needs a
   * video only the other tab holds (a file picked there) is left alone.
   */
  function adoptSaved(next: PostProject): boolean {
    if (gestureBase || session) return false;
    const parsed = PostProjectSchema.safeParse(next);
    if (
      !parsed.success ||
      parsed.data.sequenceId !== project.sequenceId ||
      // This tab's own saves carry savedUpdatedAt, so only a later save from
      // somewhere else gets through.
      parsed.data.updatedAt <= Math.max(project.updatedAt, savedUpdatedAt)
    )
      return false;
```

with:

```ts
  /**
   * Takes a newer save of this post from another open tab, so tabs on one
   * post never drift apart. It joins the undo history like an edit but is
   * not saved again: the other tab already saved it. A copy that needs a
   * video only the other tab holds (a file picked there) is left alone.
   *
   * A feature video passes `evenIfOlder`: its copy on disk wins even when
   * this editor's edits are later, and Undo brings those edits back.
   */
  function adoptSaved(
    next: PostProject,
    options: { evenIfOlder?: boolean } = {}
  ): boolean {
    if (gestureBase || session) return false;
    const parsed = PostProjectSchema.safeParse(next);
    if (
      !parsed.success ||
      parsed.data.sequenceId !== project.sequenceId ||
      // This tab's own saves carry savedUpdatedAt, so only a later save from
      // somewhere else gets through.
      (!options.evenIfOlder &&
        parsed.data.updatedAt <= Math.max(project.updatedAt, savedUpdatedAt))
    )
      return false;
```

The rest of the function stays as it is.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-client.test.ts tests/unit/media-composition/post-editor-tabs.test.ts tests/unit/media-composition/post-editor-store.test.ts`
Expected: PASS. The new file has 8 tests; the tab test shows other tabs' copies still follow the newer-only rule.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/services/feature-video-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-client.test.ts
git add src/lib/shared/media-composition/services/feature-video-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-client.test.ts
git commit -m "Open, save and reconcile feature videos from the Post page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/services/feature-video-client.ts src/lib/shared/media-composition/state/post-editor-state.svelte.ts tests/unit/media-composition/feature-video-client.test.ts
```

---

### Task 13: Feature mode on the Post page

On a dev server, the Post page lists feature videos under their own heading and opens one at `/post?feature=<slug>`. The editor then saves through the feature video's store and its disk save, never through this browser's Post Studio storage or the account. Feature mode skips Post's early-access check, because everything behind it exists only on a dev server; that lets the signed-out capture browser open and render a feature video.

Three seams keep the sequence's ordinary post out of reach:

- The page state never calls `loadDraft` or `selectPostSequence` for a feature video, so the ordinary draft is not read and `/post` on its own still opens the last ordinary post.
- The editor gets the feature video's `store`, so every project, timing and history write goes under `tka:feature-video:v1:<slug>:`.
- The workspace makes no tab sync in feature mode. The tab sync is keyed by sequence id, so it would otherwise pass an ordinary post's edits from another tab into the feature video, and the feature video's edits into that tab. Disk does that job instead: the heartbeat and a refused save load a newer revision.

**Files:**
- Modify: `src/lib/features/post/state/post-module-state.svelte.ts` (whole file shown)
- Modify: `src/lib/features/post/PostModule.svelte`
- Modify: `src/lib/shared/share/components/post-studio/PostStudio.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
- Test: `tests/unit/post-module-state.test.ts`

- [ ] **Step 1: Record the type check's starting point**

Pass the resource gate first (at least 4096 MB available, and no `svelte-check` or `svelte-fast-check` already running):

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|svelte-fast-check' } | Select-Object ProcessId, CommandLine
```

Then, in the worktree:

```bash
npm run check:fast -- --no-svelte-warnings 2>&1 | grep -E "post-module-state|PostModule\.svelte|PostStudio\.svelte|PostEditorWorkspace\.svelte" > "$TEMP/check-fast-13-before.txt"; wc -l < "$TEMP/check-fast-13-before.txt"
```

Expected: a count, usually 0. These are errors the four files already had before this task; Step 7 compares against them.

- [ ] **Step 2: Write the failing tests**

In `tests/unit/post-module-state.test.ts`, replace the imports at the top:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createPostModuleState,
  type PostModuleServices,
} from "$lib/features/post/state/post-module-state.svelte";
```

with:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createFeatureVideoSync,
  type FeatureVideoSync,
} from "$lib/shared/media-composition/services/feature-video-client";
import {
  createPostModuleState,
  type PostModuleServices,
} from "$lib/features/post/state/post-module-state.svelte";
```

Then append to the end of the file:

```ts
const featureFile = (sequenceId = "seq"): FeatureVideoFile => ({
  format: FEATURE_VIDEO_FILE_FORMAT,
  slug: "promo",
  title: "Promo",
  revision: 1,
  savedAt: 1,
  project: createEmptyPostProject({ sequenceId, now: 1 }),
});

/** A dev server's services: no ordinary posts listed, one feature video. */
function devServices(
  overrides: Partial<PostModuleServices> = {}
): PostModuleServices {
  return {
    list: vi.fn(async () => ({ projects: [], error: null })),
    resolve: vi.fn(async (id: string) => sequence(id)),
    loadDraft: vi.fn(async (id: string) => ({
      project: createEmptyPostProject({ sequenceId: id, now: 1 }),
      diskAvailable: false,
      error: null,
    })),
    listFeatures: vi.fn(async () => ({ projects: [], unreadable: [] })),
    loadFeature: vi.fn(async () => createFeatureVideoSync(featureFile())),
    ...overrides,
  };
}

describe("Feature videos on the Post page", () => {
  it("lists feature videos on a dev server, and none without one", async () => {
    const summary = {
      slug: "promo",
      title: "Promo",
      revision: 3,
      savedAt: 5,
      sequenceId: "seq",
    };
    const state = createPostModuleState(
      devServices({
        listFeatures: vi.fn(async () => ({
          projects: [summary],
          unreadable: ["broken"],
        })),
      })
    );
    await state.refreshProjects();
    expect(state.features).toEqual([summary]);
    expect(state.unreadableFeatures).toEqual(["broken"]);
    expect(state.featureError).toBeNull();

    const failing = createPostModuleState(
      devServices({
        listFeatures: vi.fn(async () => {
          throw new Error("The dev server answered 500.");
        }),
      })
    );
    await failing.refreshProjects();
    expect(failing.features).toEqual([]);
    expect(failing.featureError).toBe("The dev server answered 500.");

    const production = createPostModuleState(
      devServices({ listFeatures: undefined, loadFeature: undefined })
    );
    await production.refreshProjects();
    expect(production.features).toEqual([]);
    expect(production.featureError).toBeNull();
    await production.openFeature("promo");
    expect(production.projectError).toBe(
      "Feature videos open only on a dev server."
    );
    expect(production.sequence).toBeNull();
  });

  it("opens a feature video without the ordinary post or the remembered post", async () => {
    localStorage.setItem("tka:post:selected:v1", "other");
    const sync = createFeatureVideoSync(featureFile());
    const services = devServices({ loadFeature: vi.fn(async () => sync) });
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    // The same object, not a deep proxy: the editor needs its getters live.
    expect(state.feature).toBe(sync);
    expect(state.sequence?.id).toBe("seq");
    expect(state.selectedId).toBe("feature:promo");
    expect(state.draft).toBeNull();
    expect(state.projectError).toBeNull();
    expect(services.loadFeature).toHaveBeenCalledWith("promo");
    expect(services.resolve).toHaveBeenCalledWith("seq");
    expect(services.loadDraft).not.toHaveBeenCalled();
    expect(localStorage.getItem("tka:post:selected:v1")).toBe("other");

    // The ordinary post for the same sequence opens apart from it.
    await state.open("seq");
    expect(state.feature).toBeNull();
    expect(state.draft?.sequenceId).toBe("seq");
    expect(localStorage.getItem("tka:post:selected:v1")).toBe("seq");
  });

  it("keeps an open feature video when returning to Projects, and drops it on an account switch", async () => {
    const services = devServices();
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    const before = state.feature;
    state.showProjects();
    expect(state.feature).toBe(before);
    await state.openFeature("promo");
    expect(state.feature).toBe(before);
    expect(state.showingProjects).toBe(false);
    expect(services.loadFeature).toHaveBeenCalledTimes(1);

    state.resetForAccount();
    expect(state.feature).toBeNull();
    expect(state.selectedId).toBeNull();
  });

  it("names a feature video's missing sequence, and Try again opens it", async () => {
    const services = devServices({
      resolve: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sequence("seq")),
    });
    const state = createPostModuleState(services);
    await state.openFeature("promo");
    expect(state.projectError).toBe(
      "The sequence for this feature video (seq) could not be found."
    );
    expect(state.feature).toBeNull();
    expect(state.sequence).toBeNull();
    await state.retry();
    expect(state.projectError).toBeNull();
    expect(state.feature?.slug).toBe("promo");
    expect(services.loadFeature).toHaveBeenCalledTimes(2);
  });

  it("ignores a feature video that finishes loading after another choice", async () => {
    const pending = deferred<FeatureVideoSync>();
    const services = devServices({
      loadFeature: vi.fn(() => pending.promise),
    });
    const state = createPostModuleState(services);
    const older = state.openFeature("promo");
    await state.open("second");
    pending.resolve(createFeatureVideoSync(featureFile()));
    await older;
    expect(state.feature).toBeNull();
    expect(state.selectedId).toBe("second");
    expect(state.sequence?.id).toBe("second");
    expect(services.resolve).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/post-module-state.test.ts`
Expected: FAIL. The three existing tests pass; the five new ones fail because `openFeature` is not a function and `features` is undefined.

- [ ] **Step 4: Give the page state feature videos**

Replace the whole of `src/lib/features/post/state/post-module-state.svelte.ts` with:

```ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { FeatureVideoSummary } from "$lib/shared/media-composition/domain/feature-video";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
import {
  loadSyncedPostDraft,
  listSyncedPostProjects,
  resolveSyncedPostSequence,
} from "../services/post-account-projects";
import {
  lastSelectedPostSequenceId,
  selectPostSequence,
  type PostProjectChoice,
} from "../services/post-workspace-projects";

export interface PostModuleServices {
  list: typeof listSyncedPostProjects;
  resolve: typeof resolveSyncedPostSequence;
  loadDraft: typeof loadSyncedPostDraft;
  /**
   * Feature videos are folders the dev server reads, so only a dev build
   * passes these two. Without them the page lists none and opens none.
   */
  listFeatures?: () => Promise<{
    projects: FeatureVideoSummary[];
    unreadable: string[];
  }>;
  /** Reads one feature video and binds it for the editor. */
  loadFeature?: (slug: string) => Promise<FeatureVideoSync>;
}

const FEATURE_SELECTION = "feature:";

/** A feature video's selection id, apart from every sequence id. */
export const featureSelectionId = (slug: string) =>
  `${FEATURE_SELECTION}${slug}`;

export function createPostModuleState(services: PostModuleServices) {
  let projects = $state<PostProjectChoice[]>([]);
  let catalogError = $state<string | null>(null);
  let loadingCatalog = $state(false);
  let loadingProject = $state(false);
  let selectedId = $state<string | null>(null);
  let sequence = $state<SequenceData | null>(null);
  let draft = $state<PostProject | null>(null);
  let diskAvailable = $state(false);
  let projectError = $state<string | null>(null);
  let showingProjects = $state(true);
  let features = $state<FeatureVideoSummary[]>([]);
  let unreadableFeatures = $state<string[]>([]);
  let featureError = $state<string | null>(null);
  // Raw: the editor needs the sync's getters and closures as they are, not
  // through a deep proxy.
  let feature = $state.raw<FeatureVideoSync | null>(null);
  let request = 0;
  let catalogRequest = 0;
  let featureRequest = 0;

  async function refreshPosts(): Promise<void> {
    const current = ++catalogRequest;
    loadingCatalog = true;
    try {
      const loaded = await services.list();
      if (current !== catalogRequest) return;
      projects = loaded.projects;
      catalogError = loaded.error;
    } catch {
      if (current !== catalogRequest) return;
      catalogError = "Projects could not be listed on this device.";
    } finally {
      if (current === catalogRequest) loadingCatalog = false;
    }
  }

  async function refreshFeatures(): Promise<void> {
    const listFeatures = services.listFeatures;
    if (!listFeatures) return;
    const current = ++featureRequest;
    try {
      const loaded = await listFeatures();
      if (current !== featureRequest) return;
      features = loaded.projects;
      unreadableFeatures = loaded.unreadable;
      featureError = null;
    } catch (cause) {
      if (current !== featureRequest) return;
      features = [];
      unreadableFeatures = [];
      featureError =
        cause instanceof Error
          ? cause.message
          : "Feature videos could not be listed.";
    }
  }

  async function refreshProjects(): Promise<void> {
    await Promise.all([refreshPosts(), refreshFeatures()]);
  }

  async function open(sequenceId: string): Promise<void> {
    if (sequenceId === selectedId && sequence) {
      showingProjects = false;
      selectPostSequence(sequenceId);
      return;
    }
    const current = ++request;
    selectedId = sequenceId;
    showingProjects = false;
    loadingProject = true;
    projectError = null;
    sequence = null;
    draft = null;
    feature = null;
    try {
      const resolved = await services.resolve(sequenceId);
      if (current !== request) return;
      if (!resolved) {
        projectError = `The sequence for this post (${sequenceId}) could not be found. The saved post is still here.`;
        return;
      }
      const loaded = await services.loadDraft(sequenceId);
      if (current !== request) return;
      sequence = resolved;
      draft = loaded.project;
      diskAvailable = loaded.diskAvailable;
      projectError = loaded.error;
      selectPostSequence(sequenceId);
    } catch (cause) {
      if (current === request)
        projectError =
          cause instanceof Error
            ? cause.message
            : "This post could not be opened.";
    } finally {
      if (current === request) loadingProject = false;
    }
  }

  /**
   * Opens a feature video: its own post on its sequence, read from its
   * folder. The sequence's ordinary post is never loaded, and the choice is
   * not remembered, so /post on its own still opens the last ordinary post.
   */
  async function openFeature(slug: string): Promise<void> {
    const id = featureSelectionId(slug);
    if (id === selectedId && sequence && feature) {
      showingProjects = false;
      return;
    }
    const current = ++request;
    selectedId = id;
    showingProjects = false;
    loadingProject = true;
    projectError = null;
    sequence = null;
    draft = null;
    feature = null;
    try {
      if (!services.loadFeature) {
        projectError = "Feature videos open only on a dev server.";
        return;
      }
      const loaded = await services.loadFeature(slug);
      if (current !== request) return;
      const sequenceId = loaded.initialProject.sequenceId;
      const resolved = await services.resolve(sequenceId);
      if (current !== request) return;
      if (!resolved) {
        projectError = `The sequence for this feature video (${sequenceId}) could not be found.`;
        return;
      }
      feature = loaded;
      sequence = resolved;
    } catch (cause) {
      if (current === request)
        projectError =
          cause instanceof Error
            ? cause.message
            : "This feature video could not be opened.";
    } finally {
      if (current === request) loadingProject = false;
    }
  }

  /** Tries the last failed open again, a post or a feature video. */
  function retry(): Promise<void> {
    if (!selectedId) return Promise.resolve();
    return selectedId.startsWith(FEATURE_SELECTION)
      ? openFeature(selectedId.slice(FEATURE_SELECTION.length))
      : open(selectedId);
  }

  function showProjects(): void {
    ++request;
    showingProjects = true;
    loadingProject = false;
    void refreshProjects();
  }

  function resetForAccount(): void {
    ++request;
    projects = [];
    catalogError = null;
    features = [];
    unreadableFeatures = [];
    featureError = null;
    selectedId = null;
    sequence = null;
    draft = null;
    feature = null;
    showingProjects = true;
    void refreshProjects();
  }

  return {
    get projects() {
      return projects;
    },
    get catalogError() {
      return catalogError;
    },
    get loadingCatalog() {
      return loadingCatalog;
    },
    get loadingProject() {
      return loadingProject;
    },
    get selectedId() {
      return selectedId;
    },
    get sequence() {
      return sequence;
    },
    get draft() {
      return draft;
    },
    get diskAvailable() {
      return diskAvailable;
    },
    get projectError() {
      return projectError;
    },
    get showingProjects() {
      return showingProjects;
    },
    get features() {
      return features;
    },
    get unreadableFeatures() {
      return unreadableFeatures;
    },
    get featureError() {
      return featureError;
    },
    /** The open feature video, or null for an ordinary post. */
    get feature() {
      return feature;
    },
    refreshProjects,
    open,
    openFeature,
    retry,
    showProjects,
    resetForAccount,
    lastSelectedId: lastSelectedPostSequenceId,
  };
}

export type PostModuleState = ReturnType<typeof createPostModuleState>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/post-module-state.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Wire the page, Post Studio and the editor**

**6a. `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`**

After the line `import { createPostTabSync } from "$lib/shared/media-composition/services/post-tab-sync";` add:

```ts
  import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
```

In `interface Props`, after `initialProject?: PostProject;` add:

```ts
    /**
     * A feature video. Its post saves to its folder on this computer, never
     * to this browser's Post Studio storage; see feature-video-client.ts.
     */
    feature?: FeatureVideoSync;
```

In the props destructuring, after `initialProject,` add `feature,`.

Replace:

```ts
  const editor = createPostEditorState({
    initialProject,
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlayPainter !== null,
  });
```

with:

```ts
  // Read once: the Post page opens a new workspace for another feature video.
  const featureVideo = feature;

  const editor = createPostEditorState({
    initialProject,
    getSequence: () => sequence,
    getCatalogVideo: (videoId) =>
      catalog.find((video) => video.videoId === videoId) ?? null,
    hasAnimationOverlay: () => overlayPainter !== null,
    // A feature video keeps its post, timings and undo history apart from
    // this browser's Post Studio storage.
    store: featureVideo?.store,
  });
```

Replace:

```ts
      .then(({ startPostProjectDevBridge }) => {
        if (!disposed) stop = startPostProjectDevBridge(editor);
      })
```

with:

```ts
      .then(({ startPostProjectDevBridge }) => {
        if (disposed) return;
        stop = startPostProjectDevBridge(
          editor,
          featureVideo
            ? {
                featureSlug: featureVideo.slug,
                // Another editor, the CLI or a hand edit saved a newer copy.
                onFeatureRevision: (revision) =>
                  void featureVideo.checkRevision(revision),
              }
            : {}
        );
      })
```

Replace:

```ts
  // Every open tab of this post stays on the newest saved copy.
  const tabSync = createPostTabSync(
    sequence.id,
    (project) => editor.adoptSaved(project),
    () => loadPostProject(sequence.id)
  );
```

with:

```ts
  // Every open tab of this post stays on the newest saved copy. For a
  // feature video, disk does that job, and no tab of the sequence's ordinary
  // post may reach it: the tab sync is keyed by sequence alone.
  const tabSync = featureVideo
    ? null
    : createPostTabSync(
        sequence.id,
        (project) => editor.adoptSaved(project),
        () => loadPostProject(sequence.id)
      );

  // Disk's newer copy replaced the post as one undo step.
  const disconnectFeature = featureVideo?.connect(editor, () => {
    draftError = null;
    const loaded = editor.project;
    showToast({
      message: "Loaded the newer copy from disk.",
      type: "info",
      duration: 8000,
      action: {
        label: t("post_editor_undo"),
        onClick: () => {
          if (editor.project === loaded) editor.undo();
        },
      },
    });
  });
```

In the `$effect` that follows, replace:

```ts
    if (revision > 0) untrack(() => tabSync.announce(editor.snapshot));
```

with:

```ts
    if (revision > 0) untrack(() => tabSync?.announce(editor.snapshot));
```

Replace:

```ts
  onDestroy(() => {
    tabSync.dispose();
    draftAutosave?.dispose();
    clearTimeout(saveFlashTimer);
  });
```

with:

```ts
  onDestroy(() => {
    tabSync?.dispose();
    disconnectFeature?.();
    draftAutosave?.dispose();
    clearTimeout(saveFlashTimer);
  });
```

**6b. `src/lib/shared/share/components/post-studio/PostStudio.svelte`**

After `import type { PostProject } from "$lib/shared/media-composition/domain/post-project";` add:

```ts
  import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
```

In `interface Props`, after `initialProject?: PostProject;` add:

```ts
    /** A feature video: its post saves to its folder through the dev server. */
    feature?: FeatureVideoSync;
```

In the props destructuring, after `initialProject,` add `feature,`. In the `<PostEditorWorkspace` call, after `{initialProject}` add `{feature}`.

**6c. `src/lib/features/post/PostModule.svelte`**

Replace:

```ts
  import { createPostModuleState } from "./state/post-module-state.svelte";
```

with:

```ts
  import {
    createPostModuleState,
    featureSelectionId,
  } from "./state/post-module-state.svelte";
```

Replace:

```ts
  const state = createPostModuleState({
    list: listSyncedPostProjects,
    resolve: resolveSyncedPostSequence,
    loadDraft: loadSyncedPostDraft,
  });
```

with:

```ts
  const state = createPostModuleState({
    list: listSyncedPostProjects,
    resolve: resolveSyncedPostSequence,
    loadDraft: loadSyncedPostDraft,
    // Feature videos are folders the dev server reads. A production build
    // drops this branch, and the client with it.
    ...(import.meta.env.DEV
      ? {
          listFeatures: async () =>
            (
              await import(
                "$lib/shared/media-composition/services/feature-video-client"
              )
            ).listFeatureVideos(),
          loadFeature: async (slug: string) => {
            const client = await import(
              "$lib/shared/media-composition/services/feature-video-client"
            );
            return client.createFeatureVideoSync(
              await client.loadFeatureVideo(slug)
            );
          },
        }
      : {}),
  });
```

Replace:

```ts
  let previousParam: string | null = null;
  let initialVisit = true;
```

with:

```ts
  let previousParam: string | null = null;
  let previousFeature: string | null = null;
  let initialVisit = true;
```

Replace:

```ts
  const currentTitle = $derived(
    simplifyRepeatedWord(
      state.sequence?.displayName ||
        state.sequence?.name ||
        currentWord ||
        state.selectedId ||
        ""
    )
  );
```

with:

```ts
  const currentTitle = $derived(
    state.feature?.title ??
      simplifyRepeatedWord(
        state.sequence?.displayName ||
          state.sequence?.name ||
          currentWord ||
          state.selectedId ||
          ""
      )
  );
  /**
   * A feature video opens on a dev server without Post's early access:
   * everything behind it exists only there, and the signed-out capture
   * browser must be able to open and render one.
   */
  const featureMode = $derived(
    import.meta.env.DEV &&
      (page.url.searchParams.has("feature") || state.feature !== null)
  );
```

In the account effect, replace:

```ts
    initialVisit = true;
    previousParam = null;
    state.resetForAccount();
```

with:

```ts
    initialVisit = true;
    previousParam = null;
    previousFeature = null;
    state.resetForAccount();
```

Replace the URL effect:

```ts
  $effect(() => {
    if (!authState.initialized) return;
    authState.user?.uid;
    const project = page.url.searchParams.get("project");
    if (initialVisit) {
      initialVisit = false;
      const target = project || state.lastSelectedId();
      if (target) void state.open(target);
      previousParam = project;
      return;
    }
    if (project && project !== previousParam) void state.open(project);
    previousParam = project;
  });
```

with:

```ts
  $effect(() => {
    if (!authState.initialized) return;
    authState.user?.uid;
    const project = page.url.searchParams.get("project");
    const feature = import.meta.env.DEV
      ? page.url.searchParams.get("feature")
      : null;
    if (initialVisit) {
      initialVisit = false;
      previousParam = project;
      previousFeature = feature;
      if (feature) void state.openFeature(feature);
      else {
        const target = project || state.lastSelectedId();
        if (target) void state.open(target);
      }
      return;
    }
    if (feature && feature !== previousFeature) void state.openFeature(feature);
    else if (project && project !== previousParam) void state.open(project);
    previousParam = project;
    previousFeature = feature;
  });
```

After the `openProject` function, add:

```ts
  function openFeature(slug: string): void {
    if (featureSelectionId(slug) === state.selectedId && !state.showingProjects)
      return;
    void goto(`/post?feature=${encodeURIComponent(slug)}`);
  }
```

In the markup, replace `{#if !canAccessPostStudio()}` with `{#if !canAccessPostStudio() && !featureMode}`.

Replace the end of the project list:

```svelte
          {/each}
        </ul>
      {/if}
    </div>
    <div class="editor-host" hidden={state.showingProjects}>
```

with:

```svelte
          {/each}
        </ul>
      {/if}
      {#if state.features.length || state.unreadableFeatures.length || state.featureError}
        <section class="feature-videos" aria-labelledby="feature-videos-title">
          <h2 id="feature-videos-title">Feature videos</h2>
          {#if state.featureError}<p class="notice" role="status">
              {state.featureError}
            </p>{/if}
          {#if state.unreadableFeatures.length}<p class="notice" role="status">
              Could not read the project.json in {state.unreadableFeatures.join(", ")}.
              Each folder's history keeps earlier copies.
            </p>{/if}
          {#if state.features.length}
            <ul>
              {#each state.features as video (video.slug)}
                <li>
                  <button
                    type="button"
                    aria-label={`Open ${video.title}`}
                    onclick={() => openFeature(video.slug)}
                  >
                    <span class="project-mark"
                      ><i class="fas fa-film" aria-hidden="true"></i></span
                    >
                    <div class="project-info">
                      <strong>{video.title}</strong>
                      <div class="project-details">
                        <span>{video.slug} · {video.sequenceId}</span>
                      </div>
                    </div>
                    <span class="project-date"
                      >{new Date(video.savedAt).toLocaleDateString()}</span
                    >
                    <i class="fas fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </div>
    <div class="editor-host" hidden={state.showingProjects}>
```

Replace the Try again button:

```svelte
          <button
            type="button"
            onclick={() =>
              state.selectedId && void state.open(state.selectedId)}
            >Try again</button
          >
```

with:

```svelte
          <button type="button" onclick={() => void state.retry()}
            >Try again</button
          >
```

Replace the opening of the editor block:

```svelte
        {#key `${authState.user && !authState.user.isAnonymous ? authState.user.uid : "guest"}:${state.sequence.id}`}
          <PostStudio
            active={visible && !state.showingProjects}
            sequence={state.sequence}
            initialProject={state.draft ?? undefined}
            onSaveDraft={authState.user && !authState.user.isAnonymous ? (project) => saveSyncedPostDraft(project, state.sequence!) : state.diskAvailable ? savePostDraft : undefined}
```

with:

```svelte
        {#key `${authState.user && !authState.user.isAnonymous ? authState.user.uid : "guest"}:${state.feature ? featureSelectionId(state.feature.slug) : state.sequence.id}`}
          <PostStudio
            active={visible && !state.showingProjects}
            sequence={state.sequence}
            feature={state.feature ?? undefined}
            initialProject={state.feature ? state.feature.initialProject : (state.draft ?? undefined)}
            onSaveDraft={state.feature ? state.feature.save : authState.user && !authState.user.isAnonymous ? (project) => saveSyncedPostDraft(project, state.sequence!) : state.diskAvailable ? savePostDraft : undefined}
```

In the `<style>` block, after the `.list-status` rule, add:

```css
  .feature-videos {
    margin-top: 36px;
  }
  .feature-videos h2 {
    margin: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    font-size: 18px;
  }
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/post-module-state.test.ts tests/unit/media-composition/feature-video-client.test.ts tests/unit/media-composition/post-editor-tabs.test.ts`
Expected: PASS.

Then, after the same resource gate as Step 1:

```bash
npm run check:fast -- --no-svelte-warnings 2>&1 | grep -E "post-module-state|PostModule\.svelte|PostStudio\.svelte|PostEditorWorkspace\.svelte" > "$TEMP/check-fast-13-after.txt"; diff "$TEMP/check-fast-13-before.txt" "$TEMP/check-fast-13-after.txt"
```

Expected: no difference. A new line names an error this task introduced; fix it before committing. Line numbers in old errors can shift; compare the messages.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write src/lib/features/post/state/post-module-state.svelte.ts src/lib/shared/share/components/post-studio/PostStudio.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte
git status --short
```

`PostModule.svelte` and the test file were not Prettier-clean before this task, so formatting them would rewrite lines this task never touched; leave them as written in this task. `git status --short` must list only this task's five files.

```bash
git add src/lib/features/post/state/post-module-state.svelte.ts src/lib/features/post/PostModule.svelte src/lib/shared/share/components/post-studio/PostStudio.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/post-module-state.test.ts
git commit -m "Open feature videos on the Post page, apart from the sequence's own post

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/post/state/post-module-state.svelte.ts src/lib/features/post/PostModule.svelte src/lib/shared/share/components/post-studio/PostStudio.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/post-module-state.test.ts
```

---

### Task 14: Agent commands for feature videos

The agent works on feature videos through `scripts/post-project.mjs`, the same tool it already uses for open posts. This task adds five commands (`features`, `create`, `add-take`, `remove-take`, `duplicate`) and a `--feature <slug>` flag that `show` and every edit understand:

- When one open editor holds the feature video, edits go through the bridge and land in that editor as undo steps, exactly like edits to an ordinary post.
- When no editor holds it, edits go to the ops route and are written to the file on disk.
- When two editors hold it, the command stops and says so, because edits would land in one while the other later saves over them.
- A command without `--feature` never reaches a feature video's editor. Before this task "the only open editor" could have been one.

`add-take` copies a clip into the project's `media/footage/` folder. A clip that is already 8-bit SDR H.264 in an MP4 is copied byte for byte. Anything else is converted to H.264 High in MP4 at CRF 16 with AAC 192 kbps and its frame rate kept: iPhone HEVC, any `.mov`, 10-bit footage, and HDR. HDR (HLG or PQ) is also tone-mapped to SDR BT.709, because an 8-bit copy that keeps the HDR picture plays washed out. Only the first sound track ffmpeg can read is kept, since iPhone spatial-audio files carry a second track ffmpeg cannot decode.

**Files:**
- Create: `scripts/feature-video/media-import.mjs`
- Modify: `scripts/post-project.mjs` (whole file shown)
- Test: `tests/unit/media-composition/feature-video-media-import.test.ts`
- Test: `tests/unit/media-composition/post-project-cli.test.ts`

- [ ] **Step 1: Write the failing media import test**

Create `tests/unit/media-composition/feature-video-media-import.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importTake,
  needsTranscode,
  probeMedia,
  readProbe,
  safeMediaName,
  toolPath,
  transcodeArgs,
  uniqueMediaPath,
} from "../../../scripts/feature-video/media-import.mjs";

/** Whether this computer's ffmpeg lists `name` (CI may have no ffmpeg). */
function ffmpegHas(list: "-encoders" | "-filters", name: string): boolean {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", list], {
      encoding: "utf8",
    }).includes(` ${name} `);
  } catch {
    return false;
  }
}
const canEncode =
  ffmpegHas("-encoders", "libx264") && ffmpegHas("-encoders", "libx265");
const canToneMap =
  canEncode &&
  ffmpegHas("-filters", "zscale") &&
  ffmpegHas("-filters", "tonemap");

const SDR = {
  durationSeconds: 1,
  videoCodec: "h264",
  pixelFormat: "yuv420p",
  transfer: "bt709",
  hdr: false,
  audioStream: 0,
};

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-media-"));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** A one-second test clip with a tone, encoded with `video`. */
function makeClip(name: string, video: string[]): string {
  const file = path.join(dir, name);
  execFileSync(toolPath("ffmpeg"), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440",
    "-t",
    "1",
    ...video,
    "-c:a",
    "aac",
    file,
  ]);
  return file;
}

describe("reading a clip", () => {
  it("keeps the first sound ffmpeg can read and spots HDR", () => {
    expect(
      readProbe(
        {
          format: { duration: "12.5" },
          streams: [
            {
              codec_type: "video",
              codec_name: "hevc",
              pix_fmt: "yuv420p10le",
              color_transfer: "arib-std-b67",
            },
            // Spatial audio: ffprobe cannot name its codec.
            { codec_type: "audio" },
            { codec_type: "audio", codec_name: "aac" },
          ],
        },
        "IMG_0412.MOV"
      )
    ).toEqual({
      durationSeconds: 12.5,
      videoCodec: "hevc",
      pixelFormat: "yuv420p10le",
      transfer: "arib-std-b67",
      hdr: true,
      audioStream: 1,
    });
    expect(() =>
      readProbe(
        {
          format: { duration: "3" },
          streams: [{ codec_type: "audio", codec_name: "aac" }],
        },
        "voice.mov"
      )
    ).toThrow("voice.mov has no video.");
    expect(() =>
      readProbe(
        { format: {}, streams: [{ codec_type: "video", codec_name: "h264" }] },
        "x.mp4"
      )
    ).toThrow("how long x.mp4 is");
  });

  it("converts everything but 8-bit SDR H.264 in an MP4", () => {
    expect(needsTranscode(SDR, "a.mp4")).toBe(false);
    expect(needsTranscode(SDR, "a.MOV")).toBe(true);
    expect(needsTranscode({ ...SDR, videoCodec: "hevc" }, "a.mp4")).toBe(true);
    expect(
      needsTranscode({ ...SDR, pixelFormat: "yuv420p10le" }, "a.mp4")
    ).toBe(true);
    expect(needsTranscode({ ...SDR, hdr: true }, "a.mp4")).toBe(true);
  });

  it("builds the H.264 copy's arguments and tone-maps HDR", () => {
    expect(
      transcodeArgs("in.mov", "out.mp4", { ...SDR, videoCodec: "hevc" })
    ).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-y",
      "-i",
      "in.mov",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
    const hdr = transcodeArgs("in.mov", "out.mp4", {
      ...SDR,
      videoCodec: "hevc",
      transfer: "arib-std-b67",
      hdr: true,
      audioStream: null,
    });
    const filter = hdr[hdr.indexOf("-vf") + 1];
    expect(filter).toMatch(
      /^setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc,zscale=t=linear/
    );
    expect(filter).toMatch(/zscale=t=bt709:m=bt709:r=tv,format=yuv420p$/);
    expect(hdr).toContain("-an");
    expect(hdr).not.toContain("-c:a");
  });
});

describe("naming a take's file", () => {
  it("makes a safe .mp4 name and never reuses one", async () => {
    expect(safeMediaName("IMG_0412.MOV")).toBe("img_0412.mp4");
    expect(safeMediaName("Café take 1.mov")).toBe("cafe-take-1.mp4");
    expect(safeMediaName("!!!.mp4")).toBe("take.mp4");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a.mp4"));
    await fs.writeFile(path.join(dir, "a.mp4"), "");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a-2.mp4"));
    await fs.writeFile(path.join(dir, "a-2.mp4"), "");
    expect(uniqueMediaPath(dir, "a.mp4")).toBe(path.join(dir, "a-3.mp4"));
  });
});

describe("importing a take", () => {
  it.skipIf(!canEncode)("copies an H.264 MP4 byte for byte", async () => {
    const source = makeClip("Opening.mp4", [
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ]);
    const footage = path.join(dir, "media", "footage");
    const take = await importTake(source, footage);
    expect(take).toMatchObject({
      relativePath: "footage/opening.mp4",
      transcoded: false,
    });
    expect(take.durationSeconds).toBeCloseTo(1, 1);
    expect(await fs.readFile(path.join(footage, "opening.mp4"))).toEqual(
      await fs.readFile(source)
    );
  });

  it.skipIf(!canEncode)(
    "converts an HEVC .mov to H.264 MP4 with its sound, under a free name",
    async () => {
      const source = makeClip("My Take 1.MOV", [
        "-c:v",
        "libx265",
        "-x265-params",
        "log-level=error",
        "-pix_fmt",
        "yuv420p",
        "-tag:v",
        "hvc1",
      ]);
      const footage = path.join(dir, "media", "footage");
      const first = await importTake(source, footage);
      const second = await importTake(source, footage);
      expect(first).toMatchObject({
        relativePath: "footage/my-take-1.mp4",
        transcoded: true,
      });
      expect(second.relativePath).toBe("footage/my-take-1-2.mp4");
      const copy = await probeMedia(path.join(footage, "my-take-1.mp4"));
      expect(copy).toMatchObject({
        videoCodec: "h264",
        pixelFormat: "yuv420p",
        audioStream: 0,
      });
      expect(copy.durationSeconds).toBeCloseTo(1, 1);
      // No half-written file is left behind.
      expect((await fs.readdir(footage)).sort()).toEqual([
        "my-take-1-2.mp4",
        "my-take-1.mp4",
      ]);
    }
  );

  it.skipIf(!canToneMap)("tone-maps HDR footage to SDR", async () => {
    // ffmpeg 8 tags a file from its frames, so setparams marks it as HLG.
    const source = makeClip("hlg.mov", [
      "-vf",
      "setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc",
      "-c:v",
      "libx265",
      "-x265-params",
      "log-level=error",
      "-pix_fmt",
      "yuv420p10le",
    ]);
    expect((await probeMedia(source)).hdr).toBe(true);
    const take = await importTake(source, path.join(dir, "media", "footage"));
    const copy = await probeMedia(path.join(dir, "media", take.relativePath));
    expect(copy).toMatchObject({
      videoCodec: "h264",
      pixelFormat: "yuv420p",
      transfer: "bt709",
      hdr: false,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-media-import.test.ts`
Expected: FAIL, with an error that `scripts/feature-video/media-import.mjs` cannot be resolved.

- [ ] **Step 3: Write the media import module**

Create `scripts/feature-video/media-import.mjs`:

```js
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Brings a phone or camera clip into a feature video's media/footage folder
 * in a form every browser plays and seeks: H.264 High in MP4 with AAC sound.
 * An 8-bit SDR H.264 MP4 is copied as it is. Anything else (iPhone HEVC, a
 * .mov, 10-bit or HDR footage) is converted at CRF 16 with its frame rate
 * kept, and HDR is tone-mapped to SDR BT.709 so it does not play washed out.
 */

const execFileAsync = promisify(execFile);
const DEFAULT_FFMPEG_DIR = "C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin";
const HDR_TRANSFERS = ["arib-std-b67", "smpte2084"];
/** Sound ffmpeg can read. iPhone spatial audio is a second track it cannot. */
const READABLE_AUDIO = /^(aac|mp3|opus|flac|alac|vorbis|ac3|eac3|pcm_\w+)$/;

/** ffmpeg or ffprobe: in FFMPEG_DIR, else this computer's usual folder, else on PATH. */
export function toolPath(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const inFolder = path.join(
    process.env.FFMPEG_DIR ?? DEFAULT_FFMPEG_DIR,
    executable
  );
  return existsSync(inFolder) ? inFolder : executable;
}

/** What ffprobe's JSON says about a clip, or why it cannot be a take. */
export function readProbe(data, name) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error(`${name} has no video.`);
  const durationSeconds = Number(data?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(`ffprobe could not tell how long ${name} is.`);
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const readable = audio.findIndex((stream) =>
    READABLE_AUDIO.test(stream.codec_name ?? "")
  );
  const transfer = video.color_transfer ?? "unknown";
  return {
    durationSeconds,
    videoCodec: video.codec_name ?? "unknown",
    pixelFormat: video.pix_fmt ?? "unknown",
    transfer,
    hdr: HDR_TRANSFERS.includes(transfer),
    /** The sound to keep, counted among the audio streams, or null. */
    audioStream: readable < 0 ? null : readable,
  };
}

export async function probeMedia(file) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,pix_fmt,color_transfer",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true }
    ));
  } catch (cause) {
    throw new Error(
      `ffprobe could not read ${path.basename(file)}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
  return readProbe(JSON.parse(stdout), path.basename(file));
}

/** True unless the clip is already 8-bit SDR H.264 in an MP4. */
export function needsTranscode(probe, file) {
  return (
    path.extname(file).toLowerCase() !== ".mp4" ||
    probe.videoCodec !== "h264" ||
    probe.hdr ||
    !["yuv420p", "yuvj420p"].includes(probe.pixelFormat)
  );
}

/**
 * HLG or PQ to SDR BT.709: the usual zscale and Hable recipe. setparams
 * comes first because zscale finds no conversion for frames that lack
 * color tags, and zscale's own tags mark the copy as BT.709 (ffmpeg 8
 * takes a file's color tags from its frames, not from -color_trc).
 */
export function toneMapFilter(transfer) {
  return [
    `setparams=color_primaries=bt2020:color_trc=${transfer}:colorspace=bt2020nc`,
    "zscale=t=linear:npl=100",
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    "format=yuv420p",
  ].join(",");
}

/** ffmpeg arguments for a clip's H.264 High MP4 copy. */
export function transcodeArgs(input, output, probe) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-stats",
    // The output is this import's own temporary file.
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    ...(probe.audioStream === null ? [] : ["-map", `0:a:${probe.audioStream}`]),
    ...(probe.hdr ? ["-vf", toneMapFilter(probe.transfer)] : []),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-crf",
    "16",
    "-pix_fmt",
    "yuv420p",
    ...(probe.audioStream === null ? ["-an"] : ["-c:a", "aac", "-b:a", "192k"]),
    "-movflags",
    "+faststart",
    output,
  ];
}

/** A name the media route serves as it is: a-z, 0-9, dash and underscore, then .mp4. */
export function safeMediaName(original) {
  const stem = path
    .basename(original, path.extname(original))
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `${stem || "take"}.mp4`;
}

/** `name` in `folder`, or name-2, name-3 and on when it is taken. */
export function uniqueMediaPath(folder, name) {
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let copy = 1; ; copy += 1) {
    const candidate = path.join(
      folder,
      copy === 1 ? name : `${stem}-${copy}${extension}`
    );
    if (!existsSync(candidate)) return candidate;
  }
}

function runFfmpeg(args, name) {
  return new Promise((resolve, reject) => {
    const child = spawn(toolPath("ffmpeg"), args, {
      // Progress and errors show as they happen.
      stdio: ["ignore", "ignore", "inherit"],
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`ffmpeg could not convert ${name} (exit code ${code}).`)
          )
    );
  });
}

/**
 * Copies or converts `file` into `footageFolder` under a free, safe name.
 * Returns its path inside media/, its length, and whether it was converted.
 */
export async function importTake(file, footageFolder) {
  const name = path.basename(file);
  const probe = await probeMedia(file);
  const convert = needsTranscode(probe, file);
  await fs.mkdir(footageFolder, { recursive: true });
  const target = uniqueMediaPath(footageFolder, safeMediaName(name));
  if (convert) {
    const partial = `${target}.partial.mp4`;
    try {
      await runFfmpeg(transcodeArgs(file, partial, probe), name);
      await fs.rename(partial, target);
    } catch (cause) {
      await fs.rm(partial, { force: true });
      throw cause;
    }
  } else await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  const result = convert ? await probeMedia(target) : probe;
  return {
    relativePath: `footage/${path.basename(target)}`,
    durationSeconds: result.durationSeconds,
    transcoded: convert,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-media-import.test.ts`
Expected: PASS, 7 tests. On this computer none are skipped; if the three import tests report as skipped, `toolPath("ffmpeg")` did not find ffmpeg, so check `FFMPEG_DIR` before going on.

- [ ] **Step 5: Write the failing CLI test**

Create `tests/unit/media-composition/post-project-cli.test.ts`:

```ts
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

interface Session {
  id: string;
  sequenceId: string;
  featureSlug: string | null;
}
const ORDINARY: Session = {
  id: "ordinary",
  sequenceId: "seq",
  featureSlug: null,
};
const PROMO: Session = {
  id: "promo-editor",
  sequenceId: "seq",
  featureSlug: "promo",
};

let server: http.Server;
let url: string;
let folder: string;
let sessions: Session[];
let calls: { method: string; path: string; body: unknown }[];

/** A dev server stand-in for the bridge and the feature video routes. */
beforeEach(async () => {
  calls = [];
  sessions = [];
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "feature-cli-"));
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      calls.push({
        method: request.method ?? "GET",
        path: target.pathname,
        body: text ? JSON.parse(text) : undefined,
      });
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          return send(
            200,
            target.searchParams.has("commandId")
              ? { status: "completed" }
              : target.searchParams.has("sessionId")
                ? { snapshot: { tracks: [] } }
                : { sessions }
          );
        case "POST /api/dev/post-project":
          return send(200, { status: "pending", commandId: "c1" });
        case "GET /api/dev/feature-videos":
          return send(200, { projects: [], unreadable: [] });
        case "POST /api/dev/feature-videos":
          return send(201, { file: { slug: "promo" }, folder });
        case "GET /api/dev/feature-videos/promo":
          return send(200, {
            file: { project: { tracks: [] } },
            fingerprint: "f",
            folder,
          });
        case "POST /api/dev/feature-videos/promo/ops":
          return send(200, { status: "applied", revision: 2 });
        case "POST /api/dev/feature-videos/promo/duplicate":
          return send(201, { file: { slug: "promo-30s" }, folder });
        default:
          return send(404, { message: "No such route." });
      }
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(folder, { recursive: true, force: true });
});

/** Runs the CLI against the stand-in; reports failures instead of throwing. */
async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(process.execPath, [
      CLI,
      ...args,
      "--url",
      url,
    ]);
    return { code: 0, stdout, stderr };
  } catch (cause) {
    const failed = cause as { code?: number; stdout?: string; stderr?: string };
    return {
      code: failed.code ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

const posts = () =>
  calls
    .filter((call) => call.method === "POST")
    .map((call) => [call.path, call.body]);

describe("post-project.mjs with feature videos", () => {
  it("sends a feature video's edit to the editor that has it open", async () => {
    sessions = [ORDINARY, PROMO];
    expect((await cli("background", "blur", "--feature", "promo")).code).toBe(
      0
    );
    expect(posts()).toEqual([
      [
        "/api/dev/post-project",
        {
          kind: "ops",
          sessionId: "promo-editor",
          ops: [{ op: "background", background: "blur" }],
        },
      ],
    ]);
  });

  it("writes the edit to the file when no editor has it open", async () => {
    sessions = [ORDINARY];
    const result = await cli(
      "remove-take",
      "--take",
      "take-2",
      "--feature",
      "promo"
    );
    expect(result.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos/promo/ops",
        { ops: [{ op: "remove-take", take: "take-2" }] },
      ],
    ]);
  });

  it("stops while two editors have it open", async () => {
    sessions = [PROMO, { ...PROMO, id: "second" }];
    const result = await cli("background", "blur", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "2 editors have promo open. Close all but one, then try again."
    );
    expect(posts()).toEqual([]);
  });

  it("never sends an edit without --feature to a feature video's editor", async () => {
    sessions = [PROMO];
    const alone = await cli("background", "blur");
    expect(alone.code).toBe(1);
    expect(alone.stderr).toContain("No open Post Studio editor matches");
    sessions = [ORDINARY, PROMO];
    expect((await cli("background", "blur")).code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/post-project",
        {
          kind: "ops",
          sessionId: "ordinary",
          ops: [{ op: "background", background: "blur" }],
        },
      ],
    ]);
  });

  it("creates, copies, lists and shows feature videos through their routes", async () => {
    const created = await cli(
      "create",
      "promo",
      "--sequence",
      "DCKΨ-",
      "--title",
      "Promo 1.0",
      "--canvas",
      "9:16"
    );
    expect(created.code).toBe(0);
    const copied = await cli(
      "duplicate",
      "promo",
      "promo-30s",
      "--share-media",
      "--title",
      "Promo 30"
    );
    expect(copied.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos",
        {
          slug: "promo",
          title: "Promo 1.0",
          sequenceId: "DCKΨ-",
          canvas: "9:16",
        },
      ],
      [
        "/api/dev/feature-videos/promo/duplicate",
        { slug: "promo-30s", title: "Promo 30", shareMedia: true },
      ],
    ]);
    expect(JSON.parse((await cli("features")).stdout)).toEqual({
      projects: [],
      unreadable: [],
    });
    const shown = await cli("show", "--feature", "promo", "--json");
    expect(JSON.parse(shown.stdout)).toEqual({ tracks: [] });
    expect(calls.at(-1)?.path).toBe("/api/dev/feature-videos/promo");
  });

  it.skipIf(!canEncode)(
    "copies footage into the project and adds it as a take",
    async () => {
      const source = path.join(folder, "Opening Shot.mp4");
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x240:rate=30",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        source,
      ]);
      const result = await cli(
        "add-take",
        source,
        "--feature",
        "promo",
        "--label",
        "Opening",
        "--append"
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        media: "footage/opening-shot.mp4",
        converted: false,
      });
      const [sent] = posts() as [
        string,
        { ops: { op: string; durationSeconds: number }[] },
      ][];
      expect(sent?.[0]).toBe("/api/dev/feature-videos/promo/ops");
      expect(sent?.[1].ops[0]).toMatchObject({
        op: "add-take",
        url: "/api/dev/feature-videos/promo/media/footage/opening-shot.mp4",
        label: "Opening",
        append: true,
      });
      expect(sent?.[1].ops[0]?.durationSeconds).toBeCloseTo(1, 1);
      await fs.access(
        path.join(folder, "media", "footage", "opening-shot.mp4")
      );
    }
  );
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli.test.ts`
Expected: FAIL, all 6. The old CLI ignores `--feature`, so it finds two editors open in the first test and sends to the only editor in the fourth; `remove-take`, `create` and `add-take` are unknown commands and exit with code 1. (Checked against the current CLI while writing this plan.)

- [ ] **Step 7: Rewrite the CLI**

Replace the whole of `scripts/post-project.mjs` with:

```js
#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { importTake } from "./feature-video/media-import.mjs";

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const base = new URL(option("url") ?? "https://[::1]:5173");
if (
  !["http:", "https:"].includes(base.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
) {
  throw new Error("--url must be a loopback HTTP(S) address.");
}

const BRIDGE = "/api/dev/post-project";
const FEATURE_API = "/api/dev/feature-videos";
/** A feature video's route: its file, or its `ops`, `duplicate` or `media`. */
const featureRoute = (slug, ...rest) =>
  [FEATURE_API, encodeURIComponent(slug), ...rest].join("/");
/** Where the media route serves a project file; matches featureVideoMediaUrl. */
const featureMediaUrl = (slug, relativePath) =>
  `${featureRoute(slug, "media")}/${relativePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;

async function request(method, query = {}, body, route = BRIDGE) {
  const url = new URL(route, base);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, value);
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const transport = url.protocol === "https:" ? https : http;
  const response = await new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: {
          Accept: "application/json",
          Origin: base.origin,
          ...(encoded
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(encoded),
              }
            : {}),
        },
        // The dev server uses a local self-signed certificate. This exception is scoped to this request.
        ...(url.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          const status = res.statusCode ?? 500;
          let value;
          try {
            value = JSON.parse(text);
          } catch {
            reject(
              Object.assign(
                new Error(
                  `${url.pathname} answered ${status} without JSON. Is this the dev server, and does it have this route?`
                ),
                { status }
              )
            );
            return;
          }
          if (status >= 400)
            reject(
              Object.assign(
                new Error(value.message ?? value.error ?? `HTTP ${status}`),
                { status }
              )
            );
          else resolve(value);
        });
      }
    );
    req.on("error", reject);
    req.end(encoded);
  });
  return response;
}

const EDIT_COMMANDS = {
  "add-hook": () => ({
    op: "add-hook",
    ...number("seconds"),
    ...number("fold"),
    ...(flag("mirror") ? { mirror: option("mirror") !== "false" } : {}),
    ...(option("speed") ? { speed: option("speed") } : {}),
  }),
  "remove-hook": () => ({ op: "remove-hook" }),
  "line-up-hook": () => ({ op: "line-up-hook" }),
  "add-titles": () => ({
    op: "add-titles",
    ...(option("spoken") !== undefined ? { spoken: option("spoken") } : {}),
    ...number("at"),
  }),
  "hook-speed": () => ({ op: "hook-speed", speed: positional(0, "a curve") }),
  "hook-frame": () => ({
    op: "hook-frame",
    ...number("zoom"),
    ...number("x"),
    ...number("y"),
    ...(flag("whole") ? { whole: true } : {}),
  }),
  appearance: () => ({
    op: "appearance",
    ...(option("item") ? { item: option("item") } : {}),
    set: Object.fromEntries(
      repeated("set").map((pair) => {
        const at = pair.indexOf("=");
        if (at < 1) throw new Error(`--set needs key=value, got "${pair}".`);
        return [pair.slice(0, at), literal(pair.slice(at + 1))];
      })
    ),
  }),
  item: () => ({
    op: "item",
    item: required("item"),
    patch: JSON.parse(required("patch")),
  }),
  trim: () => ({
    op: "trim",
    item: required("item"),
    edge: required("edge"),
    seconds: Number(required("seconds")),
  }),
  delete: () => ({ op: "delete", item: required("item") }),
  canvas: () => ({ op: "canvas", canvas: positional(0, "a ratio") }),
  background: () => ({
    op: "background",
    background: positional(0, "dark or blur"),
  }),
  "remove-take": () => ({ op: "remove-take", take: required("take") }),
};

const BOOLEAN_FLAGS = [
  "--mirror",
  "--no-wait",
  "--json",
  "--append",
  "--share-media",
];
function flag(name) {
  return args.includes(`--${name}`);
}
function required(name) {
  const value = option(name);
  if (value === undefined) throw new Error(`--${name} is required.`);
  return value;
}
function number(name) {
  return option(name) === undefined ? {} : { [name]: Number(option(name)) };
}
function repeated(name) {
  return args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
}
function literal(text) {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
}
/** Bare words after the command, skipping every `--flag value` pair. */
function positional(index, what) {
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      if (!BOOLEAN_FLAGS.includes(args[i])) i += 1;
    } else words.push(args[i]);
  }
  if (words[index] === undefined) throw new Error(`${command} needs ${what}.`);
  return words[index];
}

/** An ordinary post's editor: --session, else --sequence, else the only one open. */
async function resolveSession() {
  if (option("session")) return option("session");
  const { sessions } = await request("GET");
  const wanted = option("sequence");
  // A feature video's editor takes edits only through --feature.
  const matches = sessions.filter(
    (session) =>
      !session.featureSlug && (!wanted || session.sequenceId === wanted)
  );
  if (matches.length === 1) return matches[0].id;
  throw new Error(
    matches.length === 0
      ? "No open Post Studio editor matches. Open the post in the browser first."
      : `${matches.length} editors are open; pass --session ID or --sequence ID (see the list command).`
  );
}

/** The one open editor holding this feature video, or null when none does. */
async function featureSession(slug) {
  const { sessions } = await request("GET");
  const holding = sessions.filter((session) => session.featureSlug === slug);
  if (holding.length > 1)
    throw new Error(
      `${holding.length} editors have ${slug} open. Close all but one, then try again.`
    );
  return holding[0]?.id ?? null;
}

function summarize(snapshot) {
  const rows = [];
  snapshot.tracks.forEach((track, trackIndex) => {
    for (const item of track.items)
      rows.push(
        `track ${trackIndex}  ${item.id}  ${item.kind}${item.tunnelHook ? " (opening tunnel)" : ""}  ${item.start.toFixed(2)}s +${item.duration.toFixed(2)}s${item.label ? `  "${item.label}"` : ""}`
      );
  });
  return rows.join("\n");
}

async function sendToEditor(sessionId, ops) {
  const queued = await request("POST", {}, { kind: "ops", sessionId, ops });
  if (queued.status === "unchanged") return { status: "unchanged" };
  if (flag("no-wait")) return queued;
  for (let waited = 0; waited < 15000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const status = await request("GET", {
      sessionId,
      commandId: queued.commandId,
    });
    if (status.status !== "pending") return status;
  }
  return { ...queued, note: "The editor has not applied it yet." };
}

/**
 * Sends edits. With --feature they go to the editor that has the feature
 * video open, as undo steps there, or to the file on disk when none does.
 */
async function sendOps(ops) {
  const feature = option("feature");
  if (!feature || option("session"))
    return sendToEditor(await resolveSession(), ops);
  const held = await featureSession(feature);
  if (held) return sendToEditor(held, ops);
  try {
    return await request("POST", {}, { ops }, featureRoute(feature, "ops"));
  } catch (cause) {
    // An editor opened it a moment ago: the edit goes there instead.
    if (cause?.status !== 409) throw cause;
    const opened = await featureSession(feature);
    if (!opened) throw cause;
    return sendToEditor(opened, ops);
  }
}

/** The post as it is now: in its editor, else, for a feature video, on disk. */
async function currentSnapshot() {
  const feature = option("feature");
  if (!feature || option("session"))
    return (await request("GET", { sessionId: await resolveSession() }))
      .snapshot;
  const held = await featureSession(feature);
  if (held) return (await request("GET", { sessionId: held })).snapshot;
  return (await request("GET", {}, undefined, featureRoute(feature))).file
    .project;
}

try {
  let result;
  if (command === "list") result = await request("GET");
  else if (command === "show") {
    const snapshot = await currentSnapshot();
    if (flag("json")) result = snapshot;
    else {
      process.stdout.write(summarize(snapshot) + "\n");
      result = undefined;
    }
  } else if (command === "ops") {
    const file = required("file");
    result = await sendOps(JSON.parse(await fs.readFile(file, "utf8")));
  } else if (command in EDIT_COMMANDS) {
    result = await sendOps([EDIT_COMMANDS[command]()]);
  } else if (command === "features") {
    result = await request("GET", {}, undefined, FEATURE_API);
  } else if (command === "create") {
    result = await request(
      "POST",
      {},
      {
        slug: positional(0, "a name, such as promo-1-0"),
        title: required("title"),
        sequenceId: required("sequence"),
        ...(option("canvas") ? { canvas: option("canvas") } : {}),
      },
      FEATURE_API
    );
  } else if (command === "add-take") {
    const feature = required("feature");
    const file = path.resolve(positional(0, "a video file"));
    if (!/\.(mp4|mov)$/i.test(file))
      throw new Error("add-take takes an .mp4 or .mov file.");
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const take = await importTake(file, path.join(folder, "media", "footage"));
    result = {
      media: take.relativePath,
      converted: take.transcoded,
      edit: await sendOps([
        {
          op: "add-take",
          url: featureMediaUrl(feature, take.relativePath),
          durationSeconds: take.durationSeconds,
          ...(option("label") ? { label: option("label") } : {}),
          ...(flag("append") ? { append: true } : {}),
        },
      ]),
    };
  } else if (command === "duplicate") {
    result = await request(
      "POST",
      {},
      {
        slug: positional(1, "a name for the copy"),
        ...(option("title") ? { title: option("title") } : {}),
        ...(flag("share-media") ? { shareMedia: true } : {}),
      },
      featureRoute(positional(0, "the feature video to copy"), "duplicate")
    );
  } else if (command === "read") {
    if (!option("session")) throw new Error("read requires --session.");
    result = await request("GET", { sessionId: option("session") });
  } else if (command === "apply") {
    const sessionId = option("session");
    const baseRevision = Number(option("base-revision"));
    const baseFingerprint = option("base-fingerprint");
    const file = option("file");
    if (
      !sessionId ||
      !Number.isSafeInteger(baseRevision) ||
      !baseFingerprint ||
      !file
    )
      throw new Error(
        "apply requires --session, --base-revision, --base-fingerprint and --file."
      );
    result = await request(
      "POST",
      {},
      {
        kind: "apply",
        sessionId,
        baseRevision,
        baseFingerprint,
        project: JSON.parse(await fs.readFile(file, "utf8")),
      }
    );
  } else if (command === "status") {
    if (!option("session") || !option("command"))
      throw new Error("status requires --session and --command.");
    result = await request("GET", {
      sessionId: option("session"),
      commandId: option("command"),
    });
  } else
    throw new Error(
      `Usage: post-project.mjs <command> [--url loopback-url] [--session ID | --sequence ID | --feature SLUG]
  list                         open editors
  show [--json]                items of the open post
  add-hook [--seconds 5] [--fold 8] [--mirror] [--speed ease-out]
  remove-hook
  line-up-hook                 end the tunnel on the footage's opening pose, footage behind it
  add-titles [--spoken "how to say it"] [--at N]   name titles clip, over the opening tunnel when there is one
  hook-speed <ease-out|ease-in|ease-in-out|linear|smooth|overshoot|default|x1,y1,x2,y2>
  hook-frame [--zoom 1.4] [--x 0.5] [--y 0.55] [--whole]   frame the footage behind the opening tunnel
  appearance [--item hook|animations|all|ID] --set glyph=false ...  (keys: tkaGlyph stepNumbers gridMode progressBar ...; null clears)
  item --item ID --patch '{"opacity":0.5}'
  trim --item ID --edge start|end --seconds N
  delete --item ID
  canvas <ratio>   background <dark|blur>
  ops --file ops.json          a batch applied in one step
  read|apply|status            whole-manifest bridge (--session, --base-revision, --base-fingerprint, --file, --command)
Feature videos, folders on the dev server's computer:
  features                     list them
  create <slug> --sequence ID --title "Title" [--canvas 9:16]
  add-take <clip.mp4|clip.mov> --feature SLUG [--label "Name"] [--append]   copies it into media/footage; HEVC, HDR and .mov become H.264 MP4
  remove-take --take ID
  duplicate <slug> <new-slug> [--title "Title"] [--share-media]
  With --feature, show and every edit use the editor that has it open, else the file on disk.
  Add --no-wait to return before the editor confirms; --out file to write output.`
    );
  if (result !== undefined) {
    const output = JSON.stringify(result, null, 2) + "\n";
    if (option("out")) await fs.writeFile(option("out"), output);
    else process.stdout.write(output);
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli.test.ts tests/unit/media-composition/feature-video-media-import.test.ts`
Expected: PASS, 13 tests (6 and 7), none skipped on this computer.

- [ ] **Step 9: Format and commit**

The code above is already formatted, so Prettier should change nothing; `scripts/post-project.mjs` is replaced whole, so formatting it is safe either way.

```bash
npx prettier --write scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-media-import.test.ts tests/unit/media-composition/post-project-cli.test.ts
git status --short
git add scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-media-import.test.ts tests/unit/media-composition/post-project-cli.test.ts
git commit -m "Agent commands for feature videos: create, add footage, copy, and edit on disk or in the open editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-media-import.test.ts tests/unit/media-composition/post-project-cli.test.ts
```

`git status --short` before the commit must list only these four paths.

---

### Task 15: Document feature videos

**Files:**
- Modify: `docs/development/post-studio-manifest-bridge.md` (append after line 50, the "Ownership:" paragraph)
- Modify: `docs/architecture/canonical-capabilities.md` (insert after line 332)

- [ ] **Step 1: Append the feature video section to the bridge doc**

Add one blank line after the last line of `docs/development/post-studio-manifest-bridge.md` (the paragraph starting "Ownership: `post-editor-state.svelte.ts` validates"), then this section exactly:

````markdown
## Feature videos

A feature video, such as the 1.0 promo, is a Post Studio project kept in a folder on this computer. It is built from one sequence but is not that sequence's post: it reads and writes no `tka:post-studio:` key and no account draft. Feature videos exist only on a dev server. `/post?feature=<slug>` opens one, and `/post?feature=` shows the Post list with its "Feature videos" group; neither needs Post's early access.

The folders live in `E:/tka-platform-media/feature-videos`; set `TKA_FEATURE_VIDEO_ROOT` to use another folder, as task previews do. A slug is 1 to 63 lowercase letters, digits and dashes, and starts with a letter or digit.

```text
<slug>/
  project.json    the title, the revision and the project
  history/        the 200 newest earlier saves, named by revision (r000001.json and on)
  media/
    footage/      takes added with add-take
    captures/     app recordings
    music/        the licensed track
    images/       stills used as items
  captures/       capture scripts and raw frames
  exports/        renders
```

```powershell
node scripts/post-project.mjs features                   # every feature video, newest first
node scripts/post-project.mjs create promo-1-0 --sequence "DCKΨ-" --title "1.0 promo" --canvas 9:16
node scripts/post-project.mjs add-take D:\shoot\IMG_0412.MOV --feature promo-1-0 --label "Opening" --append
node scripts/post-project.mjs show --feature promo-1-0   # add --json to see the takes and their ids
node scripts/post-project.mjs background blur --feature promo-1-0
node scripts/post-project.mjs remove-take --take take-2 --feature promo-1-0
node scripts/post-project.mjs duplicate promo-1-0 promo-1-0-30s --title "1.0 promo, 30 s" --share-media
```

`add-take` copies the clip into `media/footage/` under a safe name no other file there uses, and adds it as a take; `--append` also puts the whole take at the end of the main track. Adding the same clip twice makes a second file and a second take; remove the extra take with `remove-take`. An SDR H.264 `.mp4` is copied as it is. Anything else, such as iPhone HEVC, a `.mov` or 10-bit video, becomes an H.264 High MP4 (CRF 16, AAC 192 kbps, frame rate kept). HDR footage is tone-mapped to SDR on the way in, which shifts its colors a little, so film in SDR when color matters (on an iPhone, turn off HDR Video under Settings > Camera > Record Video). One sound track is kept: the first in a format ffmpeg reads, so an iPhone's spatial audio track gives way to its stereo track. ffmpeg and ffprobe come from `FFMPEG_DIR` when set, then `C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin`, then the PATH. `remove-take` removes the take and its clips from the project and leaves its file in `media/footage/`.

With `--feature`, `show` and every edit go to the editor that has the feature video open, where each command lands as one undo step. With no editor open they go to `project.json`, one revision per command. An editor counts as open until about 10 seconds after its tab closes, so wait that long before editing on disk. Two editors open on the same feature video stop the command until one closes. A command without `--feature` never reaches a feature video's editor.

`duplicate` copies a feature video into a new folder, such as a 30 s cut from the 60 s one. The copy starts at revision 1 with an empty history. By default it copies the media too, so each project owns its files. `--share-media` copies none and plays the original's files, so don't rename or delete a file in the original while a copy uses it.

### When disk and the editor disagree

Disk wins. Each save from the editor names the revision it started from, and the server refuses one made from an older revision. The editor also checks the file's revision with its heartbeat, about once a second. Either way, when the file on disk is newer, the editor loads it as one undo step and says "Loaded the newer copy from disk." The editor's own version stays one Undo away, and undoing saves it as a new revision, so nothing is lost.

- To edit `project.json` by hand while an editor has it open, raise `revision` by one in the same save. Otherwise the editor's next save overwrites the hand edit.
- To restore an earlier save, copy it from `history/` over `project.json` and set its `revision` to one more than the revision of the file it replaces. History files are never overwritten, so a restored file that keeps its old, lower revision leaves the saves made after it out of the history.
- When `project.json` can't be read, the Post list names the folder and every write to it is refused. Restore it the same way.

The server routes are under `/api/dev/feature-videos`: `GET` lists and `POST {slug, title, sequenceId, canvas?}` creates; `GET /<slug>` reads and `PUT /<slug> {baseRevision, project}` saves; `POST /<slug>/ops {ops}` applies named edits to the file and answers 409 while an editor has it open; `POST /<slug>/duplicate {slug, title?, shareMedia?}` copies; `GET /<slug>/media/<path>` serves a media file with byte ranges. Like the bridge, they answer only on a dev server, only to this computer, and only to the page's own origin.

Ownership: `feature-video.ts` owns slugs, the file format and media URLs; `feature-video-store.ts` owns folders, revisions, history and copies; `feature-video-media.ts` serves media; `dev-loopback.ts` guards every dev route; `feature-video-client.ts` keeps an open feature video in step with its folder through the editor's storage port (`post-editor-store.ts`); `post-module-state.svelte.ts` opens feature videos on the Post page; `scripts/feature-video/media-import.mjs` probes and converts takes.
````

- [ ] **Step 2: Add the capability paragraph**

In `docs/architecture/canonical-capabilities.md`, the paragraph starting "Local development manifest edits use" ends at line 332 with "`docs/development/post-studio-manifest-bridge.md` for the command contract." Insert this paragraph after it, with one blank line on each side, so it sits before the paragraph starting "Post Studio keyframes live on the item":

```markdown
Feature videos, such as the 1.0 promo, are Post Studio projects kept as
folders on this computer, apart from any sequence's own post.
`domain/feature-video.ts` owns slugs, the file format and media URLs.
`server/feature-video-store.ts` owns the folders, revisions, history and
copies; `server/feature-video-media.ts` serves media with byte ranges; the
routes live under `src/routes/api/dev/feature-videos/`, guarded like every dev
route by `server/dev-loopback.ts`. In the browser,
`services/feature-video-client.ts` keeps an open feature video in step with
its folder through the editor's storage port, `services/post-editor-store.ts`,
and `features/post/state/post-module-state.svelte.ts` opens one with
`openFeature`. The CLI reaches them with `--feature`, and
`scripts/feature-video/media-import.mjs` probes and converts takes. When disk
and the editor disagree, disk wins and Undo brings back the editor's version.
Searches: feature video, promo video, project folder, media route, byte range,
revision, disk wins.
```

- [ ] **Step 3: Check the format, the references and the wording**

```bash
npx prettier --check docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
for p in src/lib/shared/media-composition/domain/feature-video.ts src/lib/server/feature-video-store.ts src/lib/server/feature-video-media.ts src/lib/server/dev-loopback.ts "src/routes/api/dev/feature-videos/+server.ts" src/lib/shared/media-composition/services/feature-video-client.ts src/lib/shared/media-composition/services/post-editor-store.ts src/lib/features/post/state/post-module-state.svelte.ts scripts/feature-video/media-import.mjs; do [ -e "$p" ] || echo "missing: $p"; done
grep -c "openFeature" src/lib/features/post/state/post-module-state.svelte.ts
grep -c "export interface PostEditorStore" src/lib/shared/media-composition/services/post-editor-store.ts
grep -c "TKA_FEATURE_VIDEO_ROOT" src/lib/server/feature-video-store.ts
grep -c "FFMPEG_DIR" scripts/feature-video/media-import.mjs
git diff -U0 -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md | grep '^+' | grep -n $'\xe2\x80\x94'
git diff -U0 -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md | grep '^+' | grep -niwE "robust|comprehensive|crucial|seamless|leverage|navigate|landscape|delve|utilize"
```

Expected: Prettier reports that both files use its style; no `missing:` line; each `grep -c` prints 1 or more; the last two commands print nothing. If Prettier flags a file, run `npx prettier --write` on that file and confirm with `git diff` that only the added lines changed.

- [ ] **Step 4: Commit**

```bash
git status --short
git add docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
git commit -m "Document feature videos: folders, agent commands and the disk-wins rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
```

`git status --short` before the commit must list only these two paths.

---

### Task 16: Coordinator checks, review and integration

This task is run by the coordinator in its own session, not by an implementer subagent. It checks the whole branch on a real server and in a real browser, has it reviewed, merges it into local `main`, and creates the promo's own feature video on the primary dev server.

**Files:** none planned. A review fix names its own files and commits them with a pathspec.

Throughout, in PowerShell:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$wt = 'E:\worktrees\tka-platform\feature-video-projects'
$cli = "$wt\scripts\post-project.mjs"
$url = 'http://localhost:5191'
```

Each PowerShell call starts a fresh shell, so repeat these lines at the top of every call that uses them.

- [ ] **Step 1: Bring the branch up to date with main**

```powershell
git -C E:/worktrees/tka-platform/feature-video-projects merge --no-edit main
git -C E:/worktrees/tka-platform/feature-video-projects status --short
```

Expected: "Already up to date." or a merge commit, then no status output. On a conflict, resolve each conflicted file in the worktree keeping both sides' intent, `git add` exactly those files, run their tests, and finish with `git commit --no-edit`: a merge commit cannot take a pathspec, and this worktree's index holds only the merge.

- [ ] **Step 2: Run the tests**

From the worktree root in Git Bash:

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition tests/unit/post-module-state.test.ts tests/unit/prop-color-picker-contract.test.ts src/routes/api/dev src/lib/shared/share/components/post-studio src/lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice.test.ts src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte.test.ts
```

Expected: no failures, and nothing skipped in `feature-video-media-import.test.ts` or `post-project-cli.test.ts` (a skip there means ffmpeg was not found). When a file this plan never touched fails, run that one file from `E:/tka-platform` to see whether `main` fails the same way; if it does, note it for the final report and go on.

- [ ] **Step 3: Compare type errors with the baseline**

Pass the resource gate (Task 6, Step 1), then from the worktree root:

```bash
npm run check:fast -- --no-svelte-warnings 2>&1 | grep -E "feature-video|dev-loopback|post-editor-store|post-editor-history-store|post-editor-state|post-project-ops|post-project-bridge-guard|post-project-dev-bridge|post-project-dev-client|post-module-state|PostModule\.svelte|PostStudio\.svelte|PostEditorWorkspace\.svelte|api.dev.post-project" > "/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad/check-fast-plan1-after.txt"
diff "/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad/check-fast-plan1-before.txt" "/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad/check-fast-plan1-after.txt"
```

Expected: no new message. Old messages can move to other line numbers; compare the messages. A new one goes to a Sonnet implementer with the file, the message and a pathspec commit, and this step runs again.

- [ ] **Step 4: Start the preview**

Pass the resource gate (Task 6, Step 1), then:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$env:TKA_FEATURE_VIDEO_ROOT = "$scratch\feature-videos"
$p = Start-Process -FilePath node -ArgumentList 'node_modules/vite/bin/vite.js','--port','5191','--strictPort','--host','localhost' -WorkingDirectory 'E:\worktrees\tka-platform\feature-video-projects' -RedirectStandardOutput "$scratch\preview-5191.log" -RedirectStandardError "$scratch\preview-5191.err.log" -PassThru -WindowStyle Hidden
$p.Id
```

Record the process id, port 5191, the worktree and both log paths in the task notes. Wait, with a Monitor until-loop rather than sleeps, until `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5191/api/dev/feature-videos` prints `200`. The scratch root still holds Task 6's `range-check`.

- [ ] **Step 5: Run the agent commands against the preview**

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$cli = 'E:\worktrees\tka-platform\feature-video-projects\scripts\post-project.mjs'
$url = 'http://localhost:5191'
node $cli create promo-check --sequence "DCKΨ-" --title "Promo check" --canvas 9:16 --url $url
& 'C:\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe' -hide_banner -loglevel error -f lavfi -i testsrc2=size=1080x1920:rate=30 -f lavfi -i sine=frequency=440 -t 8 -vf setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc -c:v libx265 -x265-params log-level=error -pix_fmt yuv420p10le -tag:v hvc1 -c:a aac "$scratch\IMG_0001.MOV"
node $cli add-take "$scratch\IMG_0001.MOV" --feature promo-check --label "Phone take" --append --url $url
node $cli add-take "$scratch\feature-videos\range-check\media\footage\4k60.mp4" --feature promo-check --label "4K check" --append --url $url
node $cli show --feature promo-check --url $url
node $cli duplicate promo-check promo-check-30s --title "Promo check, 30 s" --share-media --url $url
node $cli show --json --feature promo-check-30s --url $url
```

Expected:
- `create` prints the new file at revision 1 and its folder.
- ffmpeg prints nothing (the HLG HEVC `.MOV` stands in for an iPhone take).
- The first `add-take` prints `"media": "footage/img_0001.mp4"`, `"converted": true` and an edit with `"status": "applied"` and `"revision": 2`.
- The second prints `"media": "footage/4k60.mp4"`, `"converted": false` and revision 3.
- `show` prints two items on track 0, near `0.00s +8.00s` and `8.00s +20.00s`.
- `duplicate` prints the copy at revision 1, and the copy's takes have `ref.url` values starting with `/api/dev/feature-videos/promo-check/media/footage/`.

Then make one unreadable folder, so the list's notice shows in the next step:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
New-Item -ItemType Directory "$scratch\feature-videos\broken-check" | Out-Null
Set-Content -LiteralPath "$scratch\feature-videos\broken-check\project.json" -Value '{'
```

- [ ] **Step 6: Check the list at seven sizes**

Start the agent browser with `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank` from `E:/tka-platform` (it reuses a running agent Chrome), open one task tab with Chrome DevTools MCP, and load [http://localhost:5191/post?feature=](http://localhost:5191/post?feature=). The list group reuses the Post list's rows and is dev-only, so it is not a new surface for `ui-bust`; the full seven-size pass still applies because the group is a new element.

For each size (375×667 as a phone with touch, then 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440 and 3840×2160), emulate it on the task page, reload, wait for the "Feature videos" heading, and run:

```js
({
  overflow: document.documentElement.scrollWidth - innerWidth,
  rows: document.querySelectorAll(".feature-videos li").length,
  notice: document.querySelector(".feature-videos .notice")?.textContent.trim(),
});
```

Expected at every size: `overflow` 0 or less, `rows` 3 (promo-check, promo-check-30s, range-check), and a notice naming `broken-check`. Save a WebP screenshot at quality 70 as `$scratch\shots\feature-list-<width>.webp` and look at each one: titles and dates readable, nothing clipped, the group lined up with the list above it. Fix any defect through a Sonnet implementer with a pathspec commit, then repeat this step.

- [ ] **Step 7: Check the editor at 1440×900**

Emulate 1440×900 on the task page. Before opening the editor, record the storage keys:

```js
[...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) => key.startsWith("tka:post-studio:"));
```

Then check each of these in order; each one names its evidence. Two reads recur. The file on disk: `(Invoke-RestMethod "$url/api/dev/feature-videos/promo-check").file` in PowerShell (`show` would read the open editor instead). The background a tab shows, with its Canvas tool open:

```js
[...document.querySelectorAll('[aria-label="Background"] [aria-checked="true"], [aria-label="Background"] [aria-pressed="true"], [aria-label="Background"] [aria-selected="true"]')].map((option) => option.getAttribute("aria-label"));
```

which answers `["Dark background"]` or `["Blurred background"]`.

1. Click "Open Promo check". The URL becomes `/post?feature=promo-check`, the title reads "Promo check", and the timeline shows two clips. Play from the start for two seconds, then seek to about 15 s: the preview shows the phone take's test pattern, then the 4K pattern, and the network list shows 206 answers for `img_0001.mp4` and `4k60.mp4`.
2. Note the file's `revision`. Open the Canvas tool and pick "Blurred background". Within about two seconds the file's revision is one higher, its `project.background` is `blur`, and `history\` gains the file named for the previous revision.
3. Press Ctrl+Z. The preview goes back to the dark background, and within about two seconds the revision is one higher again, with `project.background` back to `dark` or absent.
4. Reload. The editor comes back on promo-check unchanged, and `sessionStorage` holds `tka:feature-video:v1:promo-check:project`.
5. Run `node $cli background blur --feature promo-check --url $url`. It prints `"status": "completed"`, the preview turns blurred, and Ctrl+Z in the editor undoes it.
6. Make a hand edit with a revision bump:

   ```powershell
   $scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
   node -e "const fs=require('fs');const f=process.argv[1];const d=JSON.parse(fs.readFileSync(f,'utf8'));d.revision+=1;d.project.background=d.project.background==='blur'?'dark':'blur';fs.writeFileSync(f,JSON.stringify(d,null,2))" "$scratch\feature-videos\promo-check\project.json"
   ```

   Within about two seconds the editor switches background and shows "Loaded the newer copy from disk." with an Undo button. Save a WebP screenshot with the notice up as `$scratch\shots\feature-disk-wins-1440.webp`. Click Undo: the editor's version comes back and saves as the next revision. Repeat the hand edit once at 375×667 for `$scratch\shots\feature-disk-wins-375.webp`, then return to 1440×900.
7. Open a second tab on [http://localhost:5191/post?feature=promo-check](http://localhost:5191/post?feature=promo-check) and open its Canvas tool. `node $cli show --feature promo-check --url $url` exits with code 1 and prints "2 editors have promo-check open. Close all but one, then try again." In the second tab pick the other background; within about two seconds the first tab's background read shows it too.
8. Note the second tab's background read. In the first tab, post a changed copy on the sequence's ordinary tab-sync channel:

   ```js
   const { file } = await (await fetch("/api/dev/feature-videos/promo-check")).json();
   const changed = { ...file.project, background: file.project.background === "blur" ? "dark" : "blur" };
   const channel = new BroadcastChannel("tka:post-studio:tabs:DCK\u03a8-");
   channel.postMessage({ tabId: "probe", project: JSON.stringify(changed) });
   channel.close();
   ```

   After two seconds the second tab's background read is unchanged: feature editors do not listen there.
9. Close the second tab and load [http://localhost:5191/post?feature=](http://localhost:5191/post?feature=) in the first. Wait, with a Monitor until-loop, until `node $cli list --url $url` shows no session for promo-check (about 10 seconds). `node $cli background dark --feature promo-check --url $url` then prints `"status": "applied"` and a new revision; opening the row again shows the dark background.
10. Run the key query from the start of this step again. Expected: the same `tka:post-studio:` keys as before the editor opened, none added, while `sessionStorage` holds the `tka:feature-video:v1:promo-check:` keys.

Any failure goes to a Sonnet implementer with the evidence, the owned files and a test that reproduces it; it commits with a pathspec, and the failed check runs again.

- [ ] **Step 8: Opus review**

Dispatch `superpowers:code-reviewer` with `model: opus`, read-only: review `git diff main...codex/feature-video-projects` in `E:/worktrees/tka-platform/feature-video-projects` against piece 1 of `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md` and this plan, and report findings ranked by severity, each with a concrete failure scenario. Check each finding against the code before acting on it. For each confirmed finding, dispatch one Sonnet implementer with the finding, the owned files and the test to add, committing with a pathspec. Then run Step 2 again, and the browser check from Step 7 that covers each changed path. Send Austen a two or three sentence milestone note: what the review found, what was fixed, what comes next.

- [ ] **Step 9: Merge into local main**

```powershell
git -C E:/worktrees/tka-platform/feature-video-projects status --short
git -C E:/worktrees/tka-platform/feature-video-projects merge --no-edit main
```

Expected: no status output, then "Already up to date." or a merge commit. Close the task tabs on port 5191, then stop only the recorded preview (`Stop-Process -Id <recorded id>`) and confirm port 5191 is free, because a running server holds files the worktree removal must delete. Pass the resource gate (Task 6, Step 1), then:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/feature-video-projects --route /post
```

Run it from PowerShell, never Git Bash, which rewrites `--route /post` into a Windows path. It runs `npm run check` in the worktree, compiles the changed components, merges into local `main`, removes the worktree and deletes the branch. It refuses while any link other than the root `node_modules` junction exists in the worktree; remove a named link with `cmd /c rmdir <path>` and run it again. When it reports that `main` moved or that `.git/automerge.lock` is held, never delete the lock: wait, merge `main` into the branch again (Step 1), and run it again.

- [ ] **Step 10: Confirm the routes on the primary dev server**

```powershell
curl.exe -k -g -s -o NUL -w "%{http_code}" "https://[::1]:5173/api/dev/feature-videos"
```

Expected: `200`. A `404` means the running server has not picked up the new routes: ask Austen to restart it from Agent Hub, and never start, stop or restart port 5173 yourself.

- [ ] **Step 11: Create the promo's feature video**

From `E:\tka-platform`:

```powershell
node scripts/post-project.mjs create promo-1-0 --sequence "DCKΨ-" --title "1.0 promo" --canvas 9:16
```

Expected: the new file at revision 1, in `E:\tka-platform-media\feature-videos\promo-1-0`. In the task browser, load [https://localhost:5173/post?feature=](https://localhost:5173/post?feature=), record the `tka:post-studio:` keys as in Step 7, open "1.0 promo", and confirm the editor opens on DCKΨ- with an empty 9:16 timeline. Run the key query again: no key added. Then load [https://localhost:5173/post?feature=](https://localhost:5173/post?feature=) again and leave that tab open as the delivered view, so no idle editor holds promo-1-0 and later agent edits go to disk.

- [ ] **Step 12: Report**

Close every temporary tab. Send Austen the 375 and 1440 list pictures and the 1440 disk-wins picture (his phone can't open links), with a plain two or three sentence note: feature videos now live in folders, the promo's folder exists, and nothing went live. Update the memory note `project_promo_video_1_0.md`: piece 1 on local main, not pushed; the promo's slug is `promo-1-0`; ffmpeg 8 tags frames, not files, so `setparams` comes first for HDR input.
