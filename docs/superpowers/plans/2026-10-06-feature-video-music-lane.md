# Feature Video Music Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A feature video gets one music file under the whole post, with a beat grid, its own timeline lane and panel, a preview that keeps the picture on the beat, an export that mixes it in, and agent commands to add it, set it, line takes up with it and measure the render's loudness.

**Architecture:** An optional `music` field on `PostProject` holds the file's URL, its place and trims, level, fades, credit and beat grid, so every saved project still parses. Pure modules do the arithmetic and the edits: `music-grid.ts` turns bars and beats into post seconds and back, `post-music-edits.ts` changes the music, and `post-audio-plan.ts` plans its one sound segment for the export mix and the preview's level alike. The editor gains a lane under the tracks (wavesurfer.js draws the waveform), a Music panel, bar numbers on the ruler, and a hidden `<audio>` player that joins the existing preview clock. The CLI copies the music into the project as WAV and edits it through named ops, which reach the open editor or the file on disk as plan 1 set up; `align-take` and `loudness` run ffmpeg.

**Tech Stack:** SvelteKit 2.61, Svelte 5 runes, Zod 4.3, wavesurfer.js 7 (already a dependency), Web Audio `OfflineAudioContext`, ffmpeg/ffprobe 8.0.1, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md`, piece 2.

**Depends on:** plan 1, `docs/superpowers/plans/2026-10-06-feature-video-projects.md`, merged into local `main`. This plan's Find blocks were written against `main` at `bbfde94003`, with plan 1's files as plan 1's plan writes them. The coordinator checks that they still fit before Task 1.

**Where this plan departs from the spec:**

- `music` takes `--from` and `--to` for the part of the file that plays, not `--in` and `--out`: the CLI already uses `--out` for the file it writes its output to.
- `align-take` takes `--take ID` to measure only, or `--place ITEM` to measure and put that clip in time. A new `sync-to-music --item ID --offset S` puts a clip in time at an offset you pick, for when the match is doubtful.
- Slugs and media URLs move from `feature-video.ts` into a new `feature-video-url.ts`. The music schema checks its URL with `isFeatureVideoMediaUrl`, and `feature-video.ts` imports `post-project.ts`, which now imports the music schema; the move avoids that import loop. `feature-video.ts` exports the same names as before.
- The preview's music does not copy the video controller's read, align and hold code. It joins the existing preview clock as one more source (`music-preview-sync.ts`): while the music sounds it drives the clock the way audible footage does, and its element seeks only on a jump or when it strays more than 0.25 s.
- `add-music` turns anything but a 16 or 24-bit PCM WAV at 44.1 or 48 kHz into a 48 kHz WAV. A compressed file can decode a few milliseconds apart in the browser and in ffmpeg, which would move every beat.
- The export decodes each file at the mix's own rate instead of a fixed 44.1 kHz, so a full-speed source is copied sample for sample, and a music file that cannot be read fails the render instead of going out without it.
- The preview's fades use the export's own gain curve, `segmentGainAt`, so the editor and the render fade alike.

---

## Ground rules for every task

- Work only in `E:/worktrees/tka-platform/feature-video-music-lane` on branch `codex/feature-video-music-lane`. Never edit, stage or commit anything in `E:/tka-platform`.
- Never run `pnpm install` or `npm install`. Never delete, move or recreate `node_modules`: it is a junction into the primary checkout, and removing it empties the primary's packages.
- Never start a dev server and never touch port 5173. Task 17 belongs to the coordinator; an implementer skips it.
- Run tests from the worktree root with `npx vitest run --config tests/config/vitest.config.ts <files>`. The config runs jsdom; do not add `@vitest-environment` comments. The ffmpeg tests in Tasks 13 to 15 find ffmpeg through `FFMPEG_DIR`, then `C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin`, then `PATH`, and skip without it. A skipped test there is a result to report, not a pass.
- Each edit to an existing file is a **Find** block and its replacement. The Find text must occur exactly once in the file, whitespace included. When it occurs zero times or more than once, stop and report it; never guess where an edit goes. Apply a task's edits in the order given.
- Commit only the paths the task names: `git add <paths>`, then `git commit -m "<message>" -- <paths>`. End every commit message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use `git add -A`, `git add .`, `git add -u`, `git stash`, `git reset --hard`, `git checkout --`, `git clean`, or any force flag.
- Format each touched file with `npx prettier --write <files>` before committing, except these four, which `main` keeps in a layout prettier would change throughout: `src/lib/features/compose/timeline/components/SnapGuides.svelte`, `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte`, `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts` and `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte`. For those, `git diff <file>` must show only the task's edits.
- Comments, messages and interface text use plain words: no em dashes, and none of robust, comprehensive, crucial, seamless, leverage, navigate, landscape, delve, utilize. The music's interface strings are plain English in the components, like the other Post editor panels; they are not translation keys.
- When a command's output differs from the step's expected output for a reason the step does not explain, stop and report the output instead of improvising.

## Coordinator steps outside the tasks

The coordinator (the session running this plan) does these; implementers skip them. In Git Bash, set `SCRATCH=/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad` at the top of each call that uses it.

1. Confirm that plan 1 is on local `main`, then make the worktree and its `node_modules` junction, in PowerShell:

   ```powershell
   git -C E:/tka-platform cat-file -e main:src/lib/server/feature-video-store.ts
   git -C E:/tka-platform worktree add E:/worktrees/tka-platform/feature-video-music-lane -b codex/feature-video-music-lane main
   New-Item -ItemType Junction -Path E:\worktrees\tka-platform\feature-video-music-lane\node_modules -Target E:\tka-platform\node_modules
   git -C E:/worktrees/tka-platform/feature-video-music-lane status --short
   ```

   Expected: the first command prints nothing (plan 1's store exists on `main`), and the status prints nothing. Never make the junction with `mklink` from Git Bash, which reads `/J` as a path.

2. Check that the Find blocks fit the real `main`. The plan was built from tested prototypes by `scratchpad/plan2/build-plan.mjs`, whose `--real` mode applies every edit, as written, to the worktree's HEAD and builds each task's red and green file sets from the result. In Git Bash:

   ```bash
   SCRATCH=/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad
   WT=/e/worktrees/tka-platform/feature-video-music-lane
   cp -r "$SCRATCH/plan2/proto-backup" "$WT/tests/unit/plan2-proto"
   PLAN2_WT=E:/worktrees/tka-platform/feature-video-music-lane node "$SCRATCH/plan2/build-plan.mjs" --real --red > "$SCRATCH/plan2/build-real.log" 2>&1; tail -5 "$SCRATCH/plan2/build-real.log"
   PLAN2_WT=E:/worktrees/tka-platform/feature-video-music-lane node "$SCRATCH/plan2/red-run.mjs"
   ```

   Expected: the build ends with `OK`. Each `Tn-red` set exits 1 and each `Tn-green` set exits 0; `$SCRATCH/plan2/red-real/summary.txt` shows the failures each task's Step 2 expects, and the green counts its later step expects. `PROBLEM` lines name every file plan 1 or a later `main` left unlike the plan's base, and every edit that no longer fits. Correct each named group in `$SCRATCH/plan2/edits/` against the file on HEAD; for a group built by `AUTODIFF`, first carry the file's new lines into its prototype, or the rebuilt edit would undo them. Then run the build with `--rebase --red` in place of `--real --red`, which writes the plan into this worktree with HEAD as every file's base, run `red-run.mjs` again as above until both pass, and commit `docs/superpowers/plans/2026-10-06-feature-video-music-lane.md` on this branch before Task 1. Last, remove the prototypes, which must never be committed: `rm -r "$WT/tests/unit/plan2-proto"`, after which `git status --short` prints nothing.

3. Pass the resource gate in `.claude/rules/resource-budget.md` (at least 4096 MB free, no other `svelte-check` running), then record the type errors that already exist in the files this plan touches. From the worktree root in Git Bash:

   ```bash
   SCRATCH=/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad
   npm run check:fast -- --no-svelte-warnings > "$SCRATCH/check-fast-plan2-before.log" 2>&1
   sed 's/\x1b\[[0-9;]*m//g; s/\r$//' "$SCRATCH/check-fast-plan2-before.log" \
     | awk '/^[^ ].*\.(ts|svelte|mjs|js):[0-9]+:[0-9]+$/ { file = $0; next } file != "" && /^Error/ { sub(/:[0-9]+:[0-9]+$/, "", file); print file " " $0 } { file = "" }' \
     | grep -E "feature-video|post-music|music-grid|music-preview|PostMusic|post-project\.ts|post-project-ops|bpm-analyzer|SnapGuides|TimelineAudioTrack|snap-service|post-audio-plan|post-audio-track|PostExportPanel|PostEditorWorkspace|PostEditorCanvas|TimeRuler|time-ruler|post-editor-tools|post-editor-labels|post-timeline-geometry|PostTimeline|music-lane|music-tool" \
     | sort > "$SCRATCH/check-fast-plan2-before.txt"
   wc -l "$SCRATCH/check-fast-plan2-before.txt"
   ```

   `check:fast` prints each error as a `path:line:column` line followed by an `Error: ...` line; the `awk` program joins the two and drops the line numbers, so the comparison in Task 17 sees each message, not where it moved. An empty file is a fine baseline.

4. Task 17 (final checks, review and integration) runs in the coordinator session.

## File map

New:

| File | Responsibility |
| --- | --- |
| `src/lib/shared/media-composition/domain/feature-video-url.ts` | Feature video slugs and media URLs, moved out of `feature-video.ts` |
| `src/lib/shared/media-composition/domain/post-music.ts` | The music's schema and limits |
| `src/lib/shared/media-composition/domain/music-grid.ts` | Bars, beats and post seconds; grid lines, snap targets and bar marks; times that name a bar; tempo from taps |
| `src/lib/shared/media-composition/domain/post-music-edits.ts` | Set, change, trim and remove the music; where a clip must start to play in time with it |
| `src/lib/shared/media-composition/services/music-preview-sync.ts` | Where the preview's player should be, and the music as a source for the preview clock |
| `src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte` | The preview's hidden music player |
| `src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte` | The Music panel: level, fades, beat grid, Tap the beat, Suggest BPM, credit |
| `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte` | The music's lane: waveform, grid lines, move, trims and the bar-1 handle |
| `scripts/feature-video/time-args.mjs` | Times on the command line: seconds, clocks and bars |
| `scripts/feature-video/music-import.mjs` | Probe a music file, then copy it or convert it into the project |
| `scripts/feature-video/align-take.mjs` | Find where a take sits in the music from the take's own sound |
| `scripts/feature-video/loudness.mjs` | Measure a render's loudness and suggest the music's level |

Moved:

| From | To |
| --- | --- |
| `src/lib/features/compose/compose/phases/audio/bpm-analyzer.ts` | `src/lib/shared/audio/bpm-analyzer.ts`, since the Music panel is its second user |

Modified:

| File | Change |
| --- | --- |
| `src/lib/shared/media-composition/domain/feature-video.ts` | Imports and exports the URL module's names; moves the music's URL to a copied project |
| `src/lib/shared/media-composition/domain/post-project.ts` | The optional `music` field |
| `src/lib/shared/media-composition/domain/post-project-ops.ts` | `add-music`, `music`, `remove-music` and `sync-to-music`; `add-titles` and `trim` times may name a bar |
| `src/lib/features/compose/timeline/components/SnapGuides.svelte`, `TimelineAudioTrack.svelte`, `src/lib/features/compose/timeline/services/snap-service.ts` | Import the tempo finder from its new place |
| `src/lib/shared/media-composition/domain/post-audio-plan.ts` | The music's segment, the shared gain curve, sample-for-sample reads |
| `src/lib/shared/media-composition/services/post-audio-track.ts` | Decodes at the mix's rate; a required source that cannot be read fails the render |
| `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte` | Says that Silent leaves the music playing |
| `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte` | Mounts the music's player; the music joins the preview clock; the preview fades like the export |
| `src/lib/shared/timeline/TimeRuler.svelte` | Optional labelled marks, for bar numbers |
| `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`, `post-editor-labels.ts` | The Music tool, and the music as a selection |
| `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` | The music in the export, its panel, selection and Delete, and the lane's drags |
| `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts` | `placeDraggedMusic` |
| `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte` | Hide and lock become optional |
| `src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte` | The music's header and lane, bar numbers, snapping to bars and beats |
| `scripts/post-project.mjs` | `add-music`, `music`, `remove-music`, `sync-to-music`, `align-take`, `loudness`, and times as bars |
| `scripts/feature-video/media-import.mjs` | `safeMediaName` takes an extension and a fallback name; `runFfmpeg` is exported |
| `docs/development/post-studio-manifest-bridge.md`, `docs/architecture/canonical-capabilities.md` | How to use the music, and where it lives |

Tests, all new in `tests/unit/media-composition/` unless noted: `feature-video-url.test.ts`, `post-music.test.ts`, `music-grid.test.ts`, `post-music-edits.test.ts`, `post-project-ops-music.test.ts`, `tests/unit/shared/audio/bpm-analyzer.test.ts`, `post-audio-plan-music.test.ts`, `music-preview-sync.test.ts`, `post-music-preview.test.ts` with `music-preview-harness.svelte.ts`, `time-ruler-marks.test.ts`, `post-music-tool.test.ts` with `music-tool-harness.svelte.ts`, `post-timeline-geometry-music.test.ts`, `post-timeline-music-lane.test.ts` with `music-lane-harness.svelte.ts`, `feature-video-music-import.test.ts`, `post-project-cli-music.test.ts`, `feature-video-audio-fixtures.ts`, `feature-video-align-take.test.ts` and `feature-video-loudness.test.ts`; and additions to `feature-video-domain.test.ts`, `post-audio-track.test.ts` and `post-editor-tools.test.ts`.

---

### Task 1: Feature video URLs in a module of their own

The music schema (Task 2) checks that a music URL is a feature video media URL. Those helpers live in `feature-video.ts`, which imports `post-project.ts`; once `post-project.ts` imports the music schema, the two would import each other. This task moves the slug and URL helpers into `feature-video-url.ts`, which imports nothing, and `feature-video.ts` exports them again, so none of its callers change.

**Files:**
- Create: `src/lib/shared/media-composition/domain/feature-video-url.ts`
- Modify: `src/lib/shared/media-composition/domain/feature-video.ts` (its constants, its three URL functions and its imports)
- Test: `tests/unit/media-composition/feature-video-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as featureVideo from "$lib/shared/media-composition/domain/feature-video";
import * as featureVideoUrl from "$lib/shared/media-composition/domain/feature-video-url";

/** What feature-video.ts keeps exporting, now from the URL module. */
const NAMES = [
  "FEATURE_VIDEO_API",
  "FEATURE_VIDEO_SLUG_PATTERN",
  "featureVideoMediaUrl",
  "isFeatureVideoMediaUrl",
  "isFeatureVideoSlug",
] as const;

describe("feature video media URLs", () => {
  it.each(NAMES)("%s is the same from both modules", (name) => {
    expect(featureVideo[name]).toBe(featureVideoUrl[name]);
  });

  it("makes and knows a music file's URL", () => {
    const url = featureVideoUrl.featureVideoMediaUrl(
      "promo-1-0",
      "music/Derail Theme.wav"
    );
    expect(url).toBe(
      "/api/dev/feature-videos/promo-1-0/media/music/Derail%20Theme.wav"
    );
    expect(featureVideoUrl.isFeatureVideoMediaUrl(url)).toBe(true);
    expect(
      featureVideoUrl.isFeatureVideoMediaUrl("https://example.test/a.wav")
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-url.test.ts`

Expected: FAIL, with `Failed to resolve import "$lib/shared/media-composition/domain/feature-video-url"`.

- [ ] **Step 3: Create the URL module**

Create `src/lib/shared/media-composition/domain/feature-video-url.ts`:

```ts
/**
 * Feature video names and the URLs their media plays from. This file imports
 * nothing, so the post schema can check a music URL without importing
 * `feature-video.ts`, which imports the post schema.
 */

/** Lowercase letters, digits and dashes; it names the folder and the URL. */
export const FEATURE_VIDEO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const FEATURE_VIDEO_API = "/api/dev/feature-videos";

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
```

- [ ] **Step 4: Take the names out of `feature-video.ts`**

In `src/lib/shared/media-composition/domain/feature-video.ts`:

**Edit 1.** Drop the slug pattern and the API path; they move to the URL module. Find:

```ts
/** Lowercase letters, digits and dashes; it names the folder and the URL. */
export const FEATURE_VIDEO_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const FEATURE_VIDEO_API = "/api/dev/feature-videos";
export const FEATURE_VIDEO_FILE_FORMAT = "feature-video-v1";
```

Replace it with:

```ts
export const FEATURE_VIDEO_FILE_FORMAT = "feature-video-v1";
```

**Edit 2.** Drop the three URL functions; they move too. Find:

```ts
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
```

Replace it with:

```ts
/**
 * The same post for a copy of its folder: the project's own media URLs point
```

**Edit 3.** Import them from the URL module, and export them again for the callers that import them from here. Find:

```ts
} from "$lib/shared/media-composition/domain/post-project";
```

Replace it with:

```ts
} from "$lib/shared/media-composition/domain/post-project";
import {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_SLUG_PATTERN,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
} from "$lib/shared/media-composition/domain/feature-video-url";

/** Kept here too, for the callers that already import them from this file. */
export {
  FEATURE_VIDEO_API,
  FEATURE_VIDEO_SLUG_PATTERN,
  featureVideoMediaUrl,
  isFeatureVideoMediaUrl,
  isFeatureVideoSlug,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-url.test.ts tests/unit/media-composition/feature-video-domain.test.ts`

Expected: PASS. The new file has 6 tests, and plan 1's domain tests pass unchanged.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/feature-video-url.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-url.test.ts
git add src/lib/shared/media-composition/domain/feature-video-url.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-url.test.ts
git commit -m "Move feature video slugs and media URLs into a module of their own

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/feature-video-url.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/feature-video-url.test.ts
```

---

### Task 2: A post can carry music

A feature video's music is an optional `music` field on the post: the file's URL, where it starts on the post's clock, which part of the file plays, its level, fades, credit and beat grid. The grid is kept in the file's own seconds, so it moves with the clip and survives trims. A post without music parses as before, so the schema version stays the same. A copied feature video moves the music's URL to its own folder, as it already does for takes and images.

**Files:**
- Create: `src/lib/shared/media-composition/domain/post-music.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project.ts` (its imports, and the `audio` field of the project schema)
- Modify: `src/lib/shared/media-composition/domain/feature-video.ts` (`rehomeFeatureMediaUrls`)
- Test: `tests/unit/media-composition/post-music.test.ts`, and one more test at the end of `tests/unit/media-composition/feature-video-domain.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/post-music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PostMusicSchema,
  type PostMusic,
} from "$lib/shared/media-composition/domain/post-music";
import {
  PostProjectSchema,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { setProjectAudio } from "$lib/shared/media-composition/domain/post-project-edits";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import { NOW, project, video } from "./post-project-fixtures";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: "/api/dev/feature-videos/promo/media/music/derail.wav",
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

const firstError = (value: unknown) =>
  PostMusicSchema.safeParse(value).error?.issues[0]?.message;

describe("post music", () => {
  it("parses music with a grid as it was written", () => {
    const value = music({
      artist: "Yellowbase",
      license: "Epidemic Sound Pro, trial, 2026-10-07",
      grid: { bpm: 85, downbeatSeconds: 0.42, beatsPerBar: 4 },
    });
    expect(PostMusicSchema.parse(value)).toEqual(value);
  });

  it("allows bar 1 to fall before the file's first second", () => {
    const value = music({
      grid: { bpm: 85, downbeatSeconds: -0.25, beatsPerBar: 4 },
    });
    expect(PostMusicSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    [
      "an outside url",
      music({ url: "https://example.test/song.mp3" }),
      "Music must be a feature video media url.",
    ],
    [
      "an end at its start",
      music({ sourceInSeconds: 10, sourceOutSeconds: 10 }),
      "The music must end after it starts.",
    ],
    [
      "an end past the file",
      music({ sourceOutSeconds: 121 }),
      "The music cannot run past the end of its file.",
    ],
  ])("refuses %s", (_name, value, message) => {
    expect(firstError(value)).toBe(message);
  });

  it.each([
    ["a gain of 2.5", music({ gain: 2.5 })],
    [
      "10 BPM",
      music({ grid: { bpm: 10, downbeatSeconds: 0, beatsPerBar: 4 } }),
    ],
    [
      "0 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 0 } }),
    ],
    [
      "13 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 13 } }),
    ],
    [
      "3.5 beats a bar",
      music({ grid: { bpm: 85, downbeatSeconds: 0, beatsPerBar: 3.5 } }),
    ],
    ["an unknown key", { ...music(), tempo: 85 }],
    ["a blank label", music({ label: "   " })],
    ["a start before 0", music({ startSeconds: -1 })],
  ])("refuses %s", (_name, value) => {
    expect(PostMusicSchema.safeParse(value).success).toBe(false);
  });

  it("survives the layout pass and the take-sound switch", () => {
    const withMusic: PostProject = {
      ...project([video("v1")]),
      music: music({ startSeconds: 1 }),
    };
    expect(normalizeProject(withMusic).music).toEqual(
      music({ startSeconds: 1 })
    );
    const silent = setProjectAudio(withMusic, "silent", { now: NOW + 1 });
    expect(silent.audio).toBe("silent");
    expect(silent.music).toEqual(music({ startSeconds: 1 }));
  });

  it("rides on a post, which still parses without it", () => {
    const plain = project([video("v1")]);
    expect(PostProjectSchema.safeParse(plain).success).toBe(true);
    const withMusic = { ...plain, music: music() };
    expect(PostProjectSchema.parse(withMusic)).toEqual(withMusic);
    expect(
      PostProjectSchema.safeParse({ ...plain, music: music({ gain: 3 }) })
        .success
    ).toBe(false);
  });
});
```

Then, in `tests/unit/media-composition/feature-video-domain.test.ts`:

**Edit 1.** Add at the end of the file, after one blank line:

```ts
describe("moving the music to a copied project", () => {
  it("moves the music's URL with the folder", () => {
    const music = {
      id: "music-1",
      url: `${FEATURE_VIDEO_API}/promo-1-0/media/music/derail.wav`,
      label: "Derail",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 120,
      durationSeconds: 120,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    };
    const moved = rehomeFeatureMediaUrls(
      postWith([], { music }),
      "promo-1-0",
      "copy"
    );
    expect(moved.music).toEqual({
      ...music,
      url: `${FEATURE_VIDEO_API}/copy/media/music/derail.wav`,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music.test.ts tests/unit/media-composition/feature-video-domain.test.ts`

Expected: FAIL. `post-music.test.ts` cannot resolve `$lib/shared/media-composition/domain/post-music`. In `feature-video-domain.test.ts` only "moves the music's URL with the folder" fails, with an `AssertionError`: the copy still has the old URL.

- [ ] **Step 3: Create the music schema**

Create `src/lib/shared/media-composition/domain/post-music.ts`:

```ts
import { z } from "zod";
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import {
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
} from "$lib/shared/media-composition/domain/take-timing";

/**
 * One music file under a whole post; only feature videos have one. It plays
 * from `startSeconds` on the post's clock, reading its own file from
 * `sourceInSeconds` to `sourceOutSeconds`. The beat grid is kept in the file's
 * own seconds, so it moves with the clip and survives trims.
 */

export const POST_MUSIC_MAX_GAIN = 2;
export const POST_MUSIC_MAX_BEATS_PER_BAR = 12;
/** The longest label or artist name. */
export const POST_MUSIC_MAX_TEXT = 120;
export const POST_MUSIC_MAX_LICENSE = 500;
/** Room for rounding where a file's measured length meets a typed end. */
const LENGTH_SLACK = 1e-6;

export const PostMusicGridSchema = z
  .object({
    bpm: z.number().finite().min(TAKE_MIN_BPM).max(TAKE_MAX_BPM),
    /** Bar 1, beat 1, in the file's own seconds. It may come before the file starts. */
    downbeatSeconds: z.number().finite(),
    beatsPerBar: z.number().int().min(1).max(POST_MUSIC_MAX_BEATS_PER_BAR),
  })
  .strict();

export const PostMusicSchema = z
  .object({
    id: z.string().trim().min(1),
    url: z
      .string()
      .refine(
        isFeatureVideoMediaUrl,
        "Music must be a feature video media url."
      ),
    label: z.string().trim().min(1).max(POST_MUSIC_MAX_TEXT),
    artist: z.string().trim().min(1).max(POST_MUSIC_MAX_TEXT).optional(),
    /** Library, license id and purchase date, as free text. */
    license: z.string().trim().min(1).max(POST_MUSIC_MAX_LICENSE).optional(),
    /** Where sourceInSeconds sounds on the post's clock. */
    startSeconds: z.number().finite().min(0),
    sourceInSeconds: z.number().finite().min(0),
    sourceOutSeconds: z.number().finite().min(0),
    /** The file's length. */
    durationSeconds: z.number().finite().positive(),
    /** Linear: 1 plays the file as it is, 0 is silent. */
    gain: z.number().finite().min(0).max(POST_MUSIC_MAX_GAIN),
    fadeInSeconds: z.number().finite().min(0),
    fadeOutSeconds: z.number().finite().min(0),
    grid: PostMusicGridSchema.optional(),
  })
  .strict()
  .refine((music) => music.sourceOutSeconds > music.sourceInSeconds, {
    message: "The music must end after it starts.",
    path: ["sourceOutSeconds"],
  })
  .refine(
    (music) => music.sourceOutSeconds <= music.durationSeconds + LENGTH_SLACK,
    {
      message: "The music cannot run past the end of its file.",
      path: ["sourceOutSeconds"],
    }
  );

export type PostMusic = z.infer<typeof PostMusicSchema>;
export type PostMusicGrid = z.infer<typeof PostMusicGridSchema>;
```

- [ ] **Step 4: Add the field to the post**

In `src/lib/shared/media-composition/domain/post-project.ts`:

**Edit 1.** Import the music's schema. Find:

```ts
import { TunnelHookSchema } from "$lib/shared/media-composition/domain/tunnel-hook";
```

Replace it with:

```ts
import { TunnelHookSchema } from "$lib/shared/media-composition/domain/tunnel-hook";
import { PostMusicSchema } from "$lib/shared/media-composition/domain/post-music";
```

**Edit 2.** Add the optional `music` field after `audio`, whose doc now says what silent leaves playing. Find:

```ts
    /**
     * - takes: each clip carries its take's sound at its own volume.
     * - silent: no sound, for music added in the app it is posted from.
     */
    audio: z.enum(["takes", "silent"]),
```

Replace it with:

```ts
    /**
     * - takes: each clip carries its take's sound at its own volume.
     * - silent: the takes are muted, for music added in the app it is
     *   posted from. A feature video's own `music` plays either way.
     */
    audio: z.enum(["takes", "silent"]),
    /**
     * A feature video's song under the whole post, heard in the preview and
     * the export.
     */
    music: PostMusicSchema.optional(),
```

- [ ] **Step 5: Move the music with a copied project**

In `src/lib/shared/media-composition/domain/feature-video.ts`:

**Edit 1.** In `rehomeFeatureMediaUrls`, move the music's URL like the takes' and images'. Find:

```ts
      : { ...image, ref: { kind: "linked" as const, url } };
  });
  return {
```

Replace it with:

```ts
      : { ...image, ref: { kind: "linked" as const, url } };
  });
  const music = project.music && {
    ...project.music,
    url: move(project.music.url),
  };
  return {
```

**Edit 2.** Put the moved music on the copy. Find:

```ts
    ...(images ? { images } : {}),
```

Replace it with:

```ts
    ...(images ? { images } : {}),
    ...(music ? { music } : {}),
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music.test.ts tests/unit/media-composition/feature-video-domain.test.ts tests/unit/media-composition/feature-video-url.test.ts`

Expected: PASS. `post-music.test.ts` has 15 tests, and every domain and URL test passes.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-music.ts src/lib/shared/media-composition/domain/post-project.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/post-music.test.ts tests/unit/media-composition/feature-video-domain.test.ts
git add src/lib/shared/media-composition/domain/post-music.ts src/lib/shared/media-composition/domain/post-project.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/post-music.test.ts tests/unit/media-composition/feature-video-domain.test.ts
git commit -m "A post can carry a feature video's music

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-music.ts src/lib/shared/media-composition/domain/post-project.ts src/lib/shared/media-composition/domain/feature-video.ts tests/unit/media-composition/post-music.test.ts tests/unit/media-composition/feature-video-domain.test.ts
```

---

### Task 3: Bars, beats and post seconds for the music's grid

Everything that thinks in bars goes through one module of pure functions. A grid lives in the music file's own seconds; the music's placement turns those into post seconds:

```
postSeconds(bar, beat) = startSeconds + (downbeatSeconds - sourceInSeconds)
  + ((bar - 1) * beatsPerBar + (beat - 1)) * 60 / bpm
```

The module also lists the grid lines the lane draws, the snap targets the timeline offers (the music's edges, every bar, and every beat while beats sit at least 12 px apart), the bar numbers the ruler shows (every bar, or every 2nd, 4th or 8th as they crowd closer than 28 px), the post seconds for a time a command names (`{ bar, beat }` or plain seconds), and the downbeat that best fits taps made along with the music.

**Files:**
- Create: `src/lib/shared/media-composition/domain/music-grid.ts`
- Test: `tests/unit/media-composition/music-grid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/music-grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  NO_GRID_MESSAGE,
  barBeatAt,
  downbeatFromTaps,
  musicBarMarks,
  musicGridLines,
  musicSnapTargets,
  musicSpan,
  postSecondsAtBar,
  postSecondsAtTrack,
  resolvePostTime,
  resolveTrackTime,
  trackSecondsAt,
} from "$lib/shared/media-composition/domain/music-grid";

// 120 BPM in 4: a beat is 0.5 s and a bar 2 s. The file's bar 1 is at its
// 5.25 s, and the clip plays the file from 5 s at the post's 2 s, so bar 1
// sounds at the post's 2.25 s.
const grid = { bpm: 120, downbeatSeconds: 5.25, beatsPerBar: 4 };
const placed = {
  startSeconds: 2,
  sourceInSeconds: 5,
  sourceOutSeconds: 35,
  grid,
};

describe("the music's place on the post clock", () => {
  it("maps post seconds to the file's seconds and back", () => {
    expect(musicSpan(placed)).toEqual({ start: 2, end: 32 });
    expect(trackSecondsAt(placed, 2)).toBe(5);
    expect(trackSecondsAt(placed, 10)).toBe(13);
    expect(postSecondsAtTrack(placed, 13)).toBe(10);
  });

  it("puts bars and beats where the spec's formula does", () => {
    expect(postSecondsAtBar(placed, 1)).toBeCloseTo(2.25, 9);
    expect(postSecondsAtBar(placed, 9)).toBeCloseTo(18.25, 9);
    // 2 + (5.25 - 5) + ((9 - 1) * 4 + (3 - 1)) * 60 / 120
    expect(postSecondsAtBar(placed, 9, 3)).toBeCloseTo(19.25, 9);
  });

  it("names the bar and beat sounding at a post second", () => {
    expect(barBeatAt(placed, 19.3)).toEqual({ bar: 9, beat: 3 });
    expect(barBeatAt(placed, 2.25)).toEqual({ bar: 1, beat: 1 });
    // Just before bar 1: the last beat of bar 0.
    expect(barBeatAt(placed, 2.1)).toEqual({ bar: 0, beat: 4 });
  });

  it("counts bars of three, before bar 1 too", () => {
    // 90 BPM in 3: a beat is 2/3 s and a bar 2 s; bar 1 still sounds at 2.25.
    const waltz = {
      ...placed,
      grid: { bpm: 90, downbeatSeconds: 5.25, beatsPerBar: 3 },
    };
    // 2 + (5.25 - 5) + ((4 - 1) * 3 + (2 - 1)) * 60 / 90
    expect(postSecondsAtBar(waltz, 4, 2)).toBeCloseTo(2.25 + 20 / 3, 9);
    expect(barBeatAt(waltz, 2.25 + 20 / 3 + 0.01)).toEqual({ bar: 4, beat: 2 });
    expect(barBeatAt(waltz, 2.25 - 2 / 3 + 0.01)).toEqual({ bar: 0, beat: 3 });
    expect(barBeatAt(waltz, 2.25 - 4 / 3 + 0.01)).toEqual({ bar: 0, beat: 2 });
    expect(barBeatAt(waltz, 2.25 - 2 - 0.01)).toEqual({ bar: -1, beat: 3 });
    expect(() => resolvePostTime({ bar: 4, beat: 4 }, waltz, "at")).toThrow(
      "at: the beat must be a whole number from 1 to 3."
    );
  });
});

describe("grid lines", () => {
  it("lists every beat in a window, marking each bar's first", () => {
    const lines = musicGridLines(placed, 0, 4).map((line) => [
      line.seconds,
      line.bar,
      line.beat,
      line.downbeat,
    ]);
    expect(lines).toEqual([
      [2.25, 1, 1, true],
      [2.75, 1, 2, false],
      [3.25, 1, 3, false],
      [3.75, 1, 4, false],
    ]);
  });

  it("stops where the music stops", () => {
    const lines = musicGridLines(placed, 30, 40);
    expect(lines.map((line) => line.seconds)).toEqual([
      30.25, 30.75, 31.25, 31.75,
    ]);
    expect(lines[0]).toMatchObject({ bar: 15, beat: 1, downbeat: true });
    expect(musicGridLines(placed, 40, 50)).toEqual([]);
  });
});

describe("snap targets", () => {
  it("offers every beat when beats sit at least 12 px apart", () => {
    // 60 px a second puts beats 30 px apart.
    const targets = musicSnapTargets(placed, 60);
    expect(targets.slice(0, 4)).toEqual([2, 32, 2.25, 2.75]);
    expect(targets).toHaveLength(2 + 60);
  });

  it("offers only bars when beats crowd", () => {
    // 20 px a second puts beats 10 px apart and bars 40 px apart.
    const targets = musicSnapTargets(placed, 20);
    expect(targets).toHaveLength(2 + 15);
    expect(targets.slice(2, 5)).toEqual([2.25, 4.25, 6.25]);
  });

  it("offers just the music's edges without a grid", () => {
    const { grid: _grid, ...plain } = placed;
    expect(musicSnapTargets(plain, 60)).toEqual([2, 32]);
  });
});

describe("bar numbers on the ruler", () => {
  it("labels every bar when there is room", () => {
    const marks = musicBarMarks(placed, 60);
    expect(marks).toHaveLength(15);
    expect(marks[0]).toEqual({ seconds: 2.25, label: "1" });
    expect(marks[8]).toEqual({ seconds: 18.25, label: "9" });
  });

  it("labels every 2nd, then every 4th bar as the zoom shrinks", () => {
    // Bars 16 px apart: every 2nd bar is 32 px.
    expect(musicBarMarks(placed, 8).map((mark) => mark.label)).toEqual([
      "1",
      "3",
      "5",
      "7",
      "9",
      "11",
      "13",
      "15",
    ]);
    // Bars 8 px apart: every 4th bar is 32 px.
    expect(musicBarMarks(placed, 4).map((mark) => mark.label)).toEqual([
      "1",
      "5",
      "9",
      "13",
    ]);
  });
});

describe("times a command names", () => {
  it("reads seconds as seconds and bars through the grid", () => {
    expect(resolvePostTime(9, placed, "at")).toBe(9);
    expect(resolvePostTime({ bar: 9 }, placed, "at")).toBeCloseTo(18.25, 9);
    expect(resolvePostTime({ bar: 9, beat: 3 }, placed, "at")).toBeCloseTo(
      19.25,
      9
    );
    expect(resolveTrackTime({ bar: 2 }, grid, "in")).toBeCloseTo(7.25, 9);
    expect(resolveTrackTime(12, undefined, "in")).toBe(12);
  });

  it("explains what is wrong with a time it cannot use", () => {
    const { grid: _grid, ...plain } = placed;
    expect(() => resolvePostTime({ bar: 9 }, plain, "at")).toThrow(
      NO_GRID_MESSAGE
    );
    expect(() => resolvePostTime({ bar: 9 }, undefined, "at")).toThrow(
      NO_GRID_MESSAGE
    );
    expect(() => resolvePostTime({ bar: 9, beat: 5 }, placed, "at")).toThrow(
      "at: the beat must be a whole number from 1 to 4."
    );
    expect(() => resolvePostTime({ bar: 9.5 }, placed, "at")).toThrow(
      "at: a bar must be a whole number, like @9."
    );
    expect(() => resolvePostTime("soon", placed, "at")).toThrow(
      "at must be a number of seconds or a bar like @9 or @9.3."
    );
    expect(() => resolvePostTime(Number.NaN, placed, "at")).toThrow(
      "at must be a number of seconds or a bar like @9 or @9.3."
    );
  });
});

describe("a downbeat from taps", () => {
  it("averages the taps' place on the beat", () => {
    // Taps on a 0.5 s beat at phase 0.1, each a little early or late.
    const downbeat = downbeatFromTaps([10.1, 10.62, 11.08, 11.61], 120, 10.1);
    expect(downbeat).not.toBeNull();
    expect(Math.abs(downbeat! - 10.1)).toBeLessThan(0.02);
  });

  it("averages around the beat, so taps either side of it agree", () => {
    // Phases 0.49, 0.01, 0.02 and 0.48 all sit near the beat at 0.
    const downbeat = downbeatFromTaps([10.49, 11.01, 11.52, 11.98], 120, 10.49);
    expect(Math.abs(downbeat! - 10.5)).toBeLessThan(0.02);
  });

  it("needs two taps that agree", () => {
    expect(downbeatFromTaps([10.1], 120, 10.1)).toBeNull();
    expect(downbeatFromTaps([0, 0.25], 120, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/music-grid.test.ts`

Expected: FAIL, with `Failed to resolve import "$lib/shared/media-composition/domain/music-grid"`.

- [ ] **Step 3: Create the grid module**

Create `src/lib/shared/media-composition/domain/music-grid.ts`:

```ts
import type {
  PostMusic,
  PostMusicGrid,
} from "$lib/shared/media-composition/domain/post-music";

/**
 * Bars, beats and the post's clock. A grid lives in the music file's own
 * seconds; the music's placement turns those into post seconds:
 *
 *   postSeconds(bar, beat) = startSeconds + (downbeatSeconds - sourceInSeconds)
 *     + ((bar - 1) * beatsPerBar + (beat - 1)) * 60 / bpm
 */

/** What places the music on the post's clock. */
export type MusicPlacement = Pick<
  PostMusic,
  "startSeconds" | "sourceInSeconds" | "sourceOutSeconds"
> & { grid?: PostMusicGrid };
export type GriddedMusic = MusicPlacement & { grid: PostMusicGrid };

/** One grid line on the post's clock. A downbeat is a bar's first beat. */
export interface MusicGridLine {
  seconds: number;
  bar: number;
  beat: number;
  downbeat: boolean;
}

/** A time a command names: post seconds, or a bar and beat of the music. */
export type PostTimeRef = number | { bar: number; beat?: number };

/** Below this many pixels apart, beats stop being snap targets; bars stay. */
export const MUSIC_BEAT_SNAP_MIN_PX = 12;
/** Bar numbers closer than this on the ruler are thinned out. */
export const MUSIC_BAR_LABEL_MIN_PX = 28;
export const NO_GRID_MESSAGE =
  "This post has no beat grid. Set one with: music --bpm N --downbeat S.";

export function hasGrid<T extends MusicPlacement>(
  music: T
): music is T & { grid: PostMusicGrid } {
  return music.grid !== undefined;
}

/** Where the music sounds on the post's clock. */
export function musicSpan(music: MusicPlacement): {
  start: number;
  end: number;
} {
  return {
    start: music.startSeconds,
    end: music.startSeconds + (music.sourceOutSeconds - music.sourceInSeconds),
  };
}

/** The file's own second that sounds at this post second. */
export function trackSecondsAt(
  music: MusicPlacement,
  postSeconds: number
): number {
  return music.sourceInSeconds + (postSeconds - music.startSeconds);
}

/** The post second at which this second of the file sounds. */
export function postSecondsAtTrack(
  music: MusicPlacement,
  trackSeconds: number
): number {
  return music.startSeconds + (trackSeconds - music.sourceInSeconds);
}

export function beatSeconds(grid: PostMusicGrid): number {
  return 60 / grid.bpm;
}

/** Bar `bar`, beat `beat` (both counted from 1) in the file's own seconds. */
export function trackSecondsAtBar(
  grid: PostMusicGrid,
  bar: number,
  beat = 1
): number {
  return (
    grid.downbeatSeconds +
    ((bar - 1) * grid.beatsPerBar + (beat - 1)) * beatSeconds(grid)
  );
}

/** Bar `bar`, beat `beat` on the post's clock. */
export function postSecondsAtBar(
  music: GriddedMusic,
  bar: number,
  beat = 1
): number {
  return postSecondsAtTrack(music, trackSecondsAtBar(music.grid, bar, beat));
}

/** The bar and beat sounding at a post second. Bars before bar 1 count 0, -1 and on. */
export function barBeatAt(
  music: GriddedMusic,
  postSeconds: number
): { bar: number; beat: number } {
  const { grid } = music;
  const beats = Math.floor(
    (trackSecondsAt(music, postSeconds) - grid.downbeatSeconds) /
      beatSeconds(grid) +
      1e-9
  );
  const bar = Math.floor(beats / grid.beatsPerBar) + 1;
  return { bar, beat: beats - (bar - 1) * grid.beatsPerBar + 1 };
}

/** Every beat from `from` to `to` on the post's clock that the music sounds. */
export function musicGridLines(
  music: GriddedMusic,
  from: number,
  to: number
): MusicGridLine[] {
  const span = musicSpan(music);
  const low = Math.max(from, span.start);
  const high = Math.min(to, span.end);
  if (high < low) return [];
  const step = beatSeconds(music.grid);
  const zero = postSecondsAtTrack(music, music.grid.downbeatSeconds);
  const first = Math.ceil((low - zero) / step - 1e-9);
  const last = Math.floor((high - zero) / step + 1e-9);
  const lines: MusicGridLine[] = [];
  for (let n = first; n <= last; n += 1) {
    const bar = Math.floor(n / music.grid.beatsPerBar) + 1;
    const beat = n - (bar - 1) * music.grid.beatsPerBar + 1;
    lines.push({ seconds: zero + n * step, bar, beat, downbeat: beat === 1 });
  }
  return lines;
}

/** The music's edges, every bar, and every beat once beats sit far enough apart. */
export function musicSnapTargets(
  music: MusicPlacement,
  pixelsPerSecond: number
): number[] {
  const span = musicSpan(music);
  const targets = [span.start, span.end];
  if (!hasGrid(music)) return targets;
  const beats =
    beatSeconds(music.grid) * pixelsPerSecond >= MUSIC_BEAT_SNAP_MIN_PX;
  for (const line of musicGridLines(music, span.start, span.end))
    if (beats || line.downbeat) targets.push(line.seconds);
  return targets;
}

/** Bar numbers for the ruler: every bar, or every 2nd, 4th, 8th as they crowd. */
export function musicBarMarks(
  music: GriddedMusic,
  pixelsPerSecond: number
): { seconds: number; label: string }[] {
  const barPx =
    beatSeconds(music.grid) * music.grid.beatsPerBar * pixelsPerSecond;
  let every = 1;
  while (barPx * every < MUSIC_BAR_LABEL_MIN_PX && every < 1024) every *= 2;
  const span = musicSpan(music);
  return musicGridLines(music, span.start, span.end)
    .filter(
      (line) => line.downbeat && line.bar >= 1 && (line.bar - 1) % every === 0
    )
    .map((line) => ({ seconds: line.seconds, label: String(line.bar) }));
}

function checkedRef(ref: unknown, name: string): PostTimeRef {
  if (typeof ref === "number" && Number.isFinite(ref)) return ref;
  if (ref !== null && typeof ref === "object") {
    const { bar, beat } = ref as { bar?: unknown; beat?: unknown };
    if (
      typeof bar === "number" &&
      (beat === undefined || typeof beat === "number")
    )
      return { bar, ...(beat === undefined ? {} : { beat }) };
  }
  throw new Error(
    `${name} must be a number of seconds or a bar like @9 or @9.3.`
  );
}

function checkedBar(
  ref: { bar: number; beat?: number },
  grid: PostMusicGrid,
  name: string
): [number, number] {
  const beat = ref.beat ?? 1;
  if (!Number.isInteger(ref.bar))
    throw new Error(`${name}: a bar must be a whole number, like @9.`);
  if (!Number.isInteger(beat) || beat < 1 || beat > grid.beatsPerBar)
    throw new Error(
      `${name}: the beat must be a whole number from 1 to ${grid.beatsPerBar}.`
    );
  return [ref.bar, beat];
}

/** Post seconds for a time a command named. A bar needs the beat grid. */
export function resolvePostTime(
  ref: unknown,
  music: MusicPlacement | undefined,
  name: string
): number {
  const checked = checkedRef(ref, name);
  if (typeof checked === "number") return checked;
  if (!music || !hasGrid(music)) throw new Error(NO_GRID_MESSAGE);
  return postSecondsAtBar(music, ...checkedBar(checked, music.grid, name));
}

/** The file's own seconds for a time a command named. A bar needs the beat grid. */
export function resolveTrackTime(
  ref: unknown,
  grid: PostMusicGrid | undefined,
  name: string
): number {
  const checked = checkedRef(ref, name);
  if (typeof checked === "number") return checked;
  if (!grid) throw new Error(NO_GRID_MESSAGE);
  return trackSecondsAtBar(grid, ...checkedBar(checked, grid, name));
}

/**
 * The downbeat that best fits taps made along with the music, in the file's
 * own seconds: the taps' average place on the beat, moved to the beat nearest
 * `near`. Null with fewer than two taps, or taps that agree on nothing.
 */
export function downbeatFromTaps(
  taps: readonly number[],
  bpm: number,
  near: number
): number | null {
  if (taps.length < 2) return null;
  const period = 60 / bpm;
  let x = 0;
  let y = 0;
  for (const tap of taps) {
    const angle = (2 * Math.PI * tap) / period;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  if (Math.hypot(x, y) < 1e-6 * taps.length) return null;
  const turn = Math.atan2(y, x) / (2 * Math.PI);
  const phase = (((turn * period) % period) + period) % period;
  return phase + Math.round((near - phase) / period) * period;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/music-grid.test.ts`

Expected: PASS, 16 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/music-grid.ts tests/unit/media-composition/music-grid.test.ts
git add src/lib/shared/media-composition/domain/music-grid.ts tests/unit/media-composition/music-grid.test.ts
git commit -m "Bars, beats and post seconds for the music's grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/music-grid.ts tests/unit/media-composition/music-grid.test.ts
```

---

### Task 4: Edits that set, change, trim and remove the music

The editor, the Music panel and the named ops all change the music through these pure edits. Like the timeline's edits in `post-project-edits.ts`, each one runs its result through `finish` and returns the very project it was given when nothing changes, so an edit that changes nothing makes no undo step. `setMusic` puts a file under the post: the same file again keeps its place, trims, level, fades and grid, fitted to the length it has now, and a different file starts whole at 0 at full level. `updateMusic` fits each value into range. `trimMusic` drags one edge while the other stays where it sounds. `syncedSourceIn` finds the take second a clip must start from to play in time with the music.

**Files:**
- Create: `src/lib/shared/media-composition/domain/post-music-edits.ts`
- Test: `tests/unit/media-composition/post-music-edits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-music-edits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import {
  POST_MUSIC_ID,
  removeMusic,
  setMusic,
  syncedSourceIn,
  trimMusic,
  updateMusic,
} from "$lib/shared/media-composition/domain/post-music-edits";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import { NOW, project, video } from "./post-project-fixtures";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: "/api/dev/feature-videos/promo/media/music/derail.wav",
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

const ctx = { now: NOW + 1 };
const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const OTHER = "/api/dev/feature-videos/promo/media/music/parsec.wav";
const GRID = { bpm: 85, downbeatSeconds: 0.42, beatsPerBar: 4 };

function withMusic(fields: Partial<PostMusic> = {}): PostProject {
  return { ...project([video("v1")]), music: music(fields) };
}

describe("setMusic", () => {
  it("puts a whole file under the post at full level", () => {
    const next = setMusic(
      project([video("v1")]),
      {
        url: URL,
        durationSeconds: 96.5,
        label: "Derail",
        artist: "Yellowbase",
      },
      ctx
    );
    expect(next.music).toEqual({
      id: POST_MUSIC_ID,
      url: URL,
      label: "Derail",
      artist: "Yellowbase",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 96.5,
      durationSeconds: 96.5,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    });
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("keeps the same file's place, trims, level, fades and grid", () => {
    const before = withMusic({
      startSeconds: 4,
      sourceInSeconds: 10,
      sourceOutSeconds: 70,
      gain: 0.7,
      fadeOutSeconds: 3,
      grid: GRID,
    });
    const next = setMusic(
      before,
      { url: URL, durationSeconds: 60, label: "Derail" },
      ctx
    );
    expect(next.music).toMatchObject({
      startSeconds: 4,
      sourceInSeconds: 10,
      sourceOutSeconds: 60,
      durationSeconds: 60,
      gain: 0.7,
      fadeOutSeconds: 3,
      grid: GRID,
    });
  });

  it("starts a different file over, keeping the music's id", () => {
    const before = withMusic({ startSeconds: 4, gain: 0.7, grid: GRID });
    const next = setMusic(
      before,
      { url: OTHER, durationSeconds: 80, label: "PARSEC" },
      ctx
    );
    expect(next.music).toEqual({
      id: "music-1",
      url: OTHER,
      label: "PARSEC",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 80,
      durationSeconds: 80,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    });
  });

  it("changes nothing when the same file comes back as it was", () => {
    const before = withMusic();
    expect(
      setMusic(before, { url: URL, durationSeconds: 120, label: "Derail" }, ctx)
    ).toBe(before);
  });
});

describe("updateMusic", () => {
  it("fits each value into range", () => {
    const next = updateMusic(
      withMusic(),
      {
        gain: 5,
        fadeInSeconds: 500,
        sourceInSeconds: -3,
        sourceOutSeconds: 999,
        startSeconds: -1,
      },
      ctx
    );
    expect(next.music).toMatchObject({
      gain: 2,
      fadeInSeconds: 120,
      sourceInSeconds: 0,
      sourceOutSeconds: 120,
      startSeconds: 0,
    });
  });

  it("keeps a moved start before the end", () => {
    const next = updateMusic(withMusic(), { sourceInSeconds: 200 }, ctx);
    expect(next.music!.sourceInSeconds).toBeCloseTo(119.9, 9);
    expect(next.music!.sourceOutSeconds).toBe(120);
  });

  it("makes a grid from a BPM, starting at the music's first sound", () => {
    const next = updateMusic(
      withMusic({ sourceInSeconds: 3 }),
      { bpm: 85 },
      ctx
    );
    expect(next.music!.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 3,
      beatsPerBar: 4,
    });
  });

  it("changes the grid and clears it", () => {
    const gridded = withMusic({ grid: GRID });
    expect(
      updateMusic(gridded, { downbeatSeconds: 0.5, beatsPerBar: 3.6 }, ctx)
        .music!.grid
    ).toEqual({ bpm: 85, downbeatSeconds: 0.5, beatsPerBar: 4 });
    expect(
      updateMusic(gridded, { beatsPerBar: 0 }, ctx).music!.grid!.beatsPerBar
    ).toBe(1);
    expect(
      updateMusic(gridded, { bpm: null }, ctx).music!.grid
    ).toBeUndefined();
  });

  it("ignores a downbeat when there is no grid", () => {
    const before = withMusic();
    expect(updateMusic(before, { downbeatSeconds: 1 }, ctx)).toBe(before);
  });

  it("keeps a label, and clears an artist or license left blank", () => {
    const before = withMusic({ artist: "Yellowbase", license: "Trial" });
    expect(updateMusic(before, { label: "   " }, ctx)).toBe(before);
    const next = updateMusic(before, { artist: "  ", license: null }, ctx);
    expect(next.music!.artist).toBeUndefined();
    expect(next.music!.license).toBeUndefined();
    expect(
      updateMusic(before, { license: " Pro, 2026-10-07 " }, ctx).music!.license
    ).toBe("Pro, 2026-10-07");
  });

  it("changes nothing when every value is the one it has", () => {
    const before = withMusic({ grid: GRID });
    expect(updateMusic(before, { gain: 1, bpm: 85 }, ctx)).toBe(before);
    const silent = project([video("v1")]);
    expect(updateMusic(silent, { gain: 0.5 }, ctx)).toBe(silent);
  });
});

describe("trimMusic", () => {
  const placed = () =>
    withMusic({ startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35 });

  it("trims the opening, leaving the end where it sounds", () => {
    const next = trimMusic(placed(), "start", 4, ctx).music!;
    expect(next).toMatchObject({
      startSeconds: 4,
      sourceInSeconds: 7,
      sourceOutSeconds: 35,
    });
  });

  it("stops the opening at the file's first second and near the end", () => {
    expect(trimMusic(placed(), "start", -10, ctx).music).toMatchObject({
      startSeconds: 0,
      sourceInSeconds: 3,
    });
    const late = trimMusic(placed(), "start", 40, ctx).music!;
    expect(late.startSeconds).toBeCloseTo(31.9, 9);
    expect(late.sourceInSeconds).toBeCloseTo(34.9, 9);
  });

  it("trims the close, inside the file", () => {
    expect(trimMusic(placed(), "end", 20, ctx).music!.sourceOutSeconds).toBe(
      23
    );
    expect(trimMusic(placed(), "end", 1000, ctx).music!.sourceOutSeconds).toBe(
      120
    );
    expect(
      trimMusic(placed(), "end", 0, ctx).music!.sourceOutSeconds
    ).toBeCloseTo(5.1, 9);
  });
});

describe("removeMusic and syncedSourceIn", () => {
  it("removes the music, and changes nothing without it", () => {
    expect(removeMusic(withMusic(), ctx).music).toBeUndefined();
    const silent = project([video("v1")]);
    expect(removeMusic(silent, ctx)).toBe(silent);
  });

  it("finds the take second that sounds with the music where the clip sits", () => {
    // At the post's 10 s the music plays its 13 s; the camera started 3 s
    // into the music, so the take must be at its own 10 s.
    expect(
      syncedSourceIn({ startSeconds: 2, sourceInSeconds: 5 }, { start: 10 }, 3)
    ).toBe(10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music-edits.test.ts`

Expected: FAIL, with `Failed to resolve import "$lib/shared/media-composition/domain/post-music-edits"`.

- [ ] **Step 3: Create the edits**

Create `src/lib/shared/media-composition/domain/post-music-edits.ts`:

```ts
import {
  POST_MIN_ITEM_SECONDS,
  type PostProject,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  finish,
  type EditContext,
} from "$lib/shared/media-composition/domain/post-project-edits";
import {
  TAKE_MAX_BPM,
  TAKE_MIN_BPM,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  POST_MUSIC_MAX_BEATS_PER_BAR,
  POST_MUSIC_MAX_GAIN,
  POST_MUSIC_MAX_LICENSE,
  POST_MUSIC_MAX_TEXT,
  type PostMusic,
  type PostMusicGrid,
} from "$lib/shared/media-composition/domain/post-music";

/**
 * Edits to the post's music. Like the timeline's edits, each is pure, runs
 * the result through `finish`, and returns the project it was given when
 * nothing changes, so no empty undo step is made.
 */

export const POST_MUSIC_ID = "music-1";
/** The shortest stretch of music the timeline keeps. */
export const POST_MUSIC_MIN_SECONDS = POST_MIN_ITEM_SECONDS;

export interface NewMusic {
  url: string;
  durationSeconds: number;
  label: string;
  artist?: string;
  license?: string;
}

export interface MusicPatch {
  startSeconds?: number;
  sourceInSeconds?: number;
  sourceOutSeconds?: number;
  gain?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  label?: string;
  /** null removes it. */
  artist?: string | null;
  /** null removes it. */
  license?: string | null;
  /** null removes the beat grid; a number makes one when there is none. */
  bpm?: number | null;
  downbeatSeconds?: number;
  beatsPerBar?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Trimmed and cut to length; undefined when nothing is left. */
function cleanText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim().slice(0, max).trim();
  return text ? text : undefined;
}

/** The same music, whatever order its keys were written in. */
function sameMusic(a: PostMusic, b: PostMusic): boolean {
  const flat = (music: PostMusic) =>
    JSON.stringify(
      Object.entries({
        ...music,
        grid: music.grid && [
          music.grid.bpm,
          music.grid.downbeatSeconds,
          music.grid.beatsPerBar,
        ],
      }).sort(([x], [y]) => x.localeCompare(y))
    );
  return flat(a) === flat(b);
}

/**
 * Puts a music file under the post. The same file again keeps its place,
 * trims, level, fades and grid, fitted to the length it has now; a different
 * file starts whole at 0 at full level.
 */
export function setMusic(
  project: PostProject,
  next: NewMusic,
  ctx: EditContext
): PostProject {
  const previous = project.music;
  const kept = previous?.url === next.url ? previous : undefined;
  const length = next.durationSeconds;
  const sourceInSeconds = kept
    ? Math.min(
        kept.sourceInSeconds,
        Math.max(0, length - POST_MUSIC_MIN_SECONDS)
      )
    : 0;
  const sourceOutSeconds = kept
    ? Math.min(
        length,
        Math.max(
          kept.sourceOutSeconds,
          sourceInSeconds + POST_MUSIC_MIN_SECONDS
        )
      )
    : length;
  const playing = sourceOutSeconds - sourceInSeconds;
  const artist = cleanText(next.artist ?? kept?.artist, POST_MUSIC_MAX_TEXT);
  const license = cleanText(
    next.license ?? kept?.license,
    POST_MUSIC_MAX_LICENSE
  );
  const music: PostMusic = {
    id: previous?.id ?? POST_MUSIC_ID,
    url: next.url,
    label: cleanText(next.label, POST_MUSIC_MAX_TEXT) ?? "Music",
    ...(artist ? { artist } : {}),
    ...(license ? { license } : {}),
    startSeconds: kept?.startSeconds ?? 0,
    sourceInSeconds,
    sourceOutSeconds,
    durationSeconds: length,
    gain: kept?.gain ?? 1,
    fadeInSeconds: Math.min(kept?.fadeInSeconds ?? 0, playing),
    fadeOutSeconds: Math.min(kept?.fadeOutSeconds ?? 0, playing),
    ...(kept?.grid ? { grid: kept.grid } : {}),
  };
  if (previous && sameMusic(previous, music)) return project;
  return finish({ ...project, music }, ctx);
}

/** Changes the music, fitting each value into range. Without music, nothing changes. */
export function updateMusic(
  project: PostProject,
  patch: MusicPatch,
  ctx: EditContext
): PostProject {
  const music = project.music;
  if (!music) return project;
  let { sourceInSeconds, sourceOutSeconds } = music;
  if (finite(patch.sourceInSeconds)) {
    const ceiling = finite(patch.sourceOutSeconds)
      ? music.durationSeconds
      : sourceOutSeconds;
    sourceInSeconds = clamp(
      patch.sourceInSeconds,
      0,
      Math.max(0, ceiling - POST_MUSIC_MIN_SECONDS)
    );
  }
  if (finite(patch.sourceOutSeconds))
    sourceOutSeconds = clamp(
      patch.sourceOutSeconds,
      sourceInSeconds + POST_MUSIC_MIN_SECONDS,
      Math.max(sourceInSeconds + POST_MUSIC_MIN_SECONDS, music.durationSeconds)
    );
  const playing = sourceOutSeconds - sourceInSeconds;

  let grid: PostMusicGrid | undefined = music.grid;
  if (patch.bpm === null) grid = undefined;
  else {
    const bpm = finite(patch.bpm)
      ? clamp(patch.bpm, TAKE_MIN_BPM, TAKE_MAX_BPM)
      : grid?.bpm;
    if (bpm !== undefined)
      grid = {
        bpm,
        downbeatSeconds: finite(patch.downbeatSeconds)
          ? patch.downbeatSeconds
          : (grid?.downbeatSeconds ?? sourceInSeconds),
        beatsPerBar: finite(patch.beatsPerBar)
          ? clamp(
              Math.round(patch.beatsPerBar),
              1,
              POST_MUSIC_MAX_BEATS_PER_BAR
            )
          : (grid?.beatsPerBar ?? 4),
      };
  }

  const label = cleanText(patch.label, POST_MUSIC_MAX_TEXT) ?? music.label;
  const artist =
    patch.artist === undefined
      ? music.artist
      : cleanText(patch.artist ?? undefined, POST_MUSIC_MAX_TEXT);
  const license =
    patch.license === undefined
      ? music.license
      : cleanText(patch.license ?? undefined, POST_MUSIC_MAX_LICENSE);
  const { artist: _artist, license: _license, grid: _grid, ...plain } = music;
  const next: PostMusic = {
    ...plain,
    label,
    ...(artist ? { artist } : {}),
    ...(license ? { license } : {}),
    startSeconds: finite(patch.startSeconds)
      ? Math.max(0, patch.startSeconds)
      : music.startSeconds,
    sourceInSeconds,
    sourceOutSeconds,
    gain: finite(patch.gain)
      ? clamp(patch.gain, 0, POST_MUSIC_MAX_GAIN)
      : music.gain,
    fadeInSeconds: clamp(
      finite(patch.fadeInSeconds) ? patch.fadeInSeconds : music.fadeInSeconds,
      0,
      playing
    ),
    fadeOutSeconds: clamp(
      finite(patch.fadeOutSeconds)
        ? patch.fadeOutSeconds
        : music.fadeOutSeconds,
      0,
      playing
    ),
    ...(grid ? { grid } : {}),
  };
  if (sameMusic(music, next)) return project;
  return finish({ ...project, music: next }, ctx);
}

/**
 * Drags one edge of the music to a post second. The start edge trims the
 * file's opening and the end edge its close; the other edge stays where it
 * sounds.
 */
export function trimMusic(
  project: PostProject,
  edge: "start" | "end",
  postSeconds: number,
  ctx: EditContext
): PostProject {
  const music = project.music;
  if (!music || !Number.isFinite(postSeconds)) return project;
  if (edge === "end")
    return updateMusic(
      project,
      {
        sourceOutSeconds:
          music.sourceInSeconds + (postSeconds - music.startSeconds),
      },
      ctx
    );
  const earliest = Math.max(0, music.startSeconds - music.sourceInSeconds);
  const latest =
    music.startSeconds +
    (music.sourceOutSeconds - POST_MUSIC_MIN_SECONDS - music.sourceInSeconds);
  const startSeconds = clamp(postSeconds, earliest, Math.max(earliest, latest));
  return updateMusic(
    project,
    {
      startSeconds,
      sourceInSeconds:
        music.sourceInSeconds + (startSeconds - music.startSeconds),
    },
    ctx
  );
}

export function removeMusic(
  project: PostProject,
  ctx: EditContext
): PostProject {
  if (!project.music) return project;
  const { music: _music, ...rest } = project;
  return finish(rest, ctx);
}

/**
 * The take second a clip must start from so the take plays in time with the
 * music where the clip sits now. `offsetSeconds` is the music's own time
 * minus the take's own time at the same moment: positive when the camera
 * started after the music did.
 */
export function syncedSourceIn(
  music: Pick<PostMusic, "startSeconds" | "sourceInSeconds">,
  clip: Pick<PostVideoItem, "start">,
  offsetSeconds: number
): number {
  return (
    clip.start + (music.sourceInSeconds - music.startSeconds) - offsetSeconds
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music-edits.test.ts`

Expected: PASS, 16 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-music-edits.ts tests/unit/media-composition/post-music-edits.test.ts
git add src/lib/shared/media-composition/domain/post-music-edits.ts tests/unit/media-composition/post-music-edits.test.ts
git commit -m "Edits that set, change, trim and remove the music

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-music-edits.ts tests/unit/media-composition/post-music-edits.test.ts
```

---

### Task 5: Named edits for the music, and bar times in titles and trims

The CLI and the bridge change a post through named ops in `post-project-ops.ts`, which plan 1 extended with the take ops. This task adds four more: `add-music` (a feature video media URL and the file's length, with an optional name, artist and license), `music` (any of the music's settings; times may name a bar), `remove-music`, and `sync-to-music` (puts a clip in time with the music at an offset `align-take` measured). The `at` of `add-titles` and the `seconds` of `trim` may now be `{ bar, beat }` as well as seconds. Within one `music` op the grid is set first, so bars named in the same op count on the new grid.

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project-ops.ts` (imports, the op union, the helpers before `applyOp`, and `applyOp`'s cases)
- Test: `tests/unit/media-composition/post-project-ops-music.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-ops-music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import type {
  PostProject,
  PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { featureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import { NO_GRID_MESSAGE } from "$lib/shared/media-composition/domain/music-grid";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, card, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const URL = featureVideoMediaUrl("promo", "music/derail.wav");
const GRID = { bpm: 120, downbeatSeconds: 5.25, beatsPerBar: 4 };

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

function withMusic(
  fields: Partial<PostMusic> = {},
  main = [video("v1")]
): PostProject {
  return { ...project(main), music: music(fields) };
}

function run(start: PostProject, ...ops: PostProjectOp[]): PostProject {
  return applyPostProjectOps(start, ops, ctx);
}

function firstClip(next: PostProject): PostVideoItem {
  return next.tracks[0]!.items[0] as PostVideoItem;
}

describe("add-music", () => {
  it("puts a file under the post, whole and at full level, named after it", () => {
    const next = run(project([video("v1")]), {
      op: "add-music",
      url: URL,
      durationSeconds: 96.5,
    });
    expect(next.music).toEqual({
      id: "music-1",
      url: URL,
      label: "derail",
      startSeconds: 0,
      sourceInSeconds: 0,
      sourceOutSeconds: 96.5,
      durationSeconds: 96.5,
      gain: 1,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    });
    expect(next.updatedAt).toBe(NOW + 1);
  });

  it("takes a name, an artist and a license", () => {
    const next = run(project([video("v1")]), {
      op: "add-music",
      url: URL,
      durationSeconds: 90,
      label: " Derail ",
      artist: "Yellowbase",
      license: "Epidemic Sound, 2026-10-06",
    });
    expect(next.music).toMatchObject({
      label: "Derail",
      artist: "Yellowbase",
      license: "Epidemic Sound, 2026-10-06",
    });
  });

  it("keeps a chosen name and the trims when the same file comes back", () => {
    const before = withMusic({
      label: "Derail (edit)",
      artist: "Yellowbase",
      startSeconds: 1,
      sourceInSeconds: 8,
      sourceOutSeconds: 60,
    });
    const next = run(before, {
      op: "add-music",
      url: URL,
      durationSeconds: 100,
    });
    expect(next.music).toMatchObject({
      label: "Derail (edit)",
      artist: "Yellowbase",
      startSeconds: 1,
      sourceInSeconds: 8,
      sourceOutSeconds: 60,
      durationSeconds: 100,
    });
  });

  it("refuses music from outside a feature video, and a length below zero", () => {
    expect(() =>
      run(project([]), {
        op: "add-music",
        url: "https://example.test/a.wav",
        durationSeconds: 3,
      })
    ).toThrow(
      "Edit 1 (add-music): Music's url must be a feature video media url"
    );
    expect(() =>
      run(project([]), { op: "add-music", url: URL, durationSeconds: -1 })
    ).toThrow("durationSeconds must be a positive number.");
  });
});

describe("music", () => {
  it("changes the level, fades and words, and null or blank clears a credit", () => {
    const before = withMusic({ artist: "Yellowbase", license: "Epidemic" });
    const next = run(before, {
      op: "music",
      gain: 0.6,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 2,
      label: "Derail (radio edit)",
      artist: null,
      license: " ",
    });
    expect(next.music).toEqual(
      music({
        gain: 0.6,
        fadeInSeconds: 0.5,
        fadeOutSeconds: 2,
        label: "Derail (radio edit)",
      })
    );
  });

  it("sets the grid first, so bars in the same edit count on it", () => {
    const before = withMusic({
      startSeconds: 2,
      sourceInSeconds: 5,
      sourceOutSeconds: 35,
    });
    const next = run(before, {
      op: "music",
      bpm: 120,
      downbeatSeconds: 5.25,
      sourceInSeconds: { bar: 2 },
      sourceOutSeconds: { bar: 10 },
    });
    expect(next.music?.grid).toEqual(GRID);
    expect(next.music?.sourceInSeconds).toBeCloseTo(7.25, 9);
    expect(next.music?.sourceOutSeconds).toBeCloseTo(23.25, 9);
  });

  it("reads a start bar on the post's clock", () => {
    const before = withMusic({
      startSeconds: 2,
      sourceInSeconds: 5,
      sourceOutSeconds: 35,
      grid: GRID,
    });
    // Bar 3 sounds at the post's 2.25 + 2 * 2 s.
    const next = run(before, { op: "music", startSeconds: { bar: 3 } });
    expect(next.music?.startSeconds).toBeCloseTo(6.25, 9);
  });

  it("drops the grid for bpm null, after which no bar can be named", () => {
    const next = run(withMusic({ grid: GRID }), { op: "music", bpm: null });
    expect(next.music).not.toHaveProperty("grid");
    expect(() =>
      run(next, { op: "music", sourceInSeconds: { bar: 2 } })
    ).toThrow(NO_GRID_MESSAGE);
  });

  it("refuses unknown settings, wrong values and a downbeat with no tempo", () => {
    const before = withMusic();
    const bad = (op: Record<string, unknown>) => () =>
      run(before, { op: "music", ...op } as unknown as PostProjectOp);
    expect(bad({ gian: 0.5 })).toThrow(
      'Edit 1 (music): Unknown music setting "gian".'
    );
    expect(bad({ gain: "loud" })).toThrow("gain must be a number.");
    expect(bad({ artist: 7 })).toThrow(
      "artist must be text, or null to remove it."
    );
    expect(bad({ bpm: "fast" })).toThrow(
      "bpm must be a number, or null to remove the beat grid."
    );
    expect(bad({ downbeatSeconds: 0.4 })).toThrow(
      "A downbeat and beats per bar need a tempo."
    );
    expect(bad({ startSeconds: "soon" })).toThrow(
      "startSeconds must be a number of seconds or a bar like @9 or @9.3."
    );
  });

  it("says how to add music when the post has none", () => {
    const ops: PostProjectOp[] = [
      { op: "music", gain: 1 },
      { op: "remove-music" },
      { op: "sync-to-music", item: "v1", offsetSeconds: 0 },
    ];
    for (const op of ops)
      expect(() => run(project([video("v1")]), op)).toThrow(
        "This post has no music. Add it with: add-music <file>."
      );
  });
});

describe("remove-music", () => {
  it("takes the music off the post", () => {
    expect(run(withMusic(), { op: "remove-music" })).not.toHaveProperty(
      "music"
    );
  });
});

describe("sync-to-music", () => {
  it("starts the clip where its take meets the music", () => {
    // The camera started 2.5 s before the music: the music's 0 s is the take's 2.5 s.
    const before = withMusic({}, [video("v1", { sourceIn: 0, sourceOut: 10 })]);
    const clip = firstClip(
      run(before, { op: "sync-to-music", item: "v1", offsetSeconds: -2.5 })
    );
    expect([clip.sourceIn, clip.sourceOut, clip.start, clip.duration]).toEqual([
      2.5, 12.5, 0, 10,
    ]);
  });

  it("counts the music's own trim and place", () => {
    // The music plays its 10 s at the post's 4 s, and the clip starts at 0 s.
    const before = withMusic({ startSeconds: 4, sourceInSeconds: 10 }, [
      video("v1", { sourceIn: 6, sourceOut: 16 }),
    ]);
    const clip = firstClip(
      run(before, { op: "sync-to-music", item: "v1", offsetSeconds: 3 })
    );
    // At the post's 4 s the music is at 10 s and the take at 7 s: 3 s apart.
    expect([clip.sourceIn, clip.sourceOut]).toEqual([3, 13]);
  });

  it("refuses a clip that cannot stay in time", () => {
    const before = withMusic({}, [
      video("v1", { sourceIn: 0, sourceOut: 10 }),
      video("v2", { takeId: "b", speed: 2 }),
      card("c1"),
    ]);
    const sync = (item: string, offsetSeconds: number) => () =>
      run(before, { op: "sync-to-music", item, offsetSeconds });
    expect(sync("v1", 2.5)).toThrow(
      "this clip would start 2.5 s before its take does"
    );
    // The take is 20 s long; in time, the clip would play its 12 s to 22 s.
    expect(sync("v1", -12)).toThrow(
      "this clip would run 2 s past the end of its take"
    );
    expect(sync("v2", 0)).toThrow("Only a clip at normal speed");
    expect(sync("c1", 0)).toThrow('"c1" is not a video clip.');
    expect(sync("nope", 0)).toThrow('No item "nope" in this post.');
  });
});

describe("times named as bars", () => {
  const before = withMusic(
    { startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35, grid: GRID },
    [video("v1", { sourceOut: 20 })]
  );

  it("places titles at a bar", () => {
    const next = run(before, { op: "add-titles", at: { bar: 5 } });
    const titles = next.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "titles");
    // 2.25 + 4 bars * 2 s.
    expect(titles?.start).toBeCloseTo(10.25, 9);
  });

  it("trims a clip to a bar and beat, and to plain seconds as before", () => {
    const toBeat = run(before, {
      op: "trim",
      item: "v1",
      edge: "end",
      seconds: { bar: 3, beat: 3 },
    });
    // 2.25 + (2 * 4 + 2) beats * 0.5 s.
    expect(firstClip(toBeat).duration).toBeCloseTo(7.25, 9);
    const toSeconds = run(before, {
      op: "trim",
      item: "v1",
      edge: "end",
      seconds: 6,
    });
    expect(firstClip(toSeconds).duration).toBeCloseTo(6, 9);
  });
});

describe("the editor bridge", () => {
  it("lets an edit add music, which is not one of the locked parts", () => {
    const before = project([video("v1")]);
    const after = run(before, {
      op: "add-music",
      url: URL,
      durationSeconds: 90,
    });
    expect(bridgeLockedChange(before, after)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-ops-music.test.ts`

Expected: FAIL, 17 failed. Each test fails on its first op with `Unknown edit "add-music".`, `Unknown edit "music".`, `Unknown edit "remove-music".` or `Unknown edit "sync-to-music".`; the tests that expect a refusal report that message in place of the one they wait for.

- [ ] **Step 3: Add the ops**

In `src/lib/shared/media-composition/domain/post-project-ops.ts`:

**Edit 1.** Import `findItem` for the sync edit. Find:

```ts
  POST_CANVAS_RATIOS,
```

Replace it with:

```ts
  POST_CANVAS_RATIOS,
  findItem,
```

**Edit 2.** Import the bar arithmetic and the music edits. Find:

```ts
} from "$lib/shared/media-composition/domain/tunnel-hook";
```

Replace it with:

```ts
} from "$lib/shared/media-composition/domain/tunnel-hook";
import {
  resolvePostTime,
  resolveTrackTime,
  type PostTimeRef,
} from "$lib/shared/media-composition/domain/music-grid";
import {
  removeMusic,
  setMusic,
  syncedSourceIn,
  updateMusic,
  type MusicPatch,
} from "$lib/shared/media-composition/domain/post-music-edits";
```

**Edit 3.** Add the music's error message, the settings a `music` op may change, and its patch type. Find:

```ts
type Speed = NonNullable<TunnelHook["speed"]>;
```

Replace it with:

```ts
type Speed = NonNullable<TunnelHook["speed"]>;

/** What every music edit says when the post has none. */
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";

/** The settings a `music` edit may change. */
const MUSIC_OP_KEYS = [
  "startSeconds",
  "sourceInSeconds",
  "sourceOutSeconds",
  "gain",
  "fadeInSeconds",
  "fadeOutSeconds",
  "label",
  "artist",
  "license",
  "bpm",
  "downbeatSeconds",
  "beatsPerBar",
] as const;

/**
 * A `music` edit: the music's own patch, except that its three times may also
 * name a bar. `startSeconds` is on the post's clock; `sourceInSeconds` and
 * `sourceOutSeconds` are in the music file's own seconds.
 */
export type MusicOpPatch = Omit<
  MusicPatch,
  "startSeconds" | "sourceInSeconds" | "sourceOutSeconds"
> & {
  startSeconds?: PostTimeRef;
  sourceInSeconds?: PostTimeRef;
  sourceOutSeconds?: PostTimeRef;
};
```

**Edit 4.** The titles' time may name a bar. Find:

```ts
  | { op: "add-titles"; spoken?: string; at?: number }
```

Replace it with:

```ts
  | { op: "add-titles"; spoken?: string; at?: PostTimeRef }
```

**Edit 5.** So may a trim's. Find:

```ts
  | { op: "trim"; item: string; edge: "start" | "end"; seconds: number }
```

Replace it with:

```ts
  | { op: "trim"; item: string; edge: "start" | "end"; seconds: PostTimeRef }
```

**Edit 6.** Add the four music ops to the union. Find:

```ts
  | { op: "remove-take"; take: string };
```

Replace it with:

```ts
  | { op: "remove-take"; take: string }
  | {
      op: "add-music";
      /** A feature video media URL, as featureVideoMediaUrl makes it. */
      url: string;
      durationSeconds: number;
      label?: string;
      artist?: string;
      license?: string;
    }
  | ({ op: "music" } & MusicOpPatch)
  | { op: "remove-music" }
  | {
      op: "sync-to-music";
      item: string;
      /** The music's own time minus the take's own time at one moment, as align-take reports it. */
      offsetSeconds: number;
    };
```

**Edit 7.** Add the helpers the music ops use, after `mediaLabel`. Find:

```ts
function applyOp(
```

Replace it with:

```ts
/** Slack for sums of seconds that should meet exactly. */
const SYNC_SLACK = 1e-6;

function secondsText(value: number): string {
  return `${Math.round(value * 1000) / 1000} s`;
}

/** Refuses a `music` edit's unknown settings and wrong kinds of value. */
function checkedMusicOp(op: { op: "music" } & MusicOpPatch): MusicOpPatch {
  const { op: _op, ...patch } = op;
  for (const [key, value] of Object.entries(patch)) {
    if (!(MUSIC_OP_KEYS as readonly string[]).includes(key))
      throw new Error(
        `Unknown music setting "${key}". Use ${MUSIC_OP_KEYS.join(", ")}.`
      );
    if (value === undefined) continue;
    switch (key) {
      case "startSeconds":
      case "sourceInSeconds":
      case "sourceOutSeconds":
        // These may name a bar; they are checked where they are read.
        break;
      case "label":
        if (typeof value !== "string") throw new Error("label must be text.");
        break;
      case "artist":
      case "license":
        if (value !== null && typeof value !== "string")
          throw new Error(`${key} must be text, or null to remove it.`);
        break;
      case "bpm":
        if (
          value !== null &&
          (typeof value !== "number" || !Number.isFinite(value))
        )
          throw new Error(
            "bpm must be a number, or null to remove the beat grid."
          );
        break;
      default:
        if (typeof value !== "number" || !Number.isFinite(value))
          throw new Error(`${key} must be a number.`);
    }
  }
  return patch;
}

function applyOp(
```

**Edit 8.** Resolve the titles' time. Find:

```ts
        ...(op.at !== undefined ? { at: op.at } : {}),
```

Replace it with:

```ts
        ...(op.at !== undefined
          ? { at: resolvePostTime(op.at, project.music, "at") }
          : {}),
```

**Edit 9.** Resolve the trim's time. Find:

```ts
        op.seconds,
```

Replace it with:

```ts
        resolvePostTime(op.seconds, project.music, "seconds"),
```

**Edit 10.** Add the music ops' cases before `default`. Find:

```ts
    default:
      throw new Error(`Unknown edit "${(op as { op?: unknown }).op}".`);
```

Replace it with:

```ts
    case "add-music": {
      if (!isFeatureVideoMediaUrl(op.url))
        throw new Error(
          "Music's url must be a feature video media url (/api/dev/feature-videos/<slug>/media/...)."
        );
      if (
        typeof op.durationSeconds !== "number" ||
        !Number.isFinite(op.durationSeconds) ||
        op.durationSeconds <= 0
      )
        throw new Error("durationSeconds must be a positive number.");
      const label = typeof op.label === "string" ? op.label.trim() : "";
      const same = project.music?.url === op.url ? project.music : undefined;
      return setMusic(
        project,
        {
          url: op.url,
          durationSeconds: op.durationSeconds,
          label: label || same?.label || mediaLabel(op.url),
          ...(op.artist !== undefined ? { artist: op.artist } : {}),
          ...(op.license !== undefined ? { license: op.license } : {}),
        },
        ctx
      );
    }
    case "music": {
      if (!project.music) throw new Error(NO_MUSIC);
      const {
        startSeconds,
        sourceInSeconds,
        sourceOutSeconds,
        bpm,
        downbeatSeconds,
        beatsPerBar,
        ...rest
      } = checkedMusicOp(op);
      if (
        (downbeatSeconds !== undefined || beatsPerBar !== undefined) &&
        !project.music.grid &&
        (bpm === undefined || bpm === null)
      )
        throw new Error(
          "A downbeat and beats per bar need a tempo. Add bpm to the same edit."
        );
      // The grid changes first, so a bar named in the same edit counts on it.
      const regridded = updateMusic(
        project,
        { bpm, downbeatSeconds, beatsPerBar },
        ctx
      );
      const music = regridded.music!;
      return updateMusic(
        regridded,
        {
          ...rest,
          ...(startSeconds !== undefined
            ? {
                startSeconds: resolvePostTime(
                  startSeconds,
                  music,
                  "startSeconds"
                ),
              }
            : {}),
          ...(sourceInSeconds !== undefined
            ? {
                sourceInSeconds: resolveTrackTime(
                  sourceInSeconds,
                  music.grid,
                  "sourceInSeconds"
                ),
              }
            : {}),
          ...(sourceOutSeconds !== undefined
            ? {
                sourceOutSeconds: resolveTrackTime(
                  sourceOutSeconds,
                  music.grid,
                  "sourceOutSeconds"
                ),
              }
            : {}),
        },
        ctx
      );
    }
    case "remove-music":
      if (!project.music) throw new Error(NO_MUSIC);
      return removeMusic(project, ctx);
    case "sync-to-music": {
      const music = project.music;
      if (!music) throw new Error(NO_MUSIC);
      if (
        typeof op.offsetSeconds !== "number" ||
        !Number.isFinite(op.offsetSeconds)
      )
        throw new Error("offsetSeconds must be a number.");
      const clip = findItem(project, op.item)?.item;
      if (!clip) throw new Error(`No item "${op.item}" in this post.`);
      if (clip.kind !== "video")
        throw new Error(`"${op.item}" is not a video clip.`);
      if (Math.abs(clip.speed - 1) > 1e-9)
        throw new Error(
          "Only a clip at normal speed can play in time with the music. Set its speed to 1 first."
        );
      const sourceIn = syncedSourceIn(music, clip, op.offsetSeconds);
      const sourceOut = sourceIn + (clip.sourceOut - clip.sourceIn);
      const takeSeconds =
        project.takes.find((take) => take.id === clip.takeId)
          ?.durationSeconds ?? Infinity;
      if (sourceIn < -SYNC_SLACK)
        throw new Error(
          `In time with the music, this clip would start ${secondsText(-sourceIn)} before its take does. Move the clip later, or trim its start.`
        );
      if (sourceOut > takeSeconds + SYNC_SLACK)
        throw new Error(
          `In time with the music, this clip would run ${secondsText(sourceOut - takeSeconds)} past the end of its take. Move the clip earlier, or trim its end.`
        );
      return updateItem(
        project,
        clip.id,
        {
          sourceIn: Math.max(0, sourceIn),
          sourceOut: Math.min(sourceOut, takeSeconds),
        },
        ctx
      );
    }
    default:
      throw new Error(`Unknown edit "${(op as { op?: unknown }).op}".`);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-ops-music.test.ts tests/unit/media-composition/post-project-ops.test.ts tests/unit/media-composition/feature-video-ops.test.ts`

Expected: PASS. The new file has 17 tests; `post-project-ops.test.ts` and plan 1's `feature-video-ops.test.ts` pass unchanged.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-music.test.ts
git add src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-music.test.ts
git commit -m "Named edits for the music, and bar times in titles and trims

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-music.test.ts
```

---

### Task 6: Move the tempo finder to shared/audio for its second user

The Music panel's Suggest BPM button uses Compose's tempo finder, `bpm-analyzer.ts`. A shared component must not import from a feature folder, so the file moves, unchanged, to `src/lib/shared/audio/`, and its three importers in Compose follow it. Its tempo detection needs a real `AudioContext`, which jsdom lacks; the test covers the beat spacing, which a moved file with a wrong import would fail to load.

**Files:**
- Move: `src/lib/features/compose/compose/phases/audio/bpm-analyzer.ts` to `src/lib/shared/audio/bpm-analyzer.ts`
- Modify: `src/lib/features/compose/timeline/components/SnapGuides.svelte` (one import)
- Modify: `src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte` (one import and one dynamic import)
- Modify: `src/lib/features/compose/timeline/services/snap-service.ts` (one import)
- Test: `tests/unit/shared/audio/bpm-analyzer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shared/audio/bpm-analyzer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";

/**
 * The analyzer moved from Compose to `shared/audio` for its second user, the
 * Post Studio music panel. Its tempo detection needs a real AudioContext;
 * the beat spacing does not.
 */
describe("generateStepTimestamps", () => {
  it("spaces beats 60 / bpm apart, from 0 through the end", () => {
    expect(generateStepTimestamps(120, 2)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("starts at the offset", () => {
    expect(generateStepTimestamps(120, 2, 0.25)).toEqual([
      0.25, 0.75, 1.25, 1.75,
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/shared/audio/bpm-analyzer.test.ts`

Expected: FAIL, with `Failed to resolve import "$lib/shared/audio/bpm-analyzer"`.

- [ ] **Step 3: Move the file**

```bash
git mv src/lib/features/compose/compose/phases/audio/bpm-analyzer.ts src/lib/shared/audio/bpm-analyzer.ts
```

Do not change its contents.

- [ ] **Step 4: Point the three importers at the new place**

In `src/lib/features/compose/timeline/components/SnapGuides.svelte`:

**Edit 1.** Find:

```svelte
  import { generateStepTimestamps } from "$lib/features/compose/compose/phases/audio/bpm-analyzer";
```

Replace it with:

```svelte
  import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";
```

In `src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte`:

**Edit 1.** The import at the top. Find:

```svelte
  import { generateStepTimestamps } from "$lib/features/compose/compose/phases/audio/bpm-analyzer";
```

Replace it with:

```svelte
  import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";
```

**Edit 2.** The dynamic import in the BPM button's handler. Find:

```svelte
        await import("$lib/features/compose/compose/phases/audio/bpm-analyzer");
```

Replace it with:

```svelte
        await import("$lib/shared/audio/bpm-analyzer");
```

In `src/lib/features/compose/timeline/services/snap-service.ts`:

**Edit 1.** Find:

```ts
import { generateStepTimestamps } from "$lib/features/compose/compose/phases/audio/bpm-analyzer";
```

Replace it with:

```ts
import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";
```

- [ ] **Step 5: Run the test, and check that nothing names the old place**

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/shared/audio/bpm-analyzer.test.ts
git grep -n "phases/audio/bpm-analyzer" -- src tests
```

Expected: PASS, 2 tests; the `git grep` prints nothing.

- [ ] **Step 6: Check that the two components still compile**

```bash
node - src/lib/features/compose/timeline/components/SnapGuides.svelte src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte <<'EOF'
const fs = require("node:fs");
const { compile } = require("svelte/compiler");
for (const file of process.argv.slice(2)) {
  compile(fs.readFileSync(file, "utf8"), { filename: file, generate: "client" });
  console.log(`compiled ${file}`);
}
EOF
```

Expected: one `compiled` line per file.

- [ ] **Step 7: Format and commit**

`SnapGuides.svelte` is one of the four files that skip prettier; check its diff instead.

```bash
npx prettier --write src/lib/shared/audio/bpm-analyzer.ts src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte src/lib/features/compose/timeline/services/snap-service.ts tests/unit/shared/audio/bpm-analyzer.test.ts
git diff src/lib/features/compose/timeline/components/SnapGuides.svelte
```

Expected: the diff shows only the import line changed.

```bash
git add src/lib/shared/audio/bpm-analyzer.ts src/lib/features/compose/timeline/components/SnapGuides.svelte src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte src/lib/features/compose/timeline/services/snap-service.ts tests/unit/shared/audio/bpm-analyzer.test.ts
git commit -m "Move the tempo finder to shared/audio for its second user

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/features/compose/compose/phases/audio/bpm-analyzer.ts src/lib/shared/audio/bpm-analyzer.ts src/lib/features/compose/timeline/components/SnapGuides.svelte src/lib/features/compose/timeline/components/TimelineAudioTrack.svelte src/lib/features/compose/timeline/services/snap-service.ts tests/unit/shared/audio/bpm-analyzer.test.ts
git show --stat --format= HEAD
```

Expected: `5 files changed`. The analyzer shows as a rename (its line has `=>`) with 0 lines changed, the three importers change one or two lines each, and the test is new.

---

### Task 7: Mix the music into the export; decode at the mix's rate

The export already mixes the takes' sound into one track (`planProjectAudio`, then `buildMixedAudioTrack`). The music becomes one more segment in that mix, planned apart by `planMusicAudio`: cut where the post ends, at its level, with its fades on the mix's ramps, and keyed by `musicAudioKey` so it never collides with a take's id. `segmentGainAt` gives a segment's level at any moment from the same envelope the mix writes; the preview uses it in Task 8.

Two fixes make the music land on the frame. Files used to decode at a fixed 44.1 kHz and were then resampled into the 48 kHz mix; now each file decodes at the mix's own rate, and a full-speed source at that rate is copied sample for sample. And a music file that cannot be read now fails the render, where a take that cannot be read still goes quiet: a promo without its music is not one to post.

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-audio-plan.ts` (imports, the segment's doc, three new functions after `planProjectAudio`, and `mixSegmentInto`)
- Modify: `src/lib/shared/media-composition/services/post-audio-track.ts` (the decode rate, `required` sources, `decodeSourceAudio`)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` (its import and the export's mix)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte` (a line under the Sound switch)
- Test: `tests/unit/media-composition/post-audio-plan-music.test.ts`, and two more tests in `tests/unit/media-composition/post-audio-track.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/post-audio-plan-music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  mixPostAudio,
  musicAudioKey,
  planMusicAudio,
  segmentGainAt,
} from "$lib/shared/media-composition/domain/post-audio-plan";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: "/api/dev/feature-videos/promo/media/music/derail.wav",
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

describe("planMusicAudio", () => {
  const placed = music({
    startSeconds: 2,
    sourceInSeconds: 5,
    sourceOutSeconds: 35,
    gain: 0.8,
    fadeInSeconds: 1,
    fadeOutSeconds: 2,
  });

  it("plans one segment with the music's level and fades", () => {
    expect(planMusicAudio(placed, 60)).toEqual([
      {
        takeId: "music:music-1",
        postStartSeconds: 2,
        sourceInSeconds: 5,
        durationSeconds: 30,
        gain: 0.8,
        crossfadeInSeconds: 1,
        crossfadeOutSeconds: 2,
      },
    ]);
  });

  it("cuts the music where the post ends", () => {
    const [segment] = planMusicAudio(placed, 20);
    expect(segment!.durationSeconds).toBe(18);
    expect(segment!.crossfadeOutSeconds).toBe(2);
  });

  it("leaves out fades it does not have", () => {
    const [segment] = planMusicAudio(music(), 60);
    expect(segment).not.toHaveProperty("crossfadeInSeconds");
    expect(segment).not.toHaveProperty("crossfadeOutSeconds");
  });

  it("plans nothing for no music, muted music, or music after the end", () => {
    expect(planMusicAudio(undefined, 60)).toEqual([]);
    expect(planMusicAudio(music({ gain: 0 }), 60)).toEqual([]);
    expect(planMusicAudio(music({ startSeconds: 60 }), 60)).toEqual([]);
  });

  it("keys the music apart from every take", () => {
    expect(musicAudioKey({ id: "music-1" })).toBe("music:music-1");
  });
});

describe("segmentGainAt", () => {
  const segment = {
    takeId: "a",
    postStartSeconds: 0,
    sourceInSeconds: 0,
    durationSeconds: 10,
    gain: 0.5,
    crossfadeInSeconds: 2,
  };

  it("follows the fade in and the short edge fade out", () => {
    expect(segmentGainAt(segment, 1)).toBeCloseTo(0.25, 9);
    expect(segmentGainAt(segment, 5)).toBeCloseTo(0.5, 9);
    expect(segmentGainAt(segment, 9.996)).toBeCloseTo(0.25, 6);
  });

  it("is silent outside the segment", () => {
    expect(segmentGainAt(segment, -0.1)).toBe(0);
    expect(segmentGainAt(segment, 10)).toBe(0);
  });
});

describe("mixing the music", () => {
  it("writes the level and fades the plan asks for", () => {
    const channel = new Float32Array(1000).fill(0.5);
    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "m",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
          gain: 0.8,
          crossfadeInSeconds: 0.1,
          crossfadeOutSeconds: 0.2,
        },
      ],
      sources: new Map([["m", { sampleRate: 1000, channels: [channel] }]]),
      sampleRate: 1000,
      durationSeconds: 1,
    });
    const at = (i: number) => left![i]!;
    expect(at(0)).toBe(0);
    expect(at(50)).toBeCloseTo(0.2, 6);
    expect(at(100)).toBeCloseTo(0.4, 6);
    expect(at(500)).toBeCloseTo(0.4, 6);
    expect(at(800)).toBeCloseTo(0.4, 6);
    expect(at(900)).toBeCloseTo(0.2, 6);
    expect(at(999)).toBeCloseTo(0.002, 6);
  });

  it("copies a full-speed source sample for sample at the bed's rate", () => {
    // A source that flips between 1 and -1 every sample: read between its
    // samples, every one would average to 0.
    const channel = Float32Array.from({ length: 1024 }, (_, i) =>
      i % 2 ? -1 : 1
    );
    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "a",
          postStartSeconds: 0,
          sourceInSeconds: 0.5 / 1024,
          durationSeconds: 0.25,
        },
      ],
      sources: new Map([["a", { sampleRate: 1024, channels: [channel] }]]),
      sampleRate: 1024,
      durationSeconds: 0.25,
      fadeSeconds: 0,
    });
    expect(Array.from(left!, Math.abs)).toEqual(new Array(256).fill(1));
  });
});
```

Then, in `tests/unit/media-composition/post-audio-track.test.ts`:

**Edit 1.** The fake decoder records each context's rate, returns samples at that rate, and can refuse a file. Find:

```ts
// decodeAudioData is the browser's job. Every file decodes to three seconds
// of a steady 0.5, so a segment that received its take's sound is never silent.
class FakeOfflineAudioContext {
  async decodeAudioData(_buffer: ArrayBuffer) {
    const samples = new Float32Array(SAMPLE_RATE * 3).fill(0.5);
    return {
      sampleRate: SAMPLE_RATE,
```

Replace it with:

```ts
/** The rate of every decoding context made, in order. */
let contextRates: number[] = [];
/** Whether decodeAudioData refuses the next files, as it does a broken one. */
let unreadable = false;

// decodeAudioData is the browser's job. Every file decodes to three seconds
// of a steady 0.5, so a segment that received its take's sound is never
// silent. Like the browser's, it hands back samples at its context's rate.
class FakeOfflineAudioContext {
  constructor(
    _channels: number,
    _length: number,
    readonly sampleRate: number
  ) {
    contextRates.push(sampleRate);
  }

  async decodeAudioData(_buffer: ArrayBuffer) {
    if (unreadable) throw new DOMException("Unable to decode", "EncodingError");
    const samples = new Float32Array(this.sampleRate * 3).fill(0.5);
    return {
      sampleRate: this.sampleRate,
```

**Edit 2.** Reset both before each test. Find:

```ts
  beforeEach(() => {
```

Replace it with:

```ts
  beforeEach(() => {
    contextRates = [];
    unreadable = false;
```

**Edit 3.** Restore the console after each test. Find:

```ts
    vi.unstubAllGlobals();
```

Replace it with:

```ts
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
```

**Edit 4.** Two tests: files decode at the mix's rate, and a music file that cannot be read fails the render. Find:

```ts
  });
});
```

Replace it with:

```ts
  });

  it("decodes each file at the mix's own rate, so nothing is resampled twice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fullResponse())
    );
    await buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 1,
      takeUrls: new Map([["demo", "/word-videos/woods-full.mp4"]]),
      sampleRate: SAMPLE_RATE,
    });
    expect(contextRates).toEqual([SAMPLE_RATE]);
  });

  it("fails the render when the music cannot be read, where a take's sound goes quiet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fullResponse())
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    unreadable = true;
    const take = await buildMixedAudioTrack({
      segments: [
        {
          takeId: "demo",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
        },
      ],
      durationSeconds: 1,
      takeUrls: new Map([["demo", "/word-videos/woods-full.mp4"]]),
      sampleRate: SAMPLE_RATE,
    });
    expect(await wavSampleAt(take!, 0.5)).toBe(0);

    const music = "/api/dev/feature-videos/promo/media/music/derail.wav";
    await expect(
      buildMixedAudioTrack({
        segments: [
          {
            takeId: "music:music-1",
            postStartSeconds: 0,
            sourceInSeconds: 0,
            durationSeconds: 1,
          },
        ],
        durationSeconds: 1,
        takeUrls: new Map([["music:music-1", music]]),
        required: new Set(["music:music-1"]),
        sampleRate: SAMPLE_RATE,
      })
    ).rejects.toThrow(`Could not read the sound in ${music}`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-audio-plan-music.test.ts tests/unit/media-composition/post-audio-track.test.ts`

Expected: FAIL, `10 failed | 3 passed (13)`:
- seven `TypeError`s, because `planMusicAudio`, `musicAudioKey` and `segmentGainAt` are not functions yet;
- "copies a full-speed source sample for sample at the bed's rate" fails with `AssertionError: expected [ +0, +0, +0, +0, +0, +0, +0, …(249) ] to deeply equal [ Array(256) ]`;
- "decodes each file at the mix's own rate, so nothing is resampled twice" fails with `expected [ 44100 ] to deeply equal [ 8000 ]`;
- "fails the render when the music cannot be read, where a take's sound goes quiet" fails with `promise resolved "Blob{ …(1) }" instead of rejecting`.

- [ ] **Step 3: Plan the music's sound**

In `src/lib/shared/media-composition/domain/post-audio-plan.ts`:

**Edit 1.** Import the music's type. Find:

```ts
import type { CompiledPostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
```

Replace it with:

```ts
import type { CompiledPostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
```

**Edit 2.** In the segment's doc, `silent` now mutes only the takes, and `takeId` may name the music. Find:

```ts
 * whole post - Austen adds music in the app he posts to instead.
 */
export interface PostAudioSegment {
```

Replace it with:

```ts
 * takes. A feature video's music is planned apart, by `planMusicAudio`, and
 * plays either way.
 */
export interface PostAudioSegment {
  /** The source this segment reads: a take's id, or `musicAudioKey` for the music. */
```

**Edit 3.** After `planProjectAudio`, add the music's key, its one segment, and `segmentGainAt`, the level the preview plays a segment at. Find:

```ts
}

// ---------------------------------------------------------------------------
// Mixing
```

Replace it with:

```ts
}

/** The music's key among a mix's sources, apart from every take id. */
export function musicAudioKey(music: Pick<PostMusic, "id">): string {
  return `music:${music.id}`;
}

/**
 * The music's one segment, cut where the post ends; its fades ride on the
 * crossfade ramps. Kept apart from `planProjectAudio`, whose segments the
 * preview matches one for one with the compiled video segments.
 */
export function planMusicAudio(
  music: PostMusic | undefined,
  postDurationSeconds: number
): PostAudioSegment[] {
  if (!music || music.gain <= 0) return [];
  const durationSeconds = Math.min(
    music.sourceOutSeconds - music.sourceInSeconds,
    postDurationSeconds - music.startSeconds
  );
  if (durationSeconds <= 0) return [];
  const fadeIn = Math.min(music.fadeInSeconds, durationSeconds);
  const fadeOut = Math.min(music.fadeOutSeconds, durationSeconds);
  return [
    {
      takeId: musicAudioKey(music),
      postStartSeconds: music.startSeconds,
      sourceInSeconds: music.sourceInSeconds,
      durationSeconds,
      gain: music.gain,
      ...(fadeIn > 0 ? { crossfadeInSeconds: fadeIn } : {}),
      ...(fadeOut > 0 ? { crossfadeOutSeconds: fadeOut } : {}),
    },
  ];
}

/**
 * A segment's level `elapsedSeconds` into it: its gain under its fades, the
 * same envelope `mixPostAudio` writes. A side without a crossfade gets the
 * short edge fade. Zero outside the segment.
 */
export function segmentGainAt(
  segment: PostAudioSegment,
  elapsedSeconds: number,
  edgeFadeSeconds = DEFAULT_FADE_SECONDS
): number {
  if (elapsedSeconds < 0 || elapsedSeconds >= segment.durationSeconds) return 0;
  const fadeIn = segment.crossfadeInSeconds ?? edgeFadeSeconds;
  const fadeOut = segment.crossfadeOutSeconds ?? edgeFadeSeconds;
  let envelope = 1;
  if (fadeIn > 0) envelope = Math.min(envelope, elapsedSeconds / fadeIn);
  if (fadeOut > 0)
    envelope = Math.min(
      envelope,
      (segment.durationSeconds - elapsedSeconds) / fadeOut
    );
  return Math.max(0, envelope) * (segment.gain ?? 1);
}

// ---------------------------------------------------------------------------
// Mixing
```

**Edit 4.** In `mixSegmentInto`, see when a source can be read sample for sample. Find:

```ts
    (segment.crossfadeOutSeconds ?? 0) * outSampleRate
  );
```

Replace it with:

```ts
    (segment.crossfadeOutSeconds ?? 0) * outSampleRate
  );
  // A full-speed source at the bed's own rate is copied sample for sample
  // from its nearest whole sample: reading between samples would soften
  // every one of them, which music hears as dull highs.
  const wholeSamples = rate === 1 && source.sampleRate === outSampleRate;
  const firstSample = Math.round(segment.sourceInSeconds * source.sampleRate);
```

**Edit 5.** Read it that way when it can. Find:

```ts
    const sourceSeconds = segment.sourceInSeconds + (i / outSampleRate) * rate;
    const sourcePosition = sourceSeconds * source.sampleRate;
```

Replace it with:

```ts
    const sourcePosition = wholeSamples
      ? firstSample + i
      : (segment.sourceInSeconds + (i / outSampleRate) * rate) *
        source.sampleRate;
```

- [ ] **Step 4: Decode at the mix's rate, and require the music**

In `src/lib/shared/media-composition/services/post-audio-track.ts`:

**Edit 1.** Drop the fixed decode rate; files now decode at the mix's rate. Find:

```ts
/** Any valid rate works - see the comment on its one use in decodeTakeAudio. */
const DECODE_CONTEXT_SAMPLE_RATE = 44_100;
```

Replace it with:

```ts

```

**Edit 2.** The URLs may include the music's, and `required` names the sources the render cannot go without. Find:

```ts
  durationSeconds: number;
  /** Fetchable URL for a take's own media, keyed by `PostTake.id`. A take
   *  missing here is treated the same as one that fails to decode: silent,
   *  not a failure. */
  takeUrls: ReadonlyMap<string, string>;
```

Replace it with:

```ts
  durationSeconds: number;
  /** Fetchable URL for each source the segments read, keyed by their
   *  `takeId`: a take's own media by `PostTake.id`, the music by
   *  `musicAudioKey`. A take missing here is treated the same as one that
   *  fails to decode: silent, not a failure. */
  takeUrls: ReadonlyMap<string, string>;
  /** Keys of `takeUrls` the post cannot go without, such as the music's.
   *  One that cannot be read fails the render instead of going silent. */
  required?: ReadonlySet<string>;
```

**Edit 3.** Find the required sources' URLs. Find:

```ts
  const decodes = new Map<string, Promise<PostAudioSource | null>>();
```

Replace it with:

```ts
  const decodes = new Map<string, Promise<PostAudioSource | null>>();
  const requiredUrls = new Set(
    [...(input.required ?? [])].flatMap((key) => {
      const url = input.takeUrls.get(key);
      return url ? [url] : [];
    })
  );
```

**Edit 4.** Decode each file with its options. Find:

```ts
        decodeTakeAudio(takeId, url, downloads.signal, progress.track(url))
```

Replace it with:

```ts
        decodeSourceAudio(takeId, url, {
          signal: downloads.signal,
          tracker: progress.track(url),
          sampleRate,
          required: requiredUrls.has(url),
        })
```

**Edit 5.** `decodeTakeAudio` becomes `decodeSourceAudio`, which also takes the mix's rate and whether the render needs the file. Find:

```ts
/** Fetches and decodes one take's audio. Failure - a missing file, a codec
 *  the browser can't decode, a network error - is swallowed and logged: the
 *  mix simply plays that segment's span as silence rather than failing the
 *  whole export over one bad take. A stalled download says nothing about the
 *  take, so it fails the render where it can be seen instead. */
async function decodeTakeAudio(
  takeId: string,
  url: string,
  signal: AbortSignal,
  tracker: DownloadTracker
```

Replace it with:

```ts
interface DecodeOptions {
  signal: AbortSignal;
  tracker: DownloadTracker;
  /** The mix's rate; the browser resamples the file to it. */
  sampleRate: number;
  /** The render needs this file: failing to read it fails the render. */
  required: boolean;
}

/** Fetches and decodes one source's audio: a take's, or the music's.
 *  Failure - a missing file, a codec the browser can't decode, a network
 *  error - is swallowed and logged for a take: the mix simply plays that
 *  segment's span as silence rather than failing the whole export over one
 *  bad take. A required source fails the render instead, and so does a
 *  stalled download, which says nothing about the take. */
async function decodeSourceAudio(
  key: string,
  url: string,
  { signal, tracker, sampleRate, required }: DecodeOptions
```

**Edit 6.** Decode at the mix's rate, so the mix reads the samples one for one. Find:

```ts
    // rendered - decodeAudioData returns the source's own native sample rate
    // and channel count regardless of what the context was built with.
    const context = new OfflineAudioContext(1, 1, DECODE_CONTEXT_SAMPLE_RATE);
```

Replace it with:

```ts
    // rendered. decodeAudioData resamples the file to the context's rate, so
    // the context runs at the mix's rate: the mix then reads the samples one
    // for one instead of resampling them a second time.
    const context = new OfflineAudioContext(1, 1, sampleRate);
```

**Edit 7.** A required file that cannot be read fails the render; a take's still goes quiet. Find:

```ts
    console.warn(
      `[post-audio-track] Take "${takeId}" audio could not be decoded; treating it as silent.`,
```

Replace it with:

```ts
    if (required)
      throw new Error(
        `Could not read the sound in ${url}, which this post needs.`,
        { cause: error }
      );
    console.warn(
      `[post-audio-track] Take "${key}" audio could not be decoded; treating it as silent.`,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-audio-plan-music.test.ts tests/unit/media-composition/post-audio-track.test.ts tests/unit/media-composition/post-audio-plan.test.ts`

Expected: PASS. `post-audio-plan-music.test.ts` has 9 tests and `post-audio-track.test.ts` 4; the existing `post-audio-plan.test.ts` passes unchanged.

- [ ] **Step 6: Mix the music into the export**

In `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`:

**Edit 1.** Import the music's audio plan. Find:

```svelte
  import { planProjectAudio } from "$lib/shared/media-composition/domain/post-audio-plan";
```

Replace it with:

```svelte
  import {
    musicAudioKey,
    planMusicAudio,
    planProjectAudio,
  } from "$lib/shared/media-composition/domain/post-audio-plan";
```

**Edit 2.** In the export, mix the music with the takes. The render fails if the music file cannot be read, instead of exporting without it. Find:

```svelte
          videoSources.set(takeRole(take.id), url);
        }
      }
      const audio = await buildMixedAudioTrack({
        segments: planProjectAudio(compiled, editor.project.audio),
        durationSeconds: compiled.durationSeconds,
        takeUrls,
```

Replace it with:

```svelte
          videoSources.set(takeRole(take.id), url);
        }
      }
      const music = editor.project.music;
      if (music) takeUrls.set(musicAudioKey(music), music.url);
      const audio = await buildMixedAudioTrack({
        segments: [
          ...planProjectAudio(compiled, editor.project.audio),
          ...planMusicAudio(music, compiled.durationSeconds),
        ],
        durationSeconds: compiled.durationSeconds,
        takeUrls,
        ...(music ? { required: new Set([musicAudioKey(music)]) } : {}),
```

In `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte`:

**Edit 1.** Under the Sound switch, say that the music is not muted with the takes. Find:

```svelte
      onchange={editor.setAudio}
      color="accent"
      ariaLabel={t("share_studio_sound")}
    />
```

Replace it with:

```svelte
      onchange={editor.setAudio}
      color="accent"
      ariaLabel={t("share_studio_sound")}
    />
    {#if editor.project.music}
      <p class="help">
        The music plays either way; this sets only the takes' sound.
      </p>
    {/if}
```

- [ ] **Step 7: Check that the two components still compile**

```bash
node - src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte <<'EOF'
const fs = require("node:fs");
const { compile } = require("svelte/compiler");
for (const file of process.argv.slice(2)) {
  compile(fs.readFileSync(file, "utf8"), { filename: file, generate: "client" });
  console.log(`compiled ${file}`);
}
EOF
```

Expected: one `compiled` line per file. Task 17 checks the types and plays a real export.

- [ ] **Step 8: Format and commit**

`PostExportPanel.svelte` is one of the four files that skip prettier; check its diff instead.

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-audio-plan.ts src/lib/shared/media-composition/services/post-audio-track.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-audio-plan-music.test.ts tests/unit/media-composition/post-audio-track.test.ts
git diff src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte
```

Expected: the diff shows only the five added lines of the `{#if editor.project.music}` block.

```bash
git add src/lib/shared/media-composition/domain/post-audio-plan.ts src/lib/shared/media-composition/services/post-audio-track.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte tests/unit/media-composition/post-audio-plan-music.test.ts tests/unit/media-composition/post-audio-track.test.ts
git commit -m "Mix the music into the export; decode at the mix's rate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/domain/post-audio-plan.ts src/lib/shared/media-composition/services/post-audio-track.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte tests/unit/media-composition/post-audio-plan-music.test.ts tests/unit/media-composition/post-audio-track.test.ts
```

---

### Task 8: Play the music in the editor's preview and keep the picture on it

The preview already keeps footage in step through a clock (`post-preview-clock.ts`): each frame it reads the playing media, lets audible footage set the pace, and moves strays back. The music joins that clock as one more source instead of copying the video controller's code. `music-preview-sync.ts` holds the rules: where the music element should be at a post second, whether the music sounds there, when the element must seek (on a jump, a pause, or a stray of more than 0.25 s), the music's entry in the clock's media (first, so the picture follows the beat), and the music's start and end, at which a clock step stops the way it does at a cut. `PostMusicPreview.svelte` is a hidden `<audio>` element that follows those rules and hands the canvas a controller, as a clip's footage does. The preview's fades now use the export's `segmentGainAt`, so the editor and the render fade alike.

**Files:**
- Create: `src/lib/shared/media-composition/services/music-preview-sync.ts`
- Create: `src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte` (imports, `previewGain`, the music's controller, `alignPlayback`, `playbackStep`, the wait for buffering media, and the markup)
- Test: `tests/unit/media-composition/music-preview-sync.test.ts`, `tests/unit/media-composition/post-music-preview.test.ts` with its harness `tests/unit/media-composition/music-preview-harness.svelte.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/music-preview-sync.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  MUSIC_DRIFT_SECONDS,
  musicClockBoundaries,
  musicClockMedia,
  musicPreviewTarget,
  musicSoundsAt,
  shouldSeekMusic,
} from "$lib/shared/media-composition/services/music-preview-sync";

// The file plays from its 5 s at the post's 2 s, through its 35 s.
const placed = { startSeconds: 2, sourceInSeconds: 5, sourceOutSeconds: 35 };

describe("musicPreviewTarget", () => {
  it("follows the post clock inside the music", () => {
    expect(musicPreviewTarget(placed, 2)).toEqual({ seconds: 5, inside: true });
    expect(musicPreviewTarget(placed, 10)).toEqual({
      seconds: 13,
      inside: true,
    });
  });

  it("waits at the trimmed edges outside it", () => {
    expect(musicPreviewTarget(placed, 0)).toEqual({
      seconds: 5,
      inside: false,
    });
    expect(musicPreviewTarget(placed, 32)).toEqual({
      seconds: 35,
      inside: false,
    });
  });
});

describe("musicSoundsAt", () => {
  // The music's planned stretch: the post's 2 s to 8 s.
  const segment = {
    takeId: "music:music-1",
    postStartSeconds: 2,
    sourceInSeconds: 5,
    durationSeconds: 6,
  };

  it("is true from the stretch's first instant up to its last", () => {
    expect(musicSoundsAt(segment, 1.99)).toBe(false);
    expect(musicSoundsAt(segment, 2)).toBe(true);
    expect(musicSoundsAt(segment, 7.99)).toBe(true);
    expect(musicSoundsAt(segment, 8)).toBe(false);
  });

  it("is false without a planned stretch", () => {
    expect(musicSoundsAt(null, 4)).toBe(false);
  });
});

describe("shouldSeekMusic", () => {
  const steady = {
    currentTime: 10,
    targetTime: 10.2,
    previousTargetTime: 10.18,
    playing: true,
    seeking: false,
  };

  it("lets playing music run a little ahead or behind", () => {
    expect(shouldSeekMusic(steady)).toBe(false);
    expect(
      shouldSeekMusic({
        ...steady,
        targetTime: 10 + MUSIC_DRIFT_SECONDS + 0.01,
      })
    ).toBe(true);
  });

  it("lands within a frame after a jump, a pause or the first check", () => {
    expect(shouldSeekMusic({ ...steady, previousTargetTime: 4 })).toBe(true);
    expect(shouldSeekMusic({ ...steady, jumped: true })).toBe(true);
    expect(shouldSeekMusic({ ...steady, playing: false })).toBe(true);
    expect(shouldSeekMusic({ ...steady, previousTargetTime: null })).toBe(true);
    expect(
      shouldSeekMusic({ ...steady, playing: false, targetTime: 10.02 })
    ).toBe(false);
  });

  it("never seeks while a seek is running", () => {
    expect(shouldSeekMusic({ ...steady, playing: false, seeking: true })).toBe(
      false
    );
  });
});

describe("the music in the preview clock", () => {
  // The music's planned stretch: the post's 2 s to 8 s.
  const segment = {
    takeId: "music:music-1",
    postStartSeconds: 2,
    sourceInSeconds: 5,
    durationSeconds: 6,
  };
  const state = { currentTime: 9.02, ready: true, ended: false };

  it("sets the clock from the music's own time while it sounds", () => {
    expect(musicClockMedia(placed, segment, 6, () => state)).toEqual({
      ...state,
      targetTime: 9,
      playbackRate: 1,
    });
  });

  it("is left out, unread, while the music is silent", () => {
    const read = vi.fn(() => state);
    expect(musicClockMedia(placed, segment, 1, read)).toBeNull();
    expect(musicClockMedia(placed, segment, 8, read)).toBeNull();
    expect(musicClockMedia(placed, null, 4, read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("stops a clock step at the music's first and last instants", () => {
    expect(musicClockBoundaries(segment)).toEqual([2, 8]);
    expect(musicClockBoundaries(null)).toEqual([]);
  });
});
```

Create the harness, `tests/unit/media-composition/music-preview-harness.svelte.ts`:

```ts
import { flushSync, mount } from "svelte";
import type { PreviewVideoController } from "$lib/shared/media-composition/services/post-preview-clock";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import PostMusicPreview from "$lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte";

/** Mounts the preview's music paused at 0 s in a 60 s post, recording every controller it registers. */
export function mountMusicPreview(target: HTMLElement, initial: PostMusic) {
  const controllers: Array<PreviewVideoController | null> = [];
  let music = $state.raw(initial);
  let postSeconds = $state(0);
  let playing = $state(false);
  const component = mount(PostMusicPreview, {
    target,
    props: {
      get music() {
        return music;
      },
      get postSeconds() {
        return postSeconds;
      },
      postDurationSeconds: 60,
      get playing() {
        return playing;
      },
      onController: (controller: PreviewVideoController | null) => {
        controllers.push(controller);
      },
    },
  });
  flushSync();
  return {
    component,
    controllers,
    get controller() {
      return controllers.at(-1) ?? null;
    },
    setMusic(next: PostMusic) {
      music = next;
      flushSync();
    },
    setPostSeconds(next: number) {
      postSeconds = next;
      flushSync();
    },
    setPlaying(next: boolean) {
      playing = next;
      flushSync();
    },
  };
}
```

Create `tests/unit/media-composition/post-music-preview.test.ts`:

```ts
/**
 * The preview's music element. The canvas reads its clock, aligns it after a
 * jump and holds it while footage buffers, as it does a clip's footage. It
 * must only sound while the post plays inside the music, follow the music's
 * fades, and stop when it leaves the page.
 */
import { unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountMusicPreview } from "./music-preview-harness.svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";

// The file plays from its 5 s at the post's 2 s, through its 35 s.
function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 2,
    sourceInSeconds: 5,
    sourceOutSeconds: 35,
    durationSeconds: 90,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

/** jsdom's media elements never load or play; this one does as it is told. */
function fakeMedia(element: HTMLMediaElement) {
  const media = {
    readyState: 0,
    paused: true,
    seeking: false,
    ended: false,
    currentTime: 0,
    volume: 1,
    muted: false,
    plays: 0,
  };
  Object.defineProperties(element, {
    readyState: { get: () => media.readyState, configurable: true },
    paused: { get: () => media.paused, configurable: true },
    seeking: { get: () => media.seeking, configurable: true },
    ended: { get: () => media.ended, configurable: true },
    currentTime: {
      get: () => media.currentTime,
      set: (seconds: number) => (media.currentTime = seconds),
      configurable: true,
    },
    volume: {
      get: () => media.volume,
      set: (level: number) => (media.volume = level),
      configurable: true,
    },
    muted: {
      get: () => media.muted,
      set: (muted: boolean) => (media.muted = muted),
      configurable: true,
    },
    play: {
      value: () => {
        media.plays += 1;
        media.paused = false;
        return Promise.resolve();
      },
      configurable: true,
    },
    pause: {
      value: () => {
        media.paused = true;
      },
      configurable: true,
    },
    load: { value: () => {}, configurable: true },
  });
  return media;
}

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let current: ReturnType<typeof mountMusicPreview> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (current) unmount(current.component);
  current = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function open(start: PostMusic = music()) {
  const target = document.createElement("div");
  document.body.append(target);
  current = mountMusicPreview(target, start);
  const element = target.querySelector("audio")!;
  return { preview: current, element, media: fakeMedia(element) };
}

describe("the preview's music", () => {
  it("loads the music file and hands the canvas a controller", () => {
    const { preview, element } = open();
    expect(element.getAttribute("src")).toBe(URL);
    expect(element.getAttribute("preload")).toBe("auto");
    expect(preview.controller).not.toBeNull();
  });

  it("is not ready until it has data, then reads at the playhead's time", () => {
    const { preview, media } = open();
    preview.setPostSeconds(10);
    expect(preview.controller!.read().ready).toBe(false);
    media.readyState = 4;
    expect(preview.controller!.read()).toEqual({
      currentTime: 13,
      ready: true,
      ended: false,
    });
  });

  it("sounds only while the post plays inside the music, and holds when told", async () => {
    const { preview, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    expect(media.paused).toBe(false);
    preview.controller!.hold(true);
    expect(media.paused).toBe(true);
    // The canvas holds or releases it on every frame, after the last play settles.
    await settled();
    preview.controller!.hold(false);
    expect(media.paused).toBe(false);
    // Before the music starts.
    preview.setPostSeconds(1);
    expect(media.paused).toBe(true);
    await settled();
    preview.setPostSeconds(10);
    expect(media.paused).toBe(false);
    preview.setPlaying(false);
    expect(media.paused).toBe(true);
  });

  it("lets playing music run on, and lands on the playhead after a jump", () => {
    const { preview, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    media.currentTime = 13.1;
    preview.setPostSeconds(10.016);
    expect(media.currentTime).toBe(13.1);
    preview.setPostSeconds(20);
    expect(media.currentTime).toBe(23);
  });

  it("follows the music's fades and stops at full volume", () => {
    const { preview, media } = open(music({ fadeInSeconds: 2, gain: 1.5 }));
    media.readyState = 4;
    preview.setPlaying(true);
    preview.setPostSeconds(3);
    expect(media.volume).toBeCloseTo(0.75, 9);
    expect(media.muted).toBe(false);
    preview.setPostSeconds(10);
    expect(media.volume).toBe(1);
    preview.setPlaying(false);
    expect(media.muted).toBe(true);
  });

  it("stops and lets go when it leaves the page", () => {
    const { preview, element, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    unmount(preview.component);
    current = null;
    expect(media.paused).toBe(true);
    expect(element.hasAttribute("src")).toBe(false);
    expect(preview.controllers.at(-1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/music-preview-sync.test.ts tests/unit/media-composition/post-music-preview.test.ts`

Expected: FAIL. `music-preview-sync.test.ts` cannot resolve `$lib/shared/media-composition/services/music-preview-sync`, and the harness cannot resolve `$lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte`.

- [ ] **Step 3: Create the sync rules**

Create `src/lib/shared/media-composition/services/music-preview-sync.ts`:

```ts
import { POST_FRAME_RATE } from "$lib/shared/media-composition/domain/post-project";
import type {
  PreviewClockMedia,
  PreviewVideoState,
} from "$lib/shared/media-composition/services/post-preview-clock";
import {
  musicSpan,
  trackSecondsAt,
  type MusicPlacement,
} from "$lib/shared/media-composition/domain/music-grid";
import type { PostAudioSegment } from "$lib/shared/media-composition/domain/post-audio-plan";

/**
 * Where the preview's music element should be. While the music sounds it sets
 * the preview clock, the way audible footage does, so the picture follows the
 * beat. These rules only decide when the element itself must seek.
 */

/** How far playing music may stray from its target before it is moved back. */
export const MUSIC_DRIFT_SECONDS = 0.25;
/** A target that moves further than this between two reads is a jump. */
const JUMP_SECONDS = 0.5;

export interface MusicPreviewTarget {
  /** The file's second for this post second, kept inside the trimmed span. */
  seconds: number;
  /** Whether the music sounds at this post second. */
  inside: boolean;
}

export function musicPreviewTarget(
  music: MusicPlacement,
  postSeconds: number
): MusicPreviewTarget {
  const { start, end } = musicSpan(music);
  return {
    seconds: Math.min(
      music.sourceOutSeconds,
      Math.max(music.sourceInSeconds, trackSecondsAt(music, postSeconds))
    ),
    inside: postSeconds >= start && postSeconds < end,
  };
}

/**
 * Whether the music sounds at this post second: inside its planned stretch,
 * which the post's end shortens and a level of 0 removes. The preview's
 * music element plays only then, and only then does it set the clock.
 */
export function musicSoundsAt(
  segment: PostAudioSegment | null,
  postSeconds: number
): boolean {
  return (
    segment !== null &&
    postSeconds >= segment.postStartSeconds &&
    postSeconds < segment.postStartSeconds + segment.durationSeconds
  );
}

export interface MusicSeekState {
  currentTime: number;
  targetTime: number;
  /** The target at the last check; null before the first one. */
  previousTargetTime: number | null;
  /** Playing and not held. */
  playing: boolean;
  seeking: boolean;
  /** Set when the caller knows the playhead jumped. */
  jumped?: boolean;
}

export function shouldSeekMusic(state: MusicSeekState): boolean {
  if (state.seeking) return false;
  const jumped =
    state.jumped === true ||
    state.previousTargetTime === null ||
    Math.abs(state.targetTime - state.previousTargetTime) > JUMP_SECONDS;
  const tolerance =
    state.playing && !jumped ? MUSIC_DRIFT_SECONDS : 1 / POST_FRAME_RATE;
  return Math.abs(state.currentTime - state.targetTime) > tolerance;
}

/**
 * The music's entry in the preview clock's media while it sounds. The canvas
 * puts it first, so the picture keeps to the beat and footage that strays is
 * moved back to it. Null while the music is silent here: then it neither sets
 * the clock nor holds it up, and `read` is not called.
 */
export function musicClockMedia(
  music: MusicPlacement,
  segment: PostAudioSegment | null,
  postSeconds: number,
  read: () => PreviewVideoState
): PreviewClockMedia | null {
  if (!musicSoundsAt(segment, postSeconds)) return null;
  return {
    ...read(),
    targetTime: musicPreviewTarget(music, postSeconds).seconds,
    playbackRate: 1,
  };
}

/**
 * Where the music starts and stops sounding. A clock step stops just past
 * each, as it does at a cut, so the music is waited for from its first
 * instant.
 */
export function musicClockBoundaries(
  segment: PostAudioSegment | null
): number[] {
  return segment
    ? [
        segment.postStartSeconds,
        segment.postStartSeconds + segment.durationSeconds,
      ]
    : [];
}
```

- [ ] **Step 4: Create the music's player**

Create `src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte`:

```svelte
<script lang="ts">
  import { untrack } from "svelte";
  import type { PreviewVideoController } from "$lib/shared/media-composition/services/post-preview-clock";
  import {
    planMusicAudio,
    segmentGainAt,
  } from "$lib/shared/media-composition/domain/post-audio-plan";
  import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
  import {
    musicPreviewTarget,
    musicSoundsAt,
    shouldSeekMusic,
  } from "$lib/shared/media-composition/services/music-preview-sync";

  /**
   * Plays the post's music under the preview. The canvas drives it the way
   * it drives a clip's footage: it reads the element's clock, which sets the
   * preview's pace while the music sounds, and holds it while footage
   * buffers. Levels above 100% are the export's; here the volume stops at 1.
   */
  interface Props {
    music: PostMusic;
    /** The playhead, in post seconds. */
    postSeconds: number;
    postDurationSeconds: number;
    playing: boolean;
    onController: (controller: PreviewVideoController | null) => void;
  }

  let {
    music,
    postSeconds,
    postDurationSeconds,
    playing,
    onController,
  }: Props = $props();

  let audio = $state<HTMLAudioElement | null>(null);
  let held = false;
  let playRequest: HTMLAudioElement | null = null;
  let previousTarget: number | null = null;

  const target = $derived(musicPreviewTarget(music, postSeconds));
  const segment = $derived(
    planMusicAudio(music, postDurationSeconds)[0] ?? null
  );
  const sounding = $derived(musicSoundsAt(segment, postSeconds));
  const volume = $derived(
    segment
      ? Math.min(
          1,
          segmentGainAt(segment, postSeconds - segment.postStartSeconds)
        )
      : 0
  );

  /** Moves the element to the playhead's time when it has strayed. */
  function sync(element: HTMLAudioElement, jumped = false): void {
    if (element.readyState < 1) return;
    const seconds = target.seconds;
    const seek = shouldSeekMusic({
      currentTime: element.currentTime,
      targetTime: seconds,
      previousTargetTime: previousTarget,
      playing: playing && !held,
      seeking: element.seeking,
      jumped,
    });
    previousTarget = seconds;
    if (seek) element.currentTime = seconds;
  }

  function startPlayback(element: HTMLAudioElement): void {
    if (
      !playing ||
      held ||
      !sounding ||
      !element.paused ||
      playRequest === element
    )
      return;
    playRequest = element;
    void element
      .play()
      .then(() => {
        if (!playing || held || !sounding) element.pause();
      })
      .catch(() => undefined)
      .finally(() => {
        if (playRequest === element) playRequest = null;
      });
  }

  $effect(() => {
    const element = audio;
    const register = onController;
    if (!element) return;
    register({
      read: () => {
        sync(element);
        return {
          currentTime: element.currentTime,
          ready: !element.seeking && element.readyState >= 2,
          ended: element.ended,
        };
      },
      align: () => sync(element, true),
      hold: (next) => {
        held = next;
        if (next) element.pause();
        else startPlayback(element);
      },
    });
    return () => register(null);
  });

  $effect(() => {
    const element = audio;
    if (!element) return;
    element.volume = volume;
    element.muted = !playing || volume === 0;
  });

  $effect(() => {
    const element = audio;
    // Tracked: the playhead's place in the music, and whether it should sound.
    target.seconds;
    const shouldPlay = playing && sounding;
    if (!element) return;
    untrack(() => {
      sync(element);
      if (shouldPlay) startPlayback(element);
      else if (!element.paused) element.pause();
    });
  });

  $effect(() => {
    const element = audio;
    if (!element) return;
    return () => {
      // A removed element keeps playing, and keeps its download open until
      // its source goes.
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  });
</script>

<audio bind:this={audio} src={music.url} preload="auto"></audio>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/music-preview-sync.test.ts tests/unit/media-composition/post-music-preview.test.ts tests/unit/media-composition/post-preview-clock.test.ts`

Expected: PASS. `music-preview-sync.test.ts` has 10 tests and `post-music-preview.test.ts` 6; the existing `post-preview-clock.test.ts` passes unchanged.

- [ ] **Step 6: Put the player in the canvas and the clock**

In `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`:

**Edit 1.** Import the music's audio plan, the shared gain curve and the clock helpers. Find:

```svelte
  import { planProjectAudio } from "$lib/shared/media-composition/domain/post-audio-plan";
```

Replace it with:

```svelte
  import {
    planMusicAudio,
    planProjectAudio,
    segmentGainAt,
  } from "$lib/shared/media-composition/domain/post-audio-plan";
  import {
    musicClockBoundaries,
    musicClockMedia,
  } from "$lib/shared/media-composition/services/music-preview-sync";
```

**Edit 2.** Import the music's player. Find:

```svelte
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
```

Replace it with:

```svelte
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
  import PostMusicPreview from "./PostMusicPreview.svelte";
```

**Edit 3.** In `previewGain`, use the export's own gain curve, so the preview and the export fade alike. Find:

```svelte
    const elapsed = editor.previewSeconds - segment.postStartSeconds;
    if (elapsed < 0 || elapsed >= segment.durationSeconds) return 0;
    const edgeFade = 0.008;
    let envelope = 1;
    const fadeIn = segment.crossfadeInSeconds ?? edgeFade;
    const fadeOut = segment.crossfadeOutSeconds ?? edgeFade;
    if (fadeIn > 0) envelope = Math.min(envelope, elapsed / fadeIn);
    if (fadeOut > 0)
      envelope = Math.min(
        envelope,
        (segment.durationSeconds - elapsed) / fadeOut
      );
    return Math.max(0, Math.min(1, envelope * (segment.gain ?? 1)));
```

Replace it with:

```svelte
    return Math.min(
      1,
      segmentGainAt(segment, editor.previewSeconds - segment.postStartSeconds)
    );
```

**Edit 4.** After `registerPlaybackVideo`, keep the music's stretch and its player. Find:

```svelte
    if (controller) playbackVideos.set(key, controller);
    else playbackVideos.delete(key);
  }
```

Replace it with:

```svelte
    if (controller) playbackVideos.set(key, controller);
    else playbackVideos.delete(key);
  }

  /** The music's one stretch under the post, as the export mixes it. */
  const musicSegment = $derived(
    planMusicAudio(editor.project.music, editor.durationSeconds)[0] ?? null
  );
  let musicController: PreviewVideoController | null = null;

  function registerMusic(controller: PreviewVideoController | null): void {
    musicController = controller;
  }
```

**Edit 5.** `alignPlayback` seeks the music too. Find:

```svelte
    for (const { controller } of requiredPlaybackVideos()) controller?.align();
```

Replace it with:

```svelte
    for (const { controller } of requiredPlaybackVideos()) controller?.align();
    musicController?.align();
```

**Edit 6.** In `playbackStep`, sounding music goes first in the clock's media, and its start and end stop a step the way a cut does. Find:

```svelte
      playbackRate: entry.clip.playbackRate ?? 1,
    }));
    let nextBoundary = Infinity;
```

Replace it with:

```svelte
      playbackRate: entry.clip.playbackRate ?? 1,
    }));
    // Sounding music sets the clock, so the picture keeps to the beat.
    const music = editor.project.music;
    const player = musicController;
    const musicMedia =
      music && player
        ? musicClockMedia(music, musicSegment, editor.previewSeconds, () =>
            player.read()
          )
        : null;
    if (musicMedia) media.unshift(musicMedia);
    let nextBoundary = Infinity;
    for (const seconds of musicClockBoundaries(musicSegment))
      if (seconds > editor.previewSeconds + 1e-7)
        nextBoundary = Math.min(nextBoundary, seconds);
```

**Edit 7.** The music waits with the footage. Find:

```svelte
      controller.hold(step.waiting || !requiredControllers.has(controller));
```

Replace it with:

```svelte
      controller.hold(step.waiting || !requiredControllers.has(controller));
    musicController?.hold(step.waiting);
```

**Edit 8.** Mount the music's player in the editor's preview, before the edit layer. Find:

```svelte
      <span>{t("post_editor_empty_preview")}</span>
    </div>
  {/if}

  {#if interactive}
```

Replace it with:

```svelte
      <span>{t("post_editor_empty_preview")}</span>
    </div>
  {/if}

  {#if interactive && editor.project.music}
    <PostMusicPreview
      music={editor.project.music}
      postSeconds={editor.previewSeconds}
      postDurationSeconds={editor.durationSeconds}
      playing={editor.isPlaying}
      onController={registerMusic}
    />
  {/if}

  {#if interactive}
```

- [ ] **Step 7: Check that the canvas still compiles**

```bash
node - src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte <<'EOF'
const fs = require("node:fs");
const { compile } = require("svelte/compiler");
for (const file of process.argv.slice(2)) {
  compile(fs.readFileSync(file, "utf8"), { filename: file, generate: "client" });
  console.log(`compiled ${file}`);
}
EOF
```

Expected: `compiled src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`. Task 17 plays the preview for 30 seconds and measures the drift.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/services/music-preview-sync.ts src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte tests/unit/media-composition/music-preview-sync.test.ts tests/unit/media-composition/music-preview-harness.svelte.ts tests/unit/media-composition/post-music-preview.test.ts
git add src/lib/shared/media-composition/services/music-preview-sync.ts src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte tests/unit/media-composition/music-preview-sync.test.ts tests/unit/media-composition/music-preview-harness.svelte.ts tests/unit/media-composition/post-music-preview.test.ts
git commit -m "Play the music in the editor's preview and keep the picture on it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/media-composition/services/music-preview-sync.ts src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte tests/unit/media-composition/music-preview-sync.test.ts tests/unit/media-composition/music-preview-harness.svelte.ts tests/unit/media-composition/post-music-preview.test.ts
```

---

### Task 9: Labelled marks on the time ruler

The ruler under the timeline's playhead is shared (`src/lib/shared/timeline/TimeRuler.svelte`). It gains an optional `marks` prop: labels at times the caller picks, laid out like its ticks. Task 12 passes the bar numbers; every other caller passes nothing and sees no change.

**Files:**
- Modify: `src/lib/shared/timeline/TimeRuler.svelte` (its props, the markup after the ticks, and the style)
- Test: `tests/unit/media-composition/time-ruler-marks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/time-ruler-marks.test.ts`:

```ts
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TimeRuler from "$lib/shared/timeline/TimeRuler.svelte";

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
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

function ruler(props: Record<string, unknown>): HTMLElement {
  const target = document.createElement("div");
  document.body.append(target);
  mounted = mount(TimeRuler, {
    target,
    props: { duration: 20, pixelsPerSecond: 50, ...props },
  });
  return target;
}

describe("TimeRuler marks", () => {
  it("labels the times it is given, laid out like its ticks", () => {
    const target = ruler({
      marks: [
        { seconds: 1.5, label: "1" },
        { seconds: 3.5, label: "2" },
      ],
    });
    const marks = [...target.querySelectorAll<HTMLElement>(".mark")];
    expect(marks.map((mark) => mark.textContent)).toEqual(["1", "2"]);
    expect(marks.map((mark) => mark.style.left)).toEqual(["75px", "175px"]);
  });

  it("shows none unless asked", () => {
    expect(ruler({}).querySelectorAll(".mark")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/time-ruler-marks.test.ts`

Expected: FAIL, `1 failed | 1 passed (2)`: "labels the times it is given, laid out like its ticks" fails with `AssertionError: expected [] to deeply equal [ '1', '2' ]`.

- [ ] **Step 3: Add the marks**

In `src/lib/shared/timeline/TimeRuler.svelte`:

**Edit 1.** A `marks` prop: labels at times the caller picks. Find:

```svelte
    class?: string;
```

Replace it with:

```svelte
    class?: string;
    /** Labels under the time labels at times of the caller's choosing, such
     *  as a song's bar numbers. Laid out like the ticks, in the same unit. */
    marks?: readonly { seconds: number; label: string }[];
```

**Edit 2.** It defaults to none. Find:

```svelte
    class: className,
```

Replace it with:

```svelte
    class: className,
    marks = [],
```

**Edit 3.** Draw each mark after the ticks. Find:

```svelte
  {/each}
```

Replace it with:

```svelte
  {/each}
  {#each marks as mark (mark.seconds)}
    <span class="mark" style="left: {mark.seconds * pixelsPerSecond}px"
      >{mark.label}</span
    >
  {/each}
```

**Edit 4.** The marks' style. Find:

```svelte
  }
</style>
```

Replace it with:

```svelte
  }

  .mark {
    position: absolute;
    top: 22px;
    font-size: var(--font-size-compact);
    color: var(--theme-accent);
    white-space: nowrap;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    pointer-events: none;
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/time-ruler-marks.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/timeline/TimeRuler.svelte tests/unit/media-composition/time-ruler-marks.test.ts
git add src/lib/shared/timeline/TimeRuler.svelte tests/unit/media-composition/time-ruler-marks.test.ts
git commit -m "Labelled marks on the time ruler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/timeline/TimeRuler.svelte tests/unit/media-composition/time-ruler-marks.test.ts
```

---

### Task 10: The Music panel

The panel the Music tool opens. It sets the level (0 to 200%) and the fades with the editor's sliders, the tempo and beats per bar as typed values, and bar 1 in the song's own seconds; it holds the credit's name, artist and license. **Tap the beat**, while the post plays, moves bar 1 onto the beat of the taps, to the beat nearest where bar 1 was, so the bar numbers stay where they were; a tap counts when the finger lands. **Suggest BPM** runs the tempo finder on the file and only shows what it heard; the tempo changes when **Use** is pressed. Each change goes out as `onChange(key, patch)`, and the key lets one slider drag make one undo step. The panel is wired into the editor in Task 11.

**Files:**
- Create: `src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte`
- Test: `tests/unit/media-composition/post-music-tool.test.ts` with its harness `tests/unit/media-composition/music-tool-harness.svelte.ts`

- [ ] **Step 1: Write the failing test**

Create the harness, `tests/unit/media-composition/music-tool-harness.svelte.ts`:

```ts
import { flushSync, mount } from "svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import {
  updateMusic,
  type MusicPatch,
} from "$lib/shared/media-composition/domain/post-music-edits";
import PostMusicTool from "$lib/shared/share/components/post-studio/editor/PostMusicTool.svelte";
import { NOW, project, video } from "./post-project-fixtures";

/**
 * Mounts the music's panel the way the workspace does: every change goes
 * through updateMusic, and the panel gets the new music back. The playhead
 * starts at the post's 0 s, paused.
 */
export function mountMusicTool(target: HTMLElement, initial: PostMusic) {
  const changes: Array<[string, MusicPatch]> = [];
  let music = $state.raw(initial);
  let playing = $state(false);
  let playhead = 0;
  const component = mount(PostMusicTool, {
    target,
    props: {
      get music() {
        return music;
      },
      get playing() {
        return playing;
      },
      playheadSeconds: () => playhead,
      onChange: (key: string, patch: MusicPatch) => {
        changes.push([key, patch]);
        const next = updateMusic({ ...project([video("v1")]), music }, patch, {
          now: NOW + 1,
        });
        if (next.music) music = next.music;
      },
    },
  });
  flushSync();
  return {
    component,
    changes,
    get music() {
      return music;
    },
    setPlaying(next: boolean) {
      playing = next;
      flushSync();
    },
    setPlayhead(seconds: number) {
      playhead = seconds;
    },
  };
}
```

Create `tests/unit/media-composition/post-music-tool.test.ts`:

```ts
/**
 * The music's panel. Its sliders and boxes hand back patches for
 * updateMusic, keyed by setting so a drag joins one undo step. Suggest BPM
 * must never change the tempo by itself, and tapping along must move bar 1
 * onto the taps without renumbering the bars.
 */
import { flushSync, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMusicTool } from "./music-tool-harness.svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";

const analyzer = vi.hoisted(() => ({
  analyzeAudioBpm: vi.fn(),
}));

vi.mock("$lib/shared/audio/bpm-analyzer", () => analyzer);

// The panel imports the analyzer on demand. Load the mock first, or the
// panel's import can race the mock and get the real analyzer.
await import("$lib/shared/audio/bpm-analyzer");

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 60,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let tool: ReturnType<typeof mountMusicTool> | null = null;

beforeEach(() => {
  analyzer.analyzeAudioBpm.mockReset();
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (tool) unmount(tool.component);
  tool = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
  vi.useRealTimers();
});

function open(start: PostMusic = music()) {
  const target = document.createElement("div");
  document.body.append(target);
  tool = mountMusicTool(target, start);
  return tool;
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) =>
        button.getAttribute("aria-label") === name ||
        button.textContent?.trim() === name
    ) ?? null
  );
}

/** Opens a typed-value box, types into it and presses Enter. */
function typeInto(box: string, typed: string): void {
  buttonNamed(box)!.click();
  flushSync();
  const field = document.querySelector<HTMLInputElement>(".typeable input")!;
  field.value = typed;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
  );
  flushSync();
}

function slide(index: number, value: number): void {
  const range = document.querySelectorAll<HTMLInputElement>(
    "input[type='range']"
  )[index]!;
  range.value = String(value);
  range.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function setText(name: string, value: string): HTMLInputElement {
  const field = [...document.querySelectorAll<HTMLLabelElement>("label")]
    .find((label) => label.textContent?.trim().startsWith(name))!
    .querySelector("input")!;
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
  return field;
}

function statusText(): string[] {
  return [...document.querySelectorAll("[role='status']")].map(
    (status) => status.textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

describe("the music's panel", () => {
  it("sets the level and fades, each under its own key", () => {
    const { changes, music: before } = open();
    expect(before.gain).toBe(1);
    slide(0, 150);
    slide(1, 2);
    slide(2, 3.5);
    expect(changes).toEqual([
      ["gain", { gain: 1.5 }],
      ["fadeIn", { fadeInSeconds: 2 }],
      ["fadeOut", { fadeOutSeconds: 3.5 }],
    ]);
    expect(tool!.music).toMatchObject({
      gain: 1.5,
      fadeInSeconds: 2,
      fadeOutSeconds: 3.5,
    });
  });

  it("makes a beat grid from a typed tempo, with bar 1 at the music's in point, and removes it", () => {
    const { changes } = open(music({ sourceInSeconds: 4 }));
    expect(buttonNamed("Beats per bar: 4")).toBeNull();
    typeInto("Tempo: None", "85");
    expect(changes).toEqual([["bpm", { bpm: 85 }]]);
    expect(tool!.music.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 4,
      beatsPerBar: 4,
    });
    typeInto("Beats per bar: 4", "3");
    typeInto("Bar 1 at, in the song's own seconds: 4.000 s", "4.42");
    expect(tool!.music.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 4.42,
      beatsPerBar: 3,
    });
    buttonNamed("Remove beat grid")!.click();
    flushSync();
    expect(changes.at(-1)).toEqual(["bpm", { bpm: null }]);
    expect(tool!.music.grid).toBeUndefined();
  });

  it("moves bar 1 onto the taps' beat, nearest where it was, while the post plays", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { changes, setPlaying, setPlayhead } = open(
      music({ grid: { bpm: 120, downbeatSeconds: 0, beatsPerBar: 4 } })
    );
    const tap = () => {
      buttonNamed("Tap the beat")!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 })
      );
      // The click that follows a pointer's tap is not a second tap.
      buttonNamed("Tap the beat")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
      flushSync();
    };

    expect(buttonNamed("Tap the beat")!.disabled).toBe(true);
    setPlaying(true);
    // A beat is 0.5 s; the taps land 0.1 s after each beat of the grid.
    setPlayhead(10.1);
    tap();
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(500);
    setPlayhead(10.6);
    tap();
    expect(changes).toHaveLength(1);
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.1, 9);
    expect(statusText()).toContain("2 taps");

    // Enter or Space on the button taps too.
    vi.advanceTimersByTime(500);
    setPlayhead(11.1);
    buttonNamed("Tap the beat")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 })
    );
    flushSync();
    expect(statusText()).toContain("3 taps");

    // After a pause the count starts again: one tap alone moves nothing.
    vi.advanceTimersByTime(2500);
    setPlayhead(20.3);
    tap();
    expect(statusText()).toContain("1 tap");
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.1, 9);
    vi.advanceTimersByTime(500);
    setPlayhead(20.8);
    tap();
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.3, 9);
  });

  it("offers no tapping without a tempo", () => {
    open();
    expect(buttonNamed("Tap the beat")).toBeNull();
  });

  it("shows a suggested tempo and changes nothing until Use is pressed", async () => {
    analyzer.analyzeAudioBpm.mockResolvedValue({
      bpm: 85,
      confidence: 0.72,
      isUncertain: false,
    });
    const { changes } = open();
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("About 85 BPM, 72% sure.")
    );
    expect(analyzer.analyzeAudioBpm).toHaveBeenCalledWith(URL);
    expect(changes).toEqual([]);
    expect(tool!.music.grid).toBeUndefined();
    buttonNamed("Use 85 BPM")!.click();
    flushSync();
    expect(changes).toEqual([["bpm", { bpm: 85 }]]);
    expect(tool!.music.grid?.bpm).toBe(85);
    expect(buttonNamed("Use 85 BPM")).toBeNull();
  });

  it("says when the beat is unclear, missing, or the file can't be read", async () => {
    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 140,
      confidence: 0.31,
      isUncertain: true,
    });
    open();
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain(
        "About 140 BPM, 31% sure. The beat is unclear; check it by ear."
      )
    );

    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 120,
      confidence: 0,
      isUncertain: true,
    });
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("No steady beat found. Type the tempo in.")
    );
    expect(buttonNamed("Use 120 BPM")).toBeNull();

    analyzer.analyzeAudioBpm.mockRejectedValueOnce(new Error("decode"));
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("Could not read the music file.")
    );
  });

  it("keeps the music's name when cleared, and clears the artist and license", () => {
    const { changes } = open();
    setText("Name", "Derail (radio edit)");
    const name = setText("Name", "   ");
    expect(name.value).toBe("Derail (radio edit)");
    setText("Artist", "Yellowbase");
    setText("License", "Epidemic Sound, trial, 2026-10-07");
    setText("Artist", "");
    expect(changes).toEqual([
      ["label", { label: "Derail (radio edit)" }],
      ["artist", { artist: "Yellowbase" }],
      ["license", { license: "Epidemic Sound, trial, 2026-10-07" }],
      ["artist", { artist: null }],
    ]);
    expect(tool!.music).toMatchObject({
      label: "Derail (radio edit)",
      license: "Epidemic Sound, trial, 2026-10-07",
    });
    expect(tool!.music.artist).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music-tool.test.ts`

Expected: FAIL. The harness cannot resolve `$lib/shared/share/components/post-studio/editor/PostMusicTool.svelte`.

- [ ] **Step 3: Create the panel**

Create `src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte`:

```svelte
<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import {
    downbeatFromTaps,
    trackSecondsAt,
  } from "$lib/shared/media-composition/domain/music-grid";
  import {
    POST_MUSIC_MAX_BEATS_PER_BAR,
    POST_MUSIC_MAX_GAIN,
    POST_MUSIC_MAX_LICENSE,
    POST_MUSIC_MAX_TEXT,
    type PostMusic,
  } from "$lib/shared/media-composition/domain/post-music";
  import type { MusicPatch } from "$lib/shared/media-composition/domain/post-music-edits";

  /**
   * The music's settings: its level and fades, its beat grid, and the names
   * its credit and license need. Suggest BPM only shows what it heard; the
   * tempo changes when Use is pressed. Tapping along while the post plays
   * moves bar 1 onto the beat of the taps, to the beat nearest where bar 1
   * was, so the bar numbers stay where they were.
   */
  interface Props {
    music: PostMusic;
    playing: boolean;
    /** The playhead in post seconds, read as each tap lands. */
    playheadSeconds: () => number;
    /** `key` names the setting, so one slider drag makes one undo step. */
    onChange: (key: string, patch: MusicPatch) => void;
  }

  let { music, playing, playheadSeconds, onChange }: Props = $props();

  const id = $props.id();

  /** A pause longer than this between taps starts a new count. */
  const TAP_RESET_MS = 2000;

  let tapButton = $state<HTMLButtonElement | null>(null);
  let taps: number[] = [];
  let lastTapAt = Number.NEGATIVE_INFINITY;
  let tapCount = $state(0);
  let suggesting = $state(false);
  let suggestion = $state<{
    bpm: number;
    confidence: number;
    uncertain: boolean;
  } | null>(null);
  let suggestNote = $state("");

  const playingSeconds = $derived(
    music.sourceOutSeconds - music.sourceInSeconds
  );
  const percent = (value: number) => `${Math.round(value)}%`;
  const fadeSeconds = (value: number) => `${value.toFixed(2)} s`;
  const bpmText = (bpm: number) => `${Number(bpm.toFixed(2))} BPM`;

  function tap(): void {
    const grid = music.grid;
    if (!playing || !grid) return;
    const at = performance.now();
    if (at - lastTapAt > TAP_RESET_MS) taps = [];
    lastTapAt = at;
    taps = [...taps, trackSecondsAt(music, playheadSeconds())];
    tapCount = taps.length;
    const downbeat = downbeatFromTaps(taps, grid.bpm, grid.downbeatSeconds);
    if (downbeat !== null) onChange("downbeat", { downbeatSeconds: downbeat });
  }

  // A tap counts when the finger lands, not when it lifts: the lift comes a
  // tenth of a second later and would pull bar 1 late.
  $effect(() => {
    const button = tapButton;
    if (!button) return;
    button.addEventListener("pointerdown", tap);
    return () => button.removeEventListener("pointerdown", tap);
  });

  /** Enter or Space on the button taps; a pointer has tapped already. */
  function tapFromKeys(event: MouseEvent): void {
    if (event.detail === 0) tap();
  }

  async function suggestBpm(): Promise<void> {
    if (suggesting) return;
    const url = music.url;
    suggesting = true;
    suggestion = null;
    suggestNote = "";
    try {
      const { analyzeAudioBpm } =
        await import("$lib/shared/audio/bpm-analyzer");
      const result = await analyzeAudioBpm(url);
      if (url !== music.url) return;
      if (result.confidence <= 0)
        suggestNote = "No steady beat found. Type the tempo in.";
      else
        suggestion = {
          bpm: result.bpm,
          confidence: result.confidence,
          uncertain: result.isUncertain === true,
        };
    } catch {
      suggestNote = "Could not read the music file.";
    } finally {
      suggesting = false;
    }
  }

  function useSuggestion(): void {
    if (!suggestion) return;
    onChange("bpm", { bpm: suggestion.bpm });
    suggestion = null;
  }

  function setText(
    field: "label" | "artist" | "license",
    input: HTMLInputElement
  ): void {
    const text = input.value.trim();
    // The music always has a name; clearing it keeps the old one.
    if (field === "label" && !text) {
      input.value = music.label;
      return;
    }
    onChange(field, { [field]: text || null });
  }
</script>

<div class="music-tool">
  <ValueSlider
    label="Level"
    value={music.gain * 100}
    min={0}
    max={POST_MUSIC_MAX_GAIN * 100}
    step={1}
    origin={100}
    format={percent}
    onchange={(value) => onChange("gain", { gain: value / 100 })}
  />
  <ValueSlider
    label="Fade in"
    value={music.fadeInSeconds}
    min={0}
    max={Math.max(0, playingSeconds / 2)}
    step={0.05}
    format={fadeSeconds}
    onchange={(value) => onChange("fadeIn", { fadeInSeconds: value })}
  />
  <ValueSlider
    label="Fade out"
    value={music.fadeOutSeconds}
    min={0}
    max={Math.max(0, playingSeconds / 2)}
    step={0.05}
    format={fadeSeconds}
    onchange={(value) => onChange("fadeOut", { fadeOutSeconds: value })}
  />

  <section class="group" aria-labelledby="{id}-grid">
    <h4 class="group-title" id="{id}-grid">Beat grid</h4>
    <div class="pairs">
      <span class="pair-name" aria-hidden="true">Tempo</span>
      <TypeableValue
        label="Tempo"
        text={music.grid ? bpmText(music.grid.bpm) : "None"}
        draft={music.grid ? String(Number(music.grid.bpm.toFixed(2))) : ""}
        unit="BPM"
        oncommit={(bpm) => onChange("bpm", { bpm })}
      />
      {#if music.grid}
        <span class="pair-name" aria-hidden="true">Beats per bar</span>
        <TypeableValue
          label="Beats per bar"
          text={String(music.grid.beatsPerBar)}
          sizer={String(POST_MUSIC_MAX_BEATS_PER_BAR)}
          oncommit={(beats) => onChange("beatsPerBar", { beatsPerBar: beats })}
        />
        <span class="pair-name" aria-hidden="true">Bar 1 at</span>
        <TypeableValue
          label="Bar 1 at, in the song's own seconds"
          text={`${music.grid.downbeatSeconds.toFixed(3)} s`}
          oncommit={(seconds) =>
            onChange("downbeat", { downbeatSeconds: seconds })}
        />
      {/if}
    </div>
    {#if music.grid}
      <div class="actions">
        <PanelButton
          bind:ref={tapButton}
          onclick={tapFromKeys}
          disabled={!playing}
        >
          <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          Tap the beat
        </PanelButton>
        <PanelButton onclick={() => onChange("bpm", { bpm: null })}>
          Remove beat grid
        </PanelButton>
      </div>
      <p class="status" role="status">
        {#if !playing}
          Play the post to tap along. Bar 1 moves onto your taps.
        {:else if tapCount > 0}
          {tapCount} {tapCount === 1 ? "tap" : "taps"}
        {:else}
          Tap with the beat. Bar 1 moves onto your taps.
        {/if}
      </p>
    {/if}
    <div class="actions">
      <PanelButton onclick={() => void suggestBpm()} disabled={suggesting}>
        <i class="fa-solid fa-wave-square" aria-hidden="true"></i>
        {suggesting ? "Listening…" : "Suggest BPM"}
      </PanelButton>
      {#if suggestion}
        <PanelButton onclick={useSuggestion}>
          Use {bpmText(suggestion.bpm)}
        </PanelButton>
      {/if}
    </div>
    {#if suggestion}
      <p class="status" role="status">
        About {bpmText(suggestion.bpm)}, {Math.round(
          suggestion.confidence * 100
        )}% sure.{suggestion.uncertain
          ? " The beat is unclear; check it by ear."
          : ""}
      </p>
    {:else if suggestNote}
      <p class="status" role="status">{suggestNote}</p>
    {/if}
  </section>

  <section class="group" aria-labelledby="{id}-credit">
    <h4 class="group-title" id="{id}-credit">Credit</h4>
    <label class="text-row">
      <span class="pair-name">Name</span>
      <input
        class="field"
        value={music.label}
        maxlength={POST_MUSIC_MAX_TEXT}
        onchange={(event) => setText("label", event.currentTarget)}
      />
    </label>
    <label class="text-row">
      <span class="pair-name">Artist</span>
      <input
        class="field"
        value={music.artist ?? ""}
        maxlength={POST_MUSIC_MAX_TEXT}
        onchange={(event) => setText("artist", event.currentTarget)}
      />
    </label>
    <label class="text-row">
      <span class="pair-name">License</span>
      <input
        class="field"
        value={music.license ?? ""}
        placeholder="Library, license id and date"
        maxlength={POST_MUSIC_MAX_LICENSE}
        onchange={(event) => setText("license", event.currentTarget)}
      />
    </label>
  </section>
</div>

<style>
  .music-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .group {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .group-title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Each name beside a box that takes a typed value. */
  .pairs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .pair-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .status {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .text-row {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-music-tool.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte tests/unit/media-composition/music-tool-harness.svelte.ts tests/unit/media-composition/post-music-tool.test.ts
git add src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte tests/unit/media-composition/music-tool-harness.svelte.ts tests/unit/media-composition/post-music-tool.test.ts
git commit -m "The Music panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte tests/unit/media-composition/music-tool-harness.svelte.ts tests/unit/media-composition/post-music-tool.test.ts
```

---

### Task 11: The Music tool, selection and Delete in the editor

The editor's tool row comes from `toolRow` in `post-editor-tools.ts`, keyed by what is selected. The music becomes a selection of its own: selected, its row is Back, Music and Delete, and the Music panel stays open while it is selected; Export stays the post's. The music is no item, so the workspace keeps its selection in a flag of its own, which picking an item or removing the music clears. Each panel change goes through `updateMusic` as a setting edit keyed `music:<key>`, so a slider drag's steps join into one undo step. Delete, Backspace and the Delete tool remove the selected music; Escape, deselecting and opening Export let go of it.

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts` (the tool list, the selection type, the music's row, its panel)
- Modify: `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts` (the tool's icon and name)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` (imports, state, the tool row, Delete, keys and the panel)
- Test: three more tests at the end of `tests/unit/media-composition/post-editor-tools.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/media-composition/post-editor-tools.test.ts`:

**Edit 1.** Add at the end of the file, after one blank line:

```ts
describe("the music", () => {
  const MUSIC: PostToolSelection = {
    kind: null,
    hasLayout: false,
    music: true,
  };

  it("offers Back, Music and Delete for the selected music", () => {
    expect(toolRow(MUSIC)).toEqual(["back", "music", "delete"]);
  });

  it("opens the music's panel, which is a panel tool", () => {
    expect(isPanelTool("music")).toBe(true);
    expect(availablePanels(MUSIC)).toEqual(["music"]);
    expect(defaultPanel(MUSIC)).toBe("music");
  });

  it("keeps the music's panel while the music is selected", () => {
    expect(shownPanel("music", MUSIC, false)).toBe("music");
    expect(shownPanel("trim", MUSIC, true)).toBe("music");
  });

  it("drops the music's panel once the music is not selected", () => {
    expect(shownPanel("music", POST, true)).toBe("videos");
    expect(shownPanel("music", POST, false)).toBeNull();
  });

  it("offers Music nowhere else", () => {
    expect(toolRow(POST)).not.toContain("music");
    expect(toolRow(MAIN_CLIP)).not.toContain("music");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-editor-tools.test.ts`

Expected: FAIL, `3 failed | 16 passed (19)`: "offers Back, Music and Delete for the selected music" with `expected [ 'videos', 'add', 'canvas', …(2) ] to deeply equal [ 'back', 'music', 'delete' ]`, "opens the music's panel, which is a panel tool" with the same row against `[ 'music' ]`, and "keeps the music's panel while the music is selected" with `expected null to be 'music'`.

- [ ] **Step 3: Add the tool**

In `src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts`:

**Edit 1.** A new panel tool. Find:

```ts
  | "text"
  | "rename";
```

Replace it with:

```ts
  | "text"
  | "rename"
  | "music";
```

**Edit 2.** The selection can be the music. Find:

```ts
  hasBackdrop?: boolean;
```

Replace it with:

```ts
  hasBackdrop?: boolean;
  /** The music under the post is selected; it is no item, so `kind` is null. */
  music?: boolean;
```

**Edit 3.** The music's row: Back, Music and Delete. Find:

```ts
export function toolRow(selection: PostToolSelection): PostToolId[] {
  switch (selection.kind) {
```

Replace it with:

```ts
export function toolRow(selection: PostToolSelection): PostToolId[] {
  if (selection.music) return ["back", "music", "delete"];
  switch (selection.kind) {
```

**Edit 4.** The music's only panel is its own; Export stays the post's. Find:

```ts
  const panels = toolRow(selection).filter(isPanelTool);
```

Replace it with:

```ts
  const panels = toolRow(selection).filter(isPanelTool);
  if (selection.music) return panels;
```

In `src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts`:

**Edit 1.** The tool's icon. Find:

```ts
  rename: "fa-pen",
```

Replace it with:

```ts
  rename: "fa-pen",
  music: "fa-music",
```

**Edit 2.** The tool's name. Find:

```ts
    case "rename":
      return t("post_editor_tool_rename");
```

Replace it with:

```ts
    case "rename":
      return t("post_editor_tool_rename");
    case "music":
      return "Music";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-editor-tools.test.ts tests/unit/media-composition/post-tunnel-appearance.test.ts`

Expected: PASS. `post-editor-tools.test.ts` has 19 tests; `post-tunnel-appearance.test.ts`, which also reads `toolRow`, passes unchanged.

- [ ] **Step 5: Wire the panel, selection and Delete into the workspace**

In `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`:

**Edit 1.** Import the music's panel and its edits. Find:

```svelte
  import PostItemTool from "./PostItemTool.svelte";
```

Replace it with:

```svelte
  import PostItemTool from "./PostItemTool.svelte";
  import PostMusicTool from "./PostMusicTool.svelte";
  import {
    removeMusic,
    updateMusic,
    type MusicPatch,
  } from "$lib/shared/media-composition/domain/post-music-edits";
```

**Edit 2.** After `activeTool`, keep whether the music is selected, and the edits its panel and the Delete tool make. Find:

```svelte
  let activeTool = $state<PostPanelToolId | null>(null);
```

Replace it with:

```svelte
  let activeTool = $state<PostPanelToolId | null>(null);

  /**
   * The music under the post is selected. It is no item, so the editor's
   * selection stays empty; picking an item, or removing the music, clears it.
   */
  let musicSelected = $state(false);
  $effect(() => {
    if (editor.selectedItemId !== null || !editor.project.music)
      musicSelected = false;
  });

  function selectMusic(): void {
    editor.selectedItemId = null;
    musicSelected = true;
  }

  /** One setting's change; a slider drag's steps join into one undo step. */
  function changeMusic(key: string, patch: MusicPatch): void {
    editor.editSetting(`music:${key}`, (project, context) =>
      updateMusic(project, patch, context)
    );
  }

  function deleteMusic(): void {
    musicSelected = false;
    editor.edit((project, context) => removeMusic(project, context));
  }
```

**Edit 3.** With nothing selected, the tool row's selection says whether the music is. Find:

```svelte
    if (!item) return { kind: null, hasLayout: false };
```

Replace it with:

```svelte
    if (!item) return { kind: null, hasLayout: false, music: musicSelected };
```

**Edit 4.** In `toolDisabled`, Delete works on the music too. Find:

```svelte
      case "duplicate":
      case "delete":
        return !editor.selectionEditable;
```

Replace it with:

```svelte
      case "duplicate":
        return !editor.selectionEditable;
      case "delete":
        return !musicSelected && !editor.selectionEditable;
```

**Edit 5.** In `pickTool`, the Delete tool removes the selected music. Find:

```svelte
      case "delete":
        if (editor.deleteSelected()) void focusAfterUpdate({ kind: "row" });
```

Replace it with:

```svelte
      case "delete":
        if (musicSelected) {
          deleteMusic();
          void focusAfterUpdate({ kind: "row" });
          return;
        }
        if (editor.deleteSelected()) void focusAfterUpdate({ kind: "row" });
```

**Edit 6.** Deselecting lets go of the music. Find:

```svelte
  function deselect(): void {
    editor.selectedItemId = null;
    activeTool = null;
```

Replace it with:

```svelte
  function deselect(): void {
    editor.selectedItemId = null;
    musicSelected = false;
    activeTool = null;
```

**Edit 7.** So does opening Export. Find:

```svelte
  function openExport(): void {
    editor.selectedItemId = null;
```

Replace it with:

```svelte
  function openExport(): void {
    editor.selectedItemId = null;
    musicSelected = false;
```

**Edit 8.** In `handleKey`, Delete and Backspace remove the selected music. Find:

```svelte
      case "Delete":
      case "Backspace":
        if (!editor.selectedItem) return;
```

Replace it with:

```svelte
      case "Delete":
      case "Backspace":
        if (musicSelected) {
          event.preventDefault();
          deleteMusic();
          void focusAfterUpdate({ kind: "row" });
          return;
        }
        if (!editor.selectedItem) return;
```

**Edit 9.** Escape lets go of the music as it does of an item. Find:

```svelte
        if (!editor.selectedItemId) return;
```

Replace it with:

```svelte
        if (!editor.selectedItemId && !musicSelected) return;
```

**Edit 10.** In the `panelBody` snippet, show the music's panel. Find:

```svelte
  {:else if editor.selectedItem}
```

Replace it with:

```svelte
  {:else if tool === "music" && editor.project.music}
    <PostMusicTool
      music={editor.project.music}
      playing={editor.isPlaying}
      playheadSeconds={() => editor.previewSeconds}
      onChange={changeMusic}
    />
  {:else if editor.selectedItem}
```

**Edit 11.** In the `panel` snippet, the panel's subject is the music's name. Find:

```svelte
      : editor.selectedPart === "tunnel"
        ? t("post_timeline_tunnel")
        : editor.selectedItem
          ? labelFor(editor.selectedItem)
          : undefined}
```

Replace it with:

```svelte
      : tool === "music"
        ? editor.project.music?.label
        : editor.selectedPart === "tunnel"
          ? t("post_timeline_tunnel")
          : editor.selectedItem
            ? labelFor(editor.selectedItem)
            : undefined}
```

- [ ] **Step 6: Check that the workspace still compiles**

```bash
node - src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte <<'EOF'
const fs = require("node:fs");
const { compile } = require("svelte/compiler");
for (const file of process.argv.slice(2)) {
  compile(fs.readFileSync(file, "utf8"), { filename: file, generate: "client" });
  console.log(`compiled ${file}`);
}
EOF
```

Expected: `compiled src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-editor-tools.test.ts
git add src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-editor-tools.test.ts
git commit -m "The Music tool, selection and Delete in the editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/share/components/post-studio/editor/post-editor-tools.ts src/lib/shared/share/components/post-studio/editor/post-editor-labels.ts src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-editor-tools.test.ts
```

---

### Task 12: The music's lane under the timeline's tracks

The music gets a row of its own under the video and overlay tracks, with a header like theirs but no hide or lock. The lane draws the file's waveform with wavesurfer.js, loaded once per file and drawn at no more than 100 px per second, then stretched, so zooming in on a long song never draws dozens of screen-wide canvases. Bar and beat lines sit over it; beats drop out below 6 px apart, and bars stay. Pressing selects it; dragging moves it as one gesture; while selected it shows two trim handles and a bar-1 flag that sets where bar 1 falls. Every drag snaps: the music's start, end or bar 1, whichever lands closest to a target, goes onto zero, the playhead or a clip's edge (`placeDraggedMusic`), and clips now also snap to the music's edges, bars and beats. The ruler numbers the bars with Task 9's marks. Each drag reaches the workspace as one undo step, as a clip's drag does.

**Files:**
- Create: `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts` (`placeDraggedMusic`)
- Modify: `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte` (hide and lock become optional)
- Modify: `src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte` (props, the row, snapping, the ruler's marks, the header and the lane)
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte` (an import, the clip pick, and the timeline's music props)
- Test: `tests/unit/media-composition/post-timeline-geometry-music.test.ts`, `tests/unit/media-composition/post-timeline-music-lane.test.ts` with its harness `tests/unit/media-composition/music-lane-harness.svelte.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/post-timeline-geometry-music.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { placeDraggedMusic } from "$lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry";

describe("placeDraggedMusic", () => {
  // 100 px/s with the default 8 px threshold snaps within 0.08 s.
  it("rounds the start to a frame when nothing is near", () => {
    const placed = placeDraggedMusic(3.01, [0, 2], [], 100);
    expect(placed.start).toBeCloseTo(3, 10);
    expect(placed.guideSeconds).toBeNull();
  });

  it("snaps the start to a nearby target", () => {
    expect(placeDraggedMusic(10.05, [0, 30], [10], 100)).toEqual({
      start: 10,
      guideSeconds: 10,
    });
  });

  it("snaps the end instead when the end is the closer one", () => {
    // The end lands at 9.97, 0.03 s from 10. The start is 0.07 s from 8.04.
    expect(placeDraggedMusic(7.97, [0, 2], [8.04, 10], 100)).toEqual({
      start: 8,
      guideSeconds: 10,
    });
  });

  it("puts bar 1 on a cut", () => {
    // Bar 1 sounds 0.25 s in, so it reaches 5.05 and snaps to the cut at 5.1.
    const placed = placeDraggedMusic(4.8, [0, 30, 0.25], [5.1], 100);
    expect(placed.start).toBeCloseTo(4.85, 10);
    expect(placed.guideSeconds).toBe(5.1);
  });

  it("picks whichever anchor is closest to its target", () => {
    // The start is 0.03 s from 2.03; bar 1 is 0.02 s from 2.52.
    const placed = placeDraggedMusic(2, [0, 10, 0.5], [2.03, 2.52], 100);
    expect(placed.start).toBeCloseTo(2.02, 10);
    expect(placed.guideSeconds).toBe(2.52);
  });

  it("never lands before 0", () => {
    expect(placeDraggedMusic(-3, [0, 2], [], 100).start).toBe(0);
    expect(placeDraggedMusic(-0.04, [0, 2], [0], 100)).toEqual({
      start: 0,
      guideSeconds: 0,
    });
  });
});
```

Create the harness, `tests/unit/media-composition/music-lane-harness.svelte.ts`:

```ts
import { flushSync, mount } from "svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import PostTimelineMusicLane from "$lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte";

export type LaneCall = [name: string, ...args: unknown[]];

/**
 * Mounts the music lane the way the timeline does: the music is replaced,
 * never changed in place, as the editor's `$state.raw` project replaces it.
 * Every callback is recorded in order. Selecting the music selects it.
 */
export function mountMusicLane(
  target: HTMLElement,
  initial: PostMusic,
  snapTargets: number[] = []
) {
  const calls: LaneCall[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  let music = $state.raw(initial);
  let pixelsPerSecond = $state(100);
  let selected = $state(false);
  const component = mount(PostTimelineMusicLane, {
    target,
    props: {
      get music() {
        return music;
      },
      get pixelsPerSecond() {
        return pixelsPerSecond;
      },
      get selected() {
        return selected;
      },
      snapTargets: () => snapTargets,
      onSelect: () => {
        calls.push(["select"]);
        selected = true;
      },
      onGestureStart: record("gestureStart"),
      onGestureEnd: record("gestureEnd"),
      onGestureCancel: record("gestureCancel"),
      onMove: record("move"),
      onTrim: record("trim"),
      onMoveDownbeat: record("downbeat"),
      onSnapGuide: record("guide"),
    },
  });
  flushSync();
  return {
    component,
    calls,
    get music() {
      return music;
    },
    setMusic(next: PostMusic) {
      music = next;
      flushSync();
    },
    setPixelsPerSecond(next: number) {
      pixelsPerSecond = next;
      flushSync();
    },
    setSelected(next: boolean) {
      selected = next;
      flushSync();
    },
  };
}
```

Create `tests/unit/media-composition/post-timeline-music-lane.test.ts`:

```ts
/**
 * The music's row on the Post timeline. Its drags hand back post seconds,
 * snapped and clamped the way the edits will clamp them; bar 1 comes back in
 * the file's own seconds. The waveform must load once per file: the editor
 * replaces the music object on every edit, and reloading the song on each
 * frame of a drag would stall the timeline.
 */
import { flushSync, unmount } from "svelte";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mountMusicLane } from "./music-lane-harness.svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import { POST_MUSIC_MIN_SECONDS } from "$lib/shared/media-composition/domain/post-music-edits";

const wave = vi.hoisted(() => ({
  created: [] as Array<{
    options: Record<string, unknown>;
    destroy: () => void;
    destroyed: boolean;
  }>,
}));

vi.mock("wavesurfer.js", () => ({
  default: {
    create: (options: Record<string, unknown>) => {
      const instance = {
        options,
        destroyed: false,
        destroy() {
          instance.destroyed = true;
        },
      };
      wave.created.push(instance);
      return instance;
    },
  },
}));

// The lane imports the waveform library on demand. Load the mock first, or
// the first lanes' imports can race the mock and get the real library.
await import("wavesurfer.js");

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const GRID = { bpm: 120, downbeatSeconds: 0.5, beatsPerBar: 4 };

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 1,
    sourceInSeconds: 0,
    sourceOutSeconds: 10,
    durationSeconds: 30,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let lane: ReturnType<typeof mountMusicLane> | null = null;

beforeAll(() => {
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => {};
});

afterAll(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

beforeEach(() => {
  wave.created = [];
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (lane) unmount(lane.component);
  lane = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function open(start: PostMusic, snapTargets: number[] = []) {
  const target = document.createElement("div");
  document.body.append(target);
  lane = mountMusicLane(target, start, snapTargets);
  return lane;
}

function button(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
}

function body(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(".music-body")!;
}

function press(element: Element, clientX: number): void {
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX,
    })
  );
}

function moveTo(clientX: number): void {
  window.dispatchEvent(
    new PointerEvent("pointermove", { pointerId: 1, clientX })
  );
}

function release(clientX: number): void {
  window.dispatchEvent(
    new PointerEvent("pointerup", { pointerId: 1, clientX })
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("the music lane", () => {
  it("sits on the post's clock and draws bars over the beats", () => {
    const { setPixelsPerSecond } = open(music({ grid: GRID }));
    const clip = document.querySelector<HTMLElement>(".music-clip")!;
    expect([clip.style.left, clip.style.width]).toEqual(["100px", "1000px"]);
    expect(body().getAttribute("aria-label")).toBe(
      "Music: Derail, 0:01.0 to 0:11.0"
    );
    // Bar 1 sounds at the post's 1.5 s; a bar is 2 s and a beat 0.5 s.
    const bars = document.querySelectorAll<HTMLElement>(".grid-line.bar");
    expect(bars).toHaveLength(5);
    expect(bars[0]!.style.left).toBe("50px");
    expect(document.querySelectorAll(".grid-line")).toHaveLength(21);
    // Zoomed out, beats 4 px apart are left out and the bars stay.
    setPixelsPerSecond(8);
    expect(document.querySelectorAll(".grid-line")).toHaveLength(5);
  });

  it("draws no lines without a beat grid", () => {
    open(music());
    expect(document.querySelectorAll(".grid-line")).toHaveLength(0);
  });

  it("loads the waveform once per file, not on every edit", async () => {
    const { setMusic, music: first } = open(music());
    await vi.waitFor(() => expect(wave.created).toHaveLength(1));
    expect(wave.created[0]!.options).toMatchObject({
      url: URL,
      interact: false,
      fillParent: true,
    });

    setMusic({ ...first, gain: 0.5, startSeconds: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wave.created).toHaveLength(1);

    const other = "/api/dev/feature-videos/promo/media/music/parsec.wav";
    setMusic({ ...first, url: other });
    await vi.waitFor(() => expect(wave.created).toHaveLength(2));
    expect(wave.created[0]!.destroyed).toBe(true);
    expect(wave.created[1]!.options.url).toBe(other);

    unmount(lane!.component);
    lane = null;
    expect(wave.created[1]!.destroyed).toBe(true);
  });

  it("draws the file's whole length, shifted so the trimmed part shows", () => {
    open(music({ sourceInSeconds: 4, sourceOutSeconds: 14 }));
    const drawn = document.querySelector<HTMLElement>(".wave")!;
    expect(drawn.style.left).toBe("-400px");
    expect(drawn.style.width).toBe("3000px");
  });

  it("selects on a press that doesn't move", () => {
    const { calls } = open(music());
    press(body(), 200);
    release(201);
    expect(calls).toEqual([]);
    body().click();
    expect(calls).toEqual([["select"]]);
  });

  it("moves with the pointer, as one gesture that snaps its start to a cut", async () => {
    const { calls } = open(music(), [5]);
    press(body(), 200);
    moveTo(300);
    await nextFrame();
    expect(calls).toEqual([
      ["select"],
      ["gestureStart"],
      ["guide", null],
      ["move", 2],
    ]);
    calls.length = 0;
    // 3.95 s lands 0.05 s from the cut at 5 s, inside the 8 px snap.
    moveTo(595);
    release(595);
    expect(calls).toEqual([
      ["guide", 5],
      ["move", 5],
      ["gestureEnd"],
      ["guide", null],
    ]);
  });

  it("puts bar 1 on a cut when bar 1 is the part closest to one", () => {
    // Bar 1 sounds 0.25 s in. Dragged to 4.8 s, it reaches 5.05 s.
    const { calls } = open(
      music({ grid: { ...GRID, downbeatSeconds: 0.25 } }),
      [5.1]
    );
    press(body(), 200);
    moveTo(580);
    release(580);
    const moved = calls.find(([name]) => name === "move");
    expect(moved?.[1]).toBeCloseTo(4.85, 9);
    expect(calls).toContainEqual(["guide", 5.1]);
  });

  it("leaves the music alone on Escape, or when dragged back to where it began", () => {
    const { calls } = open(music());
    press(body(), 200);
    moveTo(400);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    );
    release(400);
    expect(calls).toEqual([
      ["select"],
      ["gestureStart"],
      ["guide", null],
      ["gestureCancel"],
      ["guide", null],
    ]);

    calls.length = 0;
    press(body(), 200);
    moveTo(400);
    moveTo(200);
    release(200);
    expect(calls.at(-2)).toEqual(["gestureCancel"]);
    expect(calls.some(([name]) => name === "move")).toBe(false);
  });

  it("shows its trim handles and bar 1 only while selected", () => {
    const { setSelected } = open(music({ grid: GRID }));
    expect(button("Trim the music's start")).toBeNull();
    expect(button("Move bar 1")).toBeNull();
    setSelected(true);
    expect(button("Trim the music's start")).not.toBeNull();
    expect(button("Trim the music's end")).not.toBeNull();
    expect(button("Move bar 1")?.style.left).toBe("150px");
  });

  it("trims its end to a bar or beat past the current end, and never past the file", () => {
    const { calls, setSelected } = open(music({ grid: GRID }));
    setSelected(true);
    press(button("Trim the music's end")!, 1100);
    // 13.03 s: the beat at 13 s is 0.03 s away.
    moveTo(1303);
    moveTo(4100);
    release(4100);
    expect(calls).toEqual([
      ["gestureStart"],
      ["guide", 13],
      ["guide", null],
      // The file is 30 s long and plays from the post's 1 s.
      ["trim", "end", 31],
      ["gestureEnd"],
      ["guide", null],
    ]);
  });

  it("keeps a trim inside the file, after the post's start, and long enough to see", () => {
    const { calls, setSelected } = open(
      music({ sourceInSeconds: 4, sourceOutSeconds: 14 })
    );
    setSelected(true);
    press(button("Trim the music's start")!, 100);
    moveTo(-5000);
    release(-5000);
    // The file could reach back to the post's -3 s; the post starts at 0.
    expect(calls).toContainEqual(["trim", "start", 0]);

    calls.length = 0;
    press(button("Trim the music's end")!, 1100);
    moveTo(-5000);
    release(-5000);
    expect(calls).toContainEqual(["trim", "end", 1 + POST_MUSIC_MIN_SECONDS]);
  });

  it("moves bar 1 and reports it in the file's own seconds", () => {
    // Bar 1 is the file's 1.5 s, which the post plays at 2.5 s.
    const { calls, setSelected } = open(
      music({
        startSeconds: 2,
        sourceInSeconds: 1,
        sourceOutSeconds: 11,
        grid: { ...GRID, downbeatSeconds: 1.5 },
      }),
      [3.25]
    );
    setSelected(true);
    press(button("Move bar 1")!, 250);
    moveTo(323);
    release(323);
    expect(calls).toContainEqual(["guide", 3.25]);
    expect(calls).toContainEqual(["downbeat", 2.25]);
  });

  it("moves bar 1 by whole beats when it lands near one of the song's own", () => {
    // Bar 1 is the post's 2.5 s; the song's beats fall every 0.5 s from there.
    const { calls, setSelected } = open(
      music({
        startSeconds: 2,
        sourceInSeconds: 1,
        sourceOutSeconds: 11,
        grid: { ...GRID, downbeatSeconds: 1.5 },
      })
    );
    setSelected(true);
    press(button("Move bar 1")!, 250);
    // 3.48 s: the song's beat at 3.5 s is 0.02 s away.
    moveTo(348);
    release(348);
    expect(calls).toContainEqual(["guide", 3.5]);
    expect(calls).toContainEqual(["downbeat", 2.5]);
  });

  it("hides bar 1 when the music's trim leaves it out", () => {
    const { setSelected } = open(
      music({ sourceInSeconds: 2, sourceOutSeconds: 12, grid: GRID })
    );
    setSelected(true);
    flushSync();
    expect(button("Move bar 1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-timeline-geometry-music.test.ts tests/unit/media-composition/post-timeline-music-lane.test.ts`

Expected: FAIL. All 6 geometry tests fail with `TypeError: (0 , __vite_ssr_import_1__.placeDraggedMusic) is not a function`, and the harness cannot resolve `$lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte`.

- [ ] **Step 3: Add the music's drag placement**

In `src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts`:

**Edit 1.** Add `placeDraggedMusic` before `TimeSpan`, next to the other drag placement. Find:

```ts
export interface TimeSpan {
```

Replace it with:

```ts
/**
 * Where dragged music lands. `anchors` are times measured from the music's
 * start that may snap: its start (0), its end, and bar 1 while the music
 * sounds it. Whichever anchor lands closest to a target moves the music so
 * it sits exactly on it; with none in range the start is rounded to a frame.
 * Either way it stays at 0 or later. `guideSeconds` is the target it snapped
 * to, for the guide line.
 */
export function placeDraggedMusic(
  rawStart: number,
  anchors: readonly number[],
  targets: readonly number[],
  pixelsPerSecond: number
): { start: number; guideSeconds: number | null } {
  let best: { start: number; guide: number; gap: number } | null = null;
  for (const anchor of anchors) {
    const raw = rawStart + anchor;
    const snapped = snapToTargets(raw, targets, pixelsPerSecond);
    if (snapped.snappedToSeconds === null) continue;
    const gap = Math.abs(snapped.seconds - raw);
    if (!best || gap < best.gap)
      best = {
        start: snapped.seconds - anchor,
        guide: snapped.snappedToSeconds,
        gap,
      };
  }
  return best
    ? { start: Math.max(0, best.start), guideSeconds: best.guide }
    : { start: Math.max(0, roundToFrameSeconds(rawStart)), guideSeconds: null };
}

export interface TimeSpan {
```

- [ ] **Step 4: Create the lane**

Create `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte`:

```svelte
<script lang="ts">
  import { POST_TIME_EPSILON } from "$lib/shared/media-composition/domain/post-project";
  import { formatPostClock } from "$lib/shared/share/components/post-studio/builder/post-builder-format";
  import {
    beatSeconds,
    hasGrid,
    musicGridLines,
    musicSnapTargets,
    musicSpan,
    postSecondsAtBar,
    trackSecondsAt,
    type MusicPlacement,
  } from "$lib/shared/media-composition/domain/music-grid";
  import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
  import { POST_MUSIC_MIN_SECONDS } from "$lib/shared/media-composition/domain/post-music-edits";
  import {
    placeDraggedMusic,
    roundToFrameSeconds,
    snapToTargets,
  } from "./post-timeline-geometry";

  /**
   * The music's row on the timeline: its waveform, bars and beats, and the
   * drags that move it, trim it and set where bar 1 falls. The parent owns
   * the edits. This hands back post seconds as the pointer moves, except bar
   * 1, which it reports in the file's own seconds.
   */
  interface Props {
    music: PostMusic;
    pixelsPerSecond: number;
    selected: boolean;
    /** Where an edge or bar 1 may snap: zero, the playhead and the clips' edges. */
    snapTargets: () => number[];
    onSelect: () => void;
    onGestureStart: () => void;
    onGestureEnd: () => void;
    onGestureCancel: () => void;
    onMove: (startSeconds: number) => void;
    onTrim: (edge: "start" | "end", postSeconds: number) => void;
    /** Where bar 1 now falls, in the file's own seconds. */
    onMoveDownbeat: (downbeatSeconds: number) => void;
    onSnapGuide: (seconds: number | null) => void;
  }

  let {
    music,
    pixelsPerSecond,
    selected,
    snapTargets,
    onSelect,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
    onMove,
    onTrim,
    onMoveDownbeat,
    onSnapGuide,
  }: Props = $props();

  const DRAG_THRESHOLD_PX = 4;
  /** Beats closer together than this are left out of the lane. Bars stay. */
  const BEAT_LINE_MIN_PX = 6;
  const WAVE_HEIGHT_PX = 40;
  /**
   * The waveform is drawn at no more than this many pixels per second and
   * stretched past it, so zooming in on a long song never draws dozens of
   * screen-wide canvases.
   */
  const WAVE_MAX_PIXELS_PER_SECOND = 100;

  type DragKind = "move" | "start" | "end" | "downbeat";

  interface MusicDrag {
    kind: DragKind;
    pointerId: number;
    startClientX: number;
    didDrag: boolean;
    /** The dragged time when the drag began, in post seconds. */
    from: number;
    /** Where it is now, snapped and clamped. */
    to: number;
    pixelsPerSecond: number;
    targets: number[];
    /** The music when the drag began. The live one changes under the drag. */
    music: PostMusic;
    frame: number | null;
  }

  let drag: MusicDrag | null = null;
  let waveEl = $state<HTMLDivElement | null>(null);

  const span = $derived(musicSpan(music));
  const leftPx = $derived(span.start * pixelsPerSecond);
  const widthPx = $derived((span.end - span.start) * pixelsPerSecond);
  const wavePixelsPerSecond = $derived(
    Math.min(pixelsPerSecond, WAVE_MAX_PIXELS_PER_SECOND)
  );
  const lines = $derived.by(() => {
    const gridded = music;
    if (!hasGrid(gridded)) return [];
    const beats =
      beatSeconds(gridded.grid) * pixelsPerSecond >= BEAT_LINE_MIN_PX;
    return musicGridLines(gridded, span.start, span.end).filter(
      (line) => beats || line.downbeat
    );
  });
  const barOneSeconds = $derived(barOneAt(music));
  // The file's 0 s sits sourceIn before the clip's left edge.
  const waveStyle = $derived(
    `left: ${-music.sourceInSeconds * pixelsPerSecond}px; ` +
      `width: ${music.durationSeconds * wavePixelsPerSecond}px; ` +
      `transform: scaleX(${pixelsPerSecond / wavePixelsPerSecond})`
  );
  const bodyLabel = $derived(
    `Music: ${music.label}, ${formatPostClock(span.start)} to ${formatPostClock(span.end)}`
  );
  const url = $derived(music.url);

  /** Bar 1 on the post's clock, or null when the music doesn't sound it. */
  function barOneAt(placed: PostMusic): number | null {
    if (!hasGrid(placed)) return null;
    const seconds = postSecondsAtBar(placed, 1);
    const { start, end } = musicSpan(placed);
    return seconds >= start - POST_TIME_EPSILON &&
      seconds <= end + POST_TIME_EPSILON
      ? seconds
      : null;
  }

  /** The whole file laid on the post's clock, for the bars a trim can reach. */
  function wholeFile(placed: PostMusic): MusicPlacement {
    return {
      ...placed,
      startSeconds: placed.startSeconds - placed.sourceInSeconds,
      sourceInSeconds: 0,
      sourceOutSeconds: placed.durationSeconds,
    };
  }

  $effect(() => {
    const container = waveEl;
    const source = url;
    if (!container) return;
    let cancelled = false;
    let wave: { destroy(): void } | null = null;
    void import("wavesurfer.js")
      .then(({ default: WaveSurfer }) => {
        if (cancelled) return;
        const color = getComputedStyle(container).color || "#ffffff";
        wave = WaveSurfer.create({
          container,
          url: source,
          height: WAVE_HEIGHT_PX,
          waveColor: color,
          progressColor: color,
          cursorWidth: 0,
          interact: false,
          autoScroll: false,
          autoCenter: false,
          hideScrollbar: true,
          fillParent: true,
          normalize: true,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
        });
      })
      .catch(() => {
        // Without its waveform the lane still shows the music's place and grid.
      });
    return () => {
      cancelled = true;
      wave?.destroy();
    };
  });

  function beginDrag(event: PointerEvent, kind: DragKind): void {
    if (event.button !== 0) return;
    // The row underneath clears the selection on its own pointerdown.
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const from =
      kind === "move"
        ? music.startSeconds
        : kind === "start"
          ? span.start
          : kind === "end"
            ? span.end
            : (barOneSeconds ?? span.start);
    const others = snapTargets();
    // An edge or bar 1 may also land on the song's own bars and beats, so a
    // trim ends on the beat and bar 1 moves by whole beats, keeping the beat
    // that tapping along found. The whole file's, since a trim reaches past
    // what plays now.
    const ownBeats = musicSnapTargets(wholeFile(music), pixelsPerSecond);
    drag = {
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      didDrag: false,
      from,
      to: from,
      pixelsPerSecond,
      targets: kind === "move" ? others : [...others, ...ownBeats],
      music,
      frame: null,
    };
  }

  function place(
    state: MusicDrag,
    raw: number
  ): { seconds: number; guide: number | null } {
    const placed = state.music;
    const { start, end } = musicSpan(placed);
    if (state.kind === "move") {
      const anchors = [0, end - start];
      const barOne = barOneAt(placed);
      if (barOne !== null) anchors.push(barOne - start);
      const moved = placeDraggedMusic(
        raw,
        anchors,
        state.targets,
        state.pixelsPerSecond
      );
      return { seconds: moved.start, guide: moved.guideSeconds };
    }
    const snapped = snapToTargets(raw, state.targets, state.pixelsPerSecond);
    const free =
      snapped.snappedToSeconds === null
        ? roundToFrameSeconds(raw)
        : snapped.seconds;
    const [low, high] =
      state.kind === "start"
        ? [
            Math.max(0, start - placed.sourceInSeconds),
            end - POST_MUSIC_MIN_SECONDS,
          ]
        : state.kind === "end"
          ? [
              start + POST_MUSIC_MIN_SECONDS,
              start + (placed.durationSeconds - placed.sourceInSeconds),
            ]
          : [start, end];
    const seconds = Math.min(high, Math.max(low, free));
    // A clamp can pull the edge back off its target; the guide shows only on it.
    const onTarget =
      snapped.snappedToSeconds !== null &&
      Math.abs(seconds - snapped.snappedToSeconds) < POST_TIME_EPSILON;
    return { seconds, guide: onTarget ? snapped.snappedToSeconds : null };
  }

  function emit(state: MusicDrag): void {
    if (state.kind === "move") onMove(state.to);
    else if (state.kind === "downbeat")
      onMoveDownbeat(trackSecondsAt(state.music, state.to));
    else onTrim(state.kind, state.to);
  }

  function finish(): void {
    const state = drag;
    drag = null;
    if (!state) return;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    if (state.didDrag) onSnapGuide(null);
  }

  function handlePointerMove(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    const deltaPx = event.clientX - state.startClientX;
    if (!state.didDrag) {
      if (Math.abs(deltaPx) < DRAG_THRESHOLD_PX) return;
      state.didDrag = true;
      if (!selected) onSelect();
      onGestureStart();
    }
    const placed = place(state, state.from + deltaPx / state.pixelsPerSecond);
    state.to = placed.seconds;
    onSnapGuide(placed.guide);
    if (state.frame === null)
      state.frame = requestAnimationFrame(() => {
        state.frame = null;
        if (drag === state) emit(state);
      });
  }

  function handlePointerUp(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.didDrag) {
      // A drag back to where it began changes nothing.
      if (Math.abs(state.to - state.from) < POST_TIME_EPSILON)
        onGestureCancel();
      else {
        emit(state);
        onGestureEnd();
      }
    }
    finish();
  }

  function handlePointerCancel(event: PointerEvent): void {
    const state = drag;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.didDrag) onGestureCancel();
    finish();
  }

  // Runs while the key is on its way down, before the editor's own Escape
  // (which clears the selection), and keeps the key to the drag it cancels.
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.didDrag) onGestureCancel();
    finish();
  }
</script>

<svelte:window
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  onkeydowncapture={handleKeydown}
/>

<div class="music-lane">
  <div
    class="music-clip"
    class:selected
    style="left: {leftPx}px; width: {Math.max(widthPx, 2)}px"
  >
    <div
      class="wave"
      bind:this={waveEl}
      aria-hidden="true"
      style={waveStyle}
    ></div>
    {#each lines as line (line.seconds)}
      <span
        class="grid-line"
        class:bar={line.downbeat}
        style="left: {(line.seconds - span.start) * pixelsPerSecond}px"
        aria-hidden="true"
      ></span>
    {/each}
    <button
      type="button"
      class="music-body"
      aria-pressed={selected}
      aria-label={bodyLabel}
      onpointerdown={(event) => beginDrag(event, "move")}
      onclick={onSelect}
    >
      <i class="fa-solid fa-music" aria-hidden="true"></i>
      <span class="music-label">{music.label}</span>
    </button>
  </div>

  {#if selected}
    <button
      type="button"
      class="trim-handle"
      style="left: {leftPx}px"
      aria-label="Trim the music's start"
      onpointerdown={(event) => beginDrag(event, "start")}
    >
      <span class="handle-grip" aria-hidden="true"></span>
    </button>
    <button
      type="button"
      class="trim-handle"
      style="left: {leftPx + widthPx}px"
      aria-label="Trim the music's end"
      onpointerdown={(event) => beginDrag(event, "end")}
    >
      <span class="handle-grip" aria-hidden="true"></span>
    </button>
    {#if barOneSeconds !== null}
      <button
        type="button"
        class="bar-one"
        style="left: {barOneSeconds * pixelsPerSecond}px"
        aria-label="Move bar 1"
        onpointerdown={(event) => beginDrag(event, "downbeat")}
      >
        <span class="flag" aria-hidden="true">1</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  /* Lays its parts straight into the row, and gives them one tint. */
  .music-lane {
    display: contents;
    --music-tint: #5fd38d;
  }

  .music-clip {
    position: absolute;
    top: 3px;
    bottom: 3px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.5rem;
    background: color-mix(
      in srgb,
      var(--music-tint) 18%,
      var(--theme-card-bg, #1c1c26)
    );
  }

  .music-clip.selected {
    border-color: var(--theme-accent);
    box-shadow: inset 0 0 0 2px var(--theme-accent);
  }

  .wave {
    position: absolute;
    top: 4px;
    height: 40px;
    transform-origin: 0 50%;
    color: var(--theme-text, #fff);
    opacity: 0.45;
    pointer-events: none;
  }

  .grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--theme-text, #fff) 18%, transparent);
    pointer-events: none;
  }

  .grid-line.bar {
    width: 2px;
    translate: -0.5px 0;
    background: color-mix(in srgb, var(--music-tint) 75%, transparent);
  }

  .music-body {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    gap: 0.35rem;
    min-width: 0;
    padding: 0.3rem 0.5rem;
    border: 0;
    background: transparent;
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: var(--font-size-compact, 0.75rem);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  /* A swipe across the timeline scrolls it. Once the music is selected, a
     drag on it moves it instead. */
  .music-clip.selected .music-body {
    touch-action: none;
  }

  .music-body:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }

  .music-body i {
    flex-shrink: 0;
    font-size: 0.85em;
    opacity: 0.85;
  }

  .music-label {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .trim-handle {
    position: absolute;
    top: 3px;
    bottom: 3px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translateX(-50%);
  }

  .handle-grip {
    width: 4px;
    height: min(60%, 2rem);
    border-radius: 999px;
    background: var(--theme-accent);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-text, #fff) 40%, transparent);
  }

  .trim-handle:focus-visible .handle-grip {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .bar-one {
    position: absolute;
    top: 0;
    z-index: 3;
    display: flex;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    touch-action: none;
    transform: translateX(-50%);
  }

  .flag {
    display: grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    margin-top: 2px;
    border-radius: 0.25rem;
    background: var(--music-tint);
    color: #0b1a10;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .bar-one:focus-visible .flag {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-timeline-geometry-music.test.ts tests/unit/media-composition/post-timeline-music-lane.test.ts tests/unit/media-composition/post-timeline-geometry.test.ts`

Expected: PASS. The geometry file has 6 tests and the lane file 14; the existing `post-timeline-geometry.test.ts` passes unchanged.

- [ ] **Step 6: Let a row go without hide and lock**

In `src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte`:

**Edit 1.** Hide and lock become optional. Find:

```svelte
  interface Props {
    name: string;
    hidden: boolean;
    locked: boolean;
    heightPx: number;
    onToggleHidden: () => void;
    onToggleLocked: () => void;
  }

  let { name, hidden, locked, heightPx, onToggleHidden, onToggleLocked }: Props =
    $props();
```

Replace it with:

```svelte
  interface Props {
    name: string;
    hidden?: boolean;
    locked?: boolean;
    heightPx: number;
    /** A row without these, such as the music's, shows no hide or lock. */
    onToggleHidden?: () => void;
    onToggleLocked?: () => void;
  }

  let {
    name,
    hidden = false,
    locked = false,
    heightPx,
    onToggleHidden,
    onToggleLocked,
  }: Props = $props();
```

**Edit 2.** Show the two buttons only for a row that has them. Find:

```svelte
  <div class="track-toggles">
    <button
      type="button"
      class="track-toggle"
      class:active={hidden}
      aria-pressed={hidden}
      aria-label={t(
        hidden ? "post_timeline_show_track" : "post_timeline_hide_track",
        { track: name }
      )}
      onclick={onToggleHidden}
    >
      <i
        class="fa-solid {hidden ? 'fa-eye-slash' : 'fa-eye'}"
        aria-hidden="true"
      ></i>
    </button>
    <button
      type="button"
      class="track-toggle"
      class:active={locked}
      aria-pressed={locked}
      aria-label={t(
        locked ? "post_timeline_unlock_track" : "post_timeline_lock_track",
        { track: name }
      )}
      onclick={onToggleLocked}
    >
      <i
        class="fa-solid {locked ? 'fa-lock' : 'fa-lock-open'}"
        aria-hidden="true"
      ></i>
    </button>
  </div>
</div>
```

Replace it with:

```svelte
  {#if onToggleHidden && onToggleLocked}
    <div class="track-toggles">
      <button
        type="button"
        class="track-toggle"
        class:active={hidden}
        aria-pressed={hidden}
        aria-label={t(
          hidden ? "post_timeline_show_track" : "post_timeline_hide_track",
          { track: name }
        )}
        onclick={onToggleHidden}
      >
        <i
          class="fa-solid {hidden ? 'fa-eye-slash' : 'fa-eye'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="track-toggle"
        class:active={locked}
        aria-pressed={locked}
        aria-label={t(
          locked ? "post_timeline_unlock_track" : "post_timeline_lock_track",
          { track: name }
        )}
        onclick={onToggleLocked}
      >
        <i
          class="fa-solid {locked ? 'fa-lock' : 'fa-lock-open'}"
          aria-hidden="true"
        ></i>
      </button>
    </div>
  {/if}
</div>
```

- [ ] **Step 7: Put the music's row in the timeline**

In `src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte`:

**Edit 1.** Import the beat grid's helpers. Find:

```svelte
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
```

Replace it with:

```svelte
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import {
    hasGrid,
    musicBarMarks,
    musicSnapTargets,
    musicSpan,
  } from "$lib/shared/media-composition/domain/music-grid";
```

**Edit 2.** Import the lane. Find:

```svelte
  import PostTimelineKeyLaneHeader from "./PostTimelineKeyLaneHeader.svelte";
```

Replace it with:

```svelte
  import PostTimelineKeyLaneHeader from "./PostTimelineKeyLaneHeader.svelte";
  import PostTimelineMusicLane from "./PostTimelineMusicLane.svelte";
```

**Edit 3.** Add the music's props at the end of `Props`. They are optional, so other callers need no change. Find:

```svelte
    pixelsPerSecond?: number;
  }
```

Replace it with:

```svelte
    pixelsPerSecond?: number;
    /** The music under the post is selected. */
    musicSelected?: boolean;
    onSelectMusic?: () => void;
    /** Where the music now starts on the post's clock. */
    onMoveMusic?: (startSeconds: number) => void;
    onTrimMusic?: (edge: "start" | "end", postSeconds: number) => void;
    /** Where bar 1 now falls, in the music file's own seconds. */
    onMoveDownbeat?: (downbeatSeconds: number) => void;
  }
```

**Edit 4.** Take them from the props, with nothing selected by default. Find:

```svelte
    pixelsPerSecond = $bindable(POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND),
```

Replace it with:

```svelte
    pixelsPerSecond = $bindable(POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND),
    musicSelected = false,
    onSelectMusic,
    onMoveMusic,
    onTrimMusic,
    onMoveDownbeat,
```

**Edit 5.** The music's row height, after the key lane's. Find:

```svelte
  const KEY_LANE_HEIGHT_PX = 44;
```

Replace it with:

```svelte
  const KEY_LANE_HEIGHT_PX = 44;
  /** The music's row, under the tracks. */
  const MUSIC_ROW_HEIGHT_PX = 52;
```

**Edit 6.** The lanes are as wide as the music too, and the ruler numbers its bars. Find:

```svelte
  const contentWidthPx = $derived(
    Math.max(
      lanesViewportWidthPx,
      secondsToPixels(durationSeconds, pixelsPerSecond) + TRAILING_PADDING_PX,
      dragExtensionPx
    )
  );
```

Replace it with:

```svelte
  /** Music may run past the post's end; its lane shows all of it. */
  const contentEndSeconds = $derived(
    Math.max(durationSeconds, project.music ? musicSpan(project.music).end : 0)
  );
  const contentWidthPx = $derived(
    Math.max(
      lanesViewportWidthPx,
      secondsToPixels(contentEndSeconds, pixelsPerSecond) + TRAILING_PADDING_PX,
      dragExtensionPx
    )
  );
  /** Bar numbers on the ruler while the music has a beat grid. */
  const barMarks = $derived.by(() => {
    const music = project.music;
    return music && hasGrid(music) ? musicBarMarks(music, pixelsPerSecond) : [];
  });
```

**Edit 7.** Clips snap to the music's edges, bars and beats as well; the music's own lane snaps to the clips. Find:

```svelte
  function collectSnapTargets(excludeItemIds: ReadonlySet<string>): number[] {
    const targets = new Set<number>([0, playheadSeconds]);
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (excludeItemIds.has(item.id)) continue;
        targets.add(item.start);
        targets.add(itemEnd(item));
      }
    }
    return Array.from(targets);
  }
```

Replace it with:

```svelte
  /** Zero, the playhead and the clips' edges: where the music's lane snaps. */
  function clipSnapTargets(excludeItemIds: ReadonlySet<string>): number[] {
    const targets = new Set<number>([0, playheadSeconds]);
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (excludeItemIds.has(item.id)) continue;
        targets.add(item.start);
        targets.add(itemEnd(item));
      }
    }
    return Array.from(targets);
  }

  /** Where a clip snaps: those, plus the music's edges, bars and beats. */
  function collectSnapTargets(excludeItemIds: ReadonlySet<string>): number[] {
    const targets = clipSnapTargets(excludeItemIds);
    return project.music
      ? [...targets, ...musicSnapTargets(project.music, pixelsPerSecond)]
      : targets;
  }
```

**Edit 8.** The ruler shows the bar numbers. Find:

```svelte
            tickInterval={rulerTickInterval(pixelsPerSecond)}
```

Replace it with:

```svelte
            tickInterval={rulerTickInterval(pixelsPerSecond)}
            marks={barMarks}
```

**Edit 9.** The music's header, after the tracks' headers. Find:

```svelte
            {/each}
          {/if}
        {/each}
      </div>
    </div>

    <div class="scroll-column">
```

Replace it with:

```svelte
            {/each}
          {/if}
        {/each}
        {#if project.music}
          <PostTimelineTrackHeader
            name="Music"
            heightPx={MUSIC_ROW_HEIGHT_PX}
          />
        {/if}
      </div>
    </div>

    <div class="scroll-column">
```

**Edit 10.** The music's lane, after the tracks' lanes. Find:

```svelte
              {/each}
            {/if}
          {/each}

          {#if (dragState?.kind === "move-main" || dragState?.kind === "move-overlay") && dragState.didDrag}
```

Replace it with:

```svelte
              {/each}
            {/if}
          {/each}

          {#if project.music}
            <div
              class="lane-row"
              style="height: {MUSIC_ROW_HEIGHT_PX}px"
              role="group"
              aria-label="Music"
              onpointerdown={handleLaneBackgroundPointerDown}
            >
              <PostTimelineMusicLane
                music={project.music}
                {pixelsPerSecond}
                selected={musicSelected}
                snapTargets={() => clipSnapTargets(new Set())}
                onSelect={() => onSelectMusic?.()}
                {onGestureStart}
                {onGestureEnd}
                {onGestureCancel}
                onMove={(startSeconds) => onMoveMusic?.(startSeconds)}
                onTrim={(edge, seconds) => onTrimMusic?.(edge, seconds)}
                onMoveDownbeat={(seconds) => onMoveDownbeat?.(seconds)}
                onSnapGuide={(seconds) => (snapGuideSeconds = seconds)}
              />
            </div>
          {/if}

          {#if (dragState?.kind === "move-main" || dragState?.kind === "move-overlay") && dragState.didDrag}
```

- [ ] **Step 8: Hand the timeline the music**

In `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`:

**Edit 1.** Import the music's trim. Find:

```svelte
    removeMusic,
    updateMusic,
```

Replace it with:

```svelte
    removeMusic,
    trimMusic,
    updateMusic,
```

**Edit 2.** Picking a clip lets go of the music. Find:

```svelte
          onSelect={(itemId) => (editor.selectedItemId = itemId)}
```

Replace it with:

```svelte
          onSelect={(itemId) => {
            musicSelected = false;
            editor.selectedItemId = itemId;
          }}
```

**Edit 3.** Hand the timeline the music's selection and its three drags. Each drag's steps make one undo step, as a clip's do. Find:

```svelte
          onAddVideo={pickDeviceVideo}
          bind:pixelsPerSecond
```

Replace it with:

```svelte
          onAddVideo={pickDeviceVideo}
          {musicSelected}
          onSelectMusic={selectMusic}
          onMoveMusic={(startSeconds) =>
            applyMove((project, context) =>
              updateMusic(project, { startSeconds }, context)
            )}
          onTrimMusic={(edge, seconds) =>
            applyMove((project, context) =>
              trimMusic(project, edge, seconds, context)
            )}
          onMoveDownbeat={(downbeatSeconds) =>
            applyMove((project, context) =>
              updateMusic(project, { downbeatSeconds }, context)
            )}
          bind:pixelsPerSecond
```

- [ ] **Step 9: Check that the changed components compile**

```bash
node - src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte <<'EOF'
const fs = require("node:fs");
const { compile } = require("svelte/compiler");
for (const file of process.argv.slice(2)) {
  compile(fs.readFileSync(file, "utf8"), { filename: file, generate: "client" });
  console.log(`compiled ${file}`);
}
EOF
```

Expected: one `compiled` line per file. Task 17 drags the lane in a browser at seven sizes.

- [ ] **Step 10: Format and commit**

`post-timeline-geometry.ts` and `PostTimelineTrackHeader.svelte` are two of the four files that skip prettier; check their diffs instead.

```bash
npx prettier --write src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-timeline-geometry-music.test.ts tests/unit/media-composition/music-lane-harness.svelte.ts tests/unit/media-composition/post-timeline-music-lane.test.ts
git diff src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte
```

Expected: the geometry diff only adds `placeDraggedMusic` and its doc comment; the header diff only makes the four props optional and wraps the two buttons in `{#if onToggleHidden && onToggleLocked}`.

```bash
git add src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-timeline-geometry-music.test.ts tests/unit/media-composition/music-lane-harness.svelte.ts tests/unit/media-composition/post-timeline-music-lane.test.ts
git commit -m "The music's lane under the timeline's tracks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte src/lib/shared/share/components/post-studio/editor/timeline/post-timeline-geometry.ts src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineTrackHeader.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimeline.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte tests/unit/media-composition/post-timeline-geometry-music.test.ts tests/unit/media-composition/music-lane-harness.svelte.ts tests/unit/media-composition/post-timeline-music-lane.test.ts
```

---

### Task 13: add-music, music and bar times on the command line

The agent reaches the music through `scripts/post-project.mjs`, which plan 1 built: its commands turn into named ops, which go to the open editor through the bridge or to the project file on disk. This task adds:

- `add-music <file> --feature SLUG [--label] [--artist] [--license]`: probes the file with ffprobe, copies a 16 or 24-bit PCM WAV at 44.1 or 48 kHz into the feature video's `media/music/` as it is, converts anything else to a 16-bit 48 kHz stereo WAV, and sends `add-music` with the file's URL and length. It prints `{ media, converted, edit }`.
- `music` with `--start`, `--from`, `--to`, `--gain`, `--fade-in`, `--fade-out`, `--bpm` (a number, or `none` to remove the grid), `--downbeat`, `--beats-per-bar`, `--label`, `--artist` and `--license`.
- `remove-music`, and `sync-to-music --item ID --offset S`.
- Times as bars: `--start`, `--from`, `--to`, `--at` and `--seconds` take seconds (`12.5`), a clock (`1:02.5`) or a bar (`@9` is bar 9, `@9.3` is bar 9, beat 3), parsed by `time-args.mjs`. A bar stays a bar until the op places it on the music's grid.

Number flags now refuse what is not a number before anything is sent. `safeMediaName` in plan 1's `media-import.mjs` learns the extension and the fallback name, so the music's import shares it, and folds a run of spaces and dashes into one dash.

**Files:**
- Create: `scripts/feature-video/time-args.mjs`
- Create: `scripts/feature-video/music-import.mjs`
- Modify: `scripts/post-project.mjs` (imports, the op builders, the flag parser, the `add-music` command and the usage text)
- Modify: `scripts/feature-video/media-import.mjs` (`safeMediaName`, and `runFfmpeg` exported)
- Test: `tests/unit/media-composition/feature-video-music-import.test.ts`, `tests/unit/media-composition/post-project-cli-music.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/feature-video-music-import.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importMusic,
  musicTranscodeArgs,
  playsAsIs,
  probeMusic,
  readMusicProbe,
} from "../../../scripts/feature-video/music-import.mjs";
import {
  safeMediaName,
  toolPath,
} from "../../../scripts/feature-video/media-import.mjs";
import { parseTimeArg } from "../../../scripts/feature-video/time-args.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

describe("times on the command line", () => {
  it("reads seconds, clocks and bars", () => {
    expect(parseTimeArg("12.5", "at")).toBe(12.5);
    expect(parseTimeArg(".5", "at")).toBe(0.5);
    expect(parseTimeArg("1:02.5", "at")).toBe(62.5);
    expect(parseTimeArg("0:12.5", "at")).toBe(12.5);
    expect(parseTimeArg("@9", "at")).toEqual({ bar: 9 });
    expect(parseTimeArg("@9.3", "at")).toEqual({ bar: 9, beat: 3 });
    expect(parseTimeArg(" @0 ", "at")).toEqual({ bar: 0 });
  });

  it.each(["", "soon", "1:75", "-2", "@", "@9.", "@x", "1e3"])(
    "refuses %j",
    (text) => {
      expect(() => parseTimeArg(text, "at")).toThrow(
        "--at must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3."
      );
    }
  );
});

describe("reading a music file", () => {
  it("keeps its sound's codec, rate and channels", () => {
    expect(
      readMusicProbe(
        {
          format: { duration: "96.5" },
          streams: [
            { codec_type: "video", codec_name: "mjpeg" },
            {
              codec_type: "audio",
              codec_name: "mp3",
              sample_rate: "44100",
              channels: 2,
            },
          ],
        },
        "Derail.mp3"
      )
    ).toEqual({
      durationSeconds: 96.5,
      codec: "mp3",
      sampleRate: 44100,
      channels: 2,
    });
    expect(() =>
      readMusicProbe(
        { format: { duration: "3" }, streams: [{ codec_type: "video" }] },
        "clip.mp4"
      )
    ).toThrow("clip.mp4 has no sound.");
  });

  it("copies plain 44.1 or 48 kHz PCM WAV and converts the rest", () => {
    const pcm = {
      durationSeconds: 1,
      codec: "pcm_s16le",
      sampleRate: 48000,
      channels: 2,
    };
    expect(playsAsIs(pcm, "a.wav")).toBe(true);
    expect(playsAsIs({ ...pcm, codec: "pcm_s24le" }, "a.WAV")).toBe(true);
    expect(playsAsIs({ ...pcm, sampleRate: 44100 }, "a.wav")).toBe(true);
    expect(playsAsIs({ ...pcm, sampleRate: 96000 }, "a.wav")).toBe(false);
    expect(playsAsIs({ ...pcm, codec: "pcm_f32le" }, "a.wav")).toBe(false);
    expect(playsAsIs({ ...pcm, channels: 6 }, "a.wav")).toBe(false);
    expect(playsAsIs(pcm, "a.aiff")).toBe(false);
    expect(musicTranscodeArgs("in.mp3", "out.wav")).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-y",
      "-i",
      "in.mp3",
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "out.wav",
    ]);
  });

  it("names music files like takes, as .wav", () => {
    expect(safeMediaName("Derail - Yellowbase.mp3", ".wav", "music")).toBe(
      "derail-yellowbase.wav"
    );
    expect(safeMediaName("!!!.flac", ".wav", "music")).toBe("music.wav");
    expect(safeMediaName("IMG_1.MOV")).toBe("img_1.mp4");
  });
});

describe("importing music", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-music-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function tone(name: string, codec: string[]): string {
    const file = path.join(dir, name);
    execFileSync(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "1",
      ...codec,
      file,
    ]);
    return file;
  }

  it.skipIf(!hasFfmpeg)("copies a 44.1 kHz WAV byte for byte", async () => {
    const source = tone("Derail.wav", ["-c:a", "pcm_s16le"]);
    const folder = path.join(dir, "media", "music");
    const music = await importMusic(source, folder);
    expect(music).toMatchObject({
      relativePath: "music/derail.wav",
      transcoded: false,
    });
    expect(music.durationSeconds).toBeCloseTo(1, 2);
    expect(await fs.readFile(path.join(folder, "derail.wav"))).toEqual(
      await fs.readFile(source)
    );
  });

  it.skipIf(!hasFfmpeg)(
    "converts compressed music to 48 kHz stereo WAV under a free name",
    async () => {
      const source = tone("Fly Away.m4a", ["-c:a", "aac"]);
      const folder = path.join(dir, "media", "music");
      const first = await importMusic(source, folder);
      const second = await importMusic(source, folder);
      expect(first).toMatchObject({
        relativePath: "music/fly-away.wav",
        transcoded: true,
      });
      expect(second.relativePath).toBe("music/fly-away-2.wav");
      expect(await probeMusic(path.join(folder, "fly-away.wav"))).toMatchObject(
        {
          codec: "pcm_s16le",
          sampleRate: 48000,
          channels: 2,
        }
      );
      expect((await fs.readdir(folder)).sort()).toEqual([
        "fly-away-2.wav",
        "fly-away.wav",
      ]);
    }
  );
});
```

Create `tests/unit/media-composition/post-project-cli-music.test.ts`. Tasks 14 and 15 add to it.

```ts
/**
 * The command line's music commands, run against a stand-in for the dev
 * server: what each sends, what each refuses before sending anything, and
 * the files each reads or writes in the feature video's folder.
 */
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
const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** The parts of a post these commands read. */
interface StandInProject {
  tracks: { items: { id: string; kind: string; takeId?: string }[] }[];
  takes: {
    id: string;
    ref: { kind: "linked"; url: string } | { kind: "catalog"; videoId: string };
  }[];
  music?: { url: string; gain: number };
}

let server: http.Server;
let url: string;
/** Holds every feature video's folder, as the dev server's does. */
let root: string;
let folder: string;
let project: StandInProject;
let calls: { method: string; path: string; body: unknown }[];

/** A dev server stand-in: no editor is open, so edits go to the file. */
beforeEach(async () => {
  calls = [];
  project = { tracks: [{ items: [] }], takes: [] };
  root = await fs.mkdtemp(path.join(os.tmpdir(), "feature-cli-music-"));
  folder = path.join(root, "promo");
  await fs.mkdir(folder);
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
          return send(200, { sessions: [] });
        case "GET /api/dev/feature-videos/promo":
          return send(200, { file: { project }, fingerprint: "f", folder });
        case "POST /api/dev/feature-videos/promo/ops":
          return send(200, { status: "applied", revision: 2 });
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
  await fs.rm(root, { recursive: true, force: true });
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

/** Every edit sent to the feature video's file, in order. */
const sent = () =>
  posts().flatMap(([, body]) => (body as { ops: unknown[] }).ops);

describe("music settings from the command line", () => {
  it("sends the music's settings, with times as bars, clocks or seconds", async () => {
    const result = await cli(
      "music",
      "--feature",
      "promo",
      "--start",
      "@3",
      "--from",
      "0:05.5",
      "--to",
      "@10.3",
      "--gain",
      "0.8",
      "--fade-in",
      "1",
      "--fade-out",
      "2.5",
      "--bpm",
      "85",
      "--downbeat",
      "0.42",
      "--beats-per-bar",
      "3",
      "--label",
      "Derail",
      "--artist",
      "",
      "--license",
      "Epidemic Sound, trial, 2026-10-07"
    );
    expect(result.code).toBe(0);
    expect(posts()).toEqual([
      [
        "/api/dev/feature-videos/promo/ops",
        {
          ops: [
            {
              op: "music",
              startSeconds: { bar: 3 },
              sourceInSeconds: 5.5,
              sourceOutSeconds: { bar: 10, beat: 3 },
              gain: 0.8,
              fadeInSeconds: 1,
              fadeOutSeconds: 2.5,
              bpm: 85,
              downbeatSeconds: 0.42,
              beatsPerBar: 3,
              label: "Derail",
              artist: "",
              license: "Epidemic Sound, trial, 2026-10-07",
            },
          ],
        },
      ],
    ]);
  });

  it("removes the beat grid with --bpm none", async () => {
    const result = await cli("music", "--feature", "promo", "--bpm", "none");
    expect(result.code).toBe(0);
    expect(sent()).toEqual([{ op: "music", bpm: null }]);
  });

  it("refuses a setting that is not a number or a time, before sending anything", async () => {
    const refusals: [string[], string][] = [
      [
        ["--bpm", "fast"],
        "--bpm must be a number, or none to remove the beat grid.",
      ],
      [["--gain", "loud"], "--gain must be a number."],
      [["--fade-in", ""], "--fade-in must be a number."],
      [
        ["--start", "soon"],
        "--start must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3.",
      ],
      [[], "music needs a setting to change, such as --gain 0.8 or --bpm 85."],
    ];
    for (const [flags, message] of refusals) {
      const result = await cli("music", "--feature", "promo", ...flags);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    expect(posts()).toEqual([]);
  });

  it("places titles and trims clips at bars and clocks", async () => {
    await cli("add-titles", "--feature", "promo", "--at", "@5");
    await cli(
      "trim",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--edge",
      "end",
      "--seconds",
      "@3.3"
    );
    await cli(
      "trim",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--edge",
      "start",
      "--seconds",
      "1:02.5"
    );
    expect(sent()).toEqual([
      { op: "add-titles", at: { bar: 5 } },
      { op: "trim", item: "v1", edge: "end", seconds: { bar: 3, beat: 3 } },
      { op: "trim", item: "v1", edge: "start", seconds: 62.5 },
    ]);
  });

  it("removes the music, and puts a clip in time with it at a given offset", async () => {
    await cli("remove-music", "--feature", "promo");
    await cli(
      "sync-to-music",
      "--feature",
      "promo",
      "--item",
      "v1",
      "--offset",
      "-1.25"
    );
    const missing = await cli(
      "sync-to-music",
      "--feature",
      "promo",
      "--item",
      "v1"
    );
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("--offset is required.");
    expect(sent()).toEqual([
      { op: "remove-music" },
      { op: "sync-to-music", item: "v1", offsetSeconds: -1.25 },
    ]);
  });

  it.skipIf(!hasFfmpeg)(
    "copies a music file into the project and adds it",
    async () => {
      const source = path.join(root, "Derail Theme.wav");
      // ffmpeg writes a plain 16-bit WAV, which add-music copies as it is.
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "2",
        source,
      ]);
      const result = await cli(
        "add-music",
        source,
        "--feature",
        "promo",
        "--label",
        "Derail",
        "--artist",
        "Yellowbase"
      );
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        media: "music/derail-theme.wav",
        converted: false,
      });
      const [op] = sent() as { durationSeconds: number }[];
      expect(op).toMatchObject({
        op: "add-music",
        url: "/api/dev/feature-videos/promo/media/music/derail-theme.wav",
        label: "Derail",
        artist: "Yellowbase",
      });
      expect(op?.durationSeconds).toBeCloseTo(2, 2);
      await fs.access(path.join(folder, "media", "music", "derail-theme.wav"));
    }
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-music-import.test.ts tests/unit/media-composition/post-project-cli-music.test.ts`

Expected: FAIL. `feature-video-music-import.test.ts` cannot resolve `../../../scripts/feature-video/music-import.mjs`. All 6 CLI tests fail, since the CLI prints its usage for commands it does not know: three with `expected 1 to be +0` (the exit code), one with `expected 'Usage: post-project.mjs <command> [--…' to contain '--bpm must be a number, or none to re…'`, one with `expected 'Usage: post-project.mjs <command> [--…' to contain '--offset is required.'`, and "places titles and trims clips at bars and clocks" with `expected [ Array(3) ] to deeply equal [ { op: 'add-titles', …(1) }, …(2) ]`.

- [ ] **Step 3: Create the time parser**

Create `scripts/feature-video/time-args.mjs`:

```js
/**
 * A time on the command line: seconds (12.5), a clock (1:02.5), or a bar of
 * the post's music, @9 for bar 9 or @9.3 for bar 9, beat 3. A bar stays a bar
 * here; the edit places it on the music's beat grid.
 */
const BAR = /^@(-?\d+)(?:\.(\d+))?$/;
const CLOCK = /^(?:(\d+):)?(\d+(?:\.\d*)?|\.\d+)$/;

export function parseTimeArg(text, name) {
  const value = String(text ?? "").trim();
  const bar = BAR.exec(value);
  if (bar)
    return bar[2] === undefined
      ? { bar: Number(bar[1]) }
      : { bar: Number(bar[1]), beat: Number(bar[2]) };
  const clock = CLOCK.exec(value);
  if (clock) {
    const seconds = Number(clock[2]);
    if (clock[1] === undefined) return seconds;
    if (seconds < 60) return Number(clock[1]) * 60 + seconds;
  }
  throw new Error(
    `--${name} must be seconds (12.5), a clock (1:02.5), or a bar like @9 or @9.3.`
  );
}
```

- [ ] **Step 4: Share `safeMediaName` and `runFfmpeg`**

In `scripts/feature-video/media-import.mjs`:

**Edit 1.** `safeMediaName` takes the extension and the name to fall back on, so the music's import can use it. Find:

```js
/** A name the media route serves as it is: a-z, 0-9, dash and underscore, then .mp4. */
export function safeMediaName(original) {
```

Replace it with:

```js
/**
 * A name the media route serves as it is: a-z, 0-9, dash and underscore, then
 * `extension`, or `fallback` when nothing of the original name is left.
 */
export function safeMediaName(original, extension = ".mp4", fallback = "take") {
```

**Edit 2.** A run of spaces and dashes becomes one dash, so `Derail - Yellowbase.wav` is `derail-yellowbase.wav`, not `derail---yellowbase.wav`. Find:

```js
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `${stem || "take"}.mp4`;
```

Replace it with:

```js
    .replace(/[^a-z0-9_]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `${stem || fallback}${extension}`;
```

**Edit 3.** Export `runFfmpeg` for the music's import. Find:

```js
function runFfmpeg(args, name) {
```

Replace it with:

```js
export function runFfmpeg(args, name) {
```

- [ ] **Step 5: Create the music import**

Create `scripts/feature-video/music-import.mjs`:

```js
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  runFfmpeg,
  safeMediaName,
  toolPath,
  uniqueMediaPath,
} from "./media-import.mjs";

/**
 * Brings a music file into a feature video's media/music folder as a WAV the
 * browser decodes exactly: 16 or 24-bit PCM at 44.1 or 48 kHz is copied as it
 * is, and anything else (MP3, AAC, FLAC, AIFF, other rates) becomes 16-bit
 * 48 kHz stereo PCM. A compressed file decodes with a codec delay that can
 * differ between browsers and ffmpeg, which would move every beat.
 */

const execFileAsync = promisify(execFile);
const PLAIN_PCM = ["pcm_s16le", "pcm_s24le"];
const PLAIN_RATES = [44100, 48000];

/** What ffprobe's JSON says about a music file, or why it cannot be one. */
export function readMusicProbe(data, name) {
  const streams = Array.isArray(data?.streams) ? data.streams : [];
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error(`${name} has no sound.`);
  const durationSeconds = Number(data?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error(`ffprobe could not tell how long ${name} is.`);
  return {
    durationSeconds,
    codec: audio.codec_name ?? "unknown",
    sampleRate: Number(audio.sample_rate),
    channels: Number(audio.channels),
  };
}

export async function probeMusic(file) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      toolPath("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,sample_rate,channels",
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
  return readMusicProbe(JSON.parse(stdout), path.basename(file));
}

/** True when the file is already a WAV the browser decodes sample for sample. */
export function playsAsIs(probe, file) {
  return (
    path.extname(file).toLowerCase() === ".wav" &&
    PLAIN_PCM.includes(probe.codec) &&
    PLAIN_RATES.includes(probe.sampleRate) &&
    probe.channels >= 1 &&
    probe.channels <= 2
  );
}

/** ffmpeg arguments for the 16-bit 48 kHz stereo WAV copy. */
export function musicTranscodeArgs(input, output) {
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
    "0:a:0",
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    output,
  ];
}

/**
 * Copies or converts `file` into `musicFolder` under a free, safe name.
 * Returns its path inside media/, its length, and whether it was converted.
 */
export async function importMusic(file, musicFolder) {
  const name = path.basename(file);
  const probe = await probeMusic(file);
  const convert = !playsAsIs(probe, file);
  await fs.mkdir(musicFolder, { recursive: true });
  const target = uniqueMediaPath(
    musicFolder,
    safeMediaName(name, ".wav", "music")
  );
  if (convert) {
    const partial = `${target}.partial.wav`;
    try {
      await runFfmpeg(musicTranscodeArgs(file, partial), name);
      await fs.rename(partial, target);
    } catch (cause) {
      await fs.rm(partial, { force: true });
      throw cause;
    }
  } else await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
  const result = convert ? await probeMusic(target) : probe;
  return {
    relativePath: `music/${path.basename(target)}`,
    durationSeconds: result.durationSeconds,
    transcoded: convert,
  };
}
```

- [ ] **Step 6: Add the commands**

In `scripts/post-project.mjs`:

**Edit 1.** Import the music import and the time parser. Find:

```js
import { importTake } from "./feature-video/media-import.mjs";
```

Replace it with:

```js
import { importTake } from "./feature-video/media-import.mjs";
import { importMusic } from "./feature-video/music-import.mjs";
import { parseTimeArg } from "./feature-video/time-args.mjs";
```

**Edit 2.** In the `add-titles` builder, `--at` may name a bar. Find:

```js
    ...number("at"),
```

Replace it with:

```js
    ...time("at"),
```

**Edit 3.** So may `trim`'s `--seconds`. Find:

```js
    seconds: Number(required("seconds")),
```

Replace it with:

```js
    seconds: parseTimeArg(required("seconds"), "seconds"),
```

**Edit 4.** Add the music, remove-music and sync-to-music builders after `remove-take`. Find:

```js
  "remove-take": () => ({ op: "remove-take", take: required("take") }),
```

Replace it with:

```js
  "remove-take": () => ({ op: "remove-take", take: required("take") }),
  music: () => {
    const patch = {
      ...time("start", "startSeconds"),
      ...time("from", "sourceInSeconds"),
      ...time("to", "sourceOutSeconds"),
      ...number("gain"),
      ...number("fade-in", "fadeInSeconds"),
      ...number("fade-out", "fadeOutSeconds"),
      ...bpm(),
      ...number("downbeat", "downbeatSeconds"),
      ...number("beats-per-bar", "beatsPerBar"),
      ...text("label"),
      ...text("artist"),
      ...text("license"),
    };
    if (Object.keys(patch).length === 0)
      throw new Error(
        "music needs a setting to change, such as --gain 0.8 or --bpm 85."
      );
    return { op: "music", ...patch };
  },
  "remove-music": () => ({ op: "remove-music" }),
  "sync-to-music": () => {
    required("offset");
    return {
      op: "sync-to-music",
      item: required("item"),
      offsetSeconds: numberOption("offset"),
    };
  },
```

**Edit 5.** Number flags now refuse what is not a number, and may file their value under another key. Add the time, text and bpm flags. Find:

```js
function number(name) {
  return option(name) === undefined ? {} : { [name]: Number(option(name)) };
}
```

Replace it with:

```js
/** A number flag's value, or undefined when the flag is absent. */
function numberOption(name) {
  const value = option(name);
  if (value === undefined) return undefined;
  // JSON would send NaN as null, which some edits read as "remove".
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error(`--${name} must be a number.`);
  return Number(value);
}
function number(name, key = name) {
  const value = numberOption(name);
  return value === undefined ? {} : { [key]: value };
}
/** A time flag: seconds, a clock, or a bar of the music such as @9.3. */
function time(name, key = name) {
  const value = option(name);
  return value === undefined ? {} : { [key]: parseTimeArg(value, name) };
}
/** A text flag; an empty one removes an artist or license. */
function text(name) {
  const value = option(name);
  return value === undefined ? {} : { [name]: value };
}
/** --bpm: a tempo, or none to remove the beat grid. */
function bpm() {
  const value = option("bpm");
  if (value === undefined) return {};
  if (value === "none") return { bpm: null };
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error("--bpm must be a number, or none to remove the beat grid.");
  return { bpm: Number(value) };
}
```

**Edit 6.** The `add-music` command, before `duplicate`. Find:

```js
  } else if (command === "duplicate") {
```

Replace it with:

```js
  } else if (command === "add-music") {
    const feature = required("feature");
    const file = path.resolve(positional(0, "a music file"));
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    const music = await importMusic(file, path.join(folder, "media", "music"));
    result = {
      media: music.relativePath,
      converted: music.transcoded,
      edit: await sendOps([
        {
          op: "add-music",
          url: featureMediaUrl(feature, music.relativePath),
          durationSeconds: music.durationSeconds,
          ...text("label"),
          ...text("artist"),
          ...text("license"),
        },
      ]),
    };
  } else if (command === "duplicate") {
```

**Edit 7.** In the usage text, `--at` is a time. Find:

```js
  add-titles [--spoken "how to say it"] [--at N]   name titles clip, over the opening tunnel when there is one
```

Replace it with:

```js
  add-titles [--spoken "how to say it"] [--at T]   name titles clip, over the opening tunnel when there is one
```

**Edit 8.** So is `--seconds`. Find:

```js
  trim --item ID --edge start|end --seconds N
```

Replace it with:

```js
  trim --item ID --edge start|end --seconds T
```

**Edit 9.** The music commands, after `duplicate`. Find:

```js
  duplicate <slug> <new-slug> [--title "Title"] [--share-media]
```

Replace it with:

```js
  duplicate <slug> <new-slug> [--title "Title"] [--share-media]
  add-music <file> --feature SLUG [--label "Name"] [--artist "Name"] [--license "Library, id, date"]   copies it into media/music; anything but plain WAV becomes 48 kHz WAV
  music [--start T] [--from T] [--to T] [--gain 0.8] [--fade-in S] [--fade-out S] [--bpm 85|none] [--downbeat S] [--beats-per-bar 4] [--label --artist --license]
                               --start is where the music begins in the post; --from and --to are the part of the song that plays
  remove-music
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
  T is seconds (12.5), a clock (1:02.5), or a bar of the music: @9 is bar 9, @9.3 is bar 9, beat 3.
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-music-import.test.ts tests/unit/media-composition/post-project-cli-music.test.ts tests/unit/media-composition/post-project-cli.test.ts tests/unit/media-composition/feature-video-media-import.test.ts`

Expected: PASS with no test skipped. `feature-video-music-import.test.ts` has 14 tests and `post-project-cli-music.test.ts` 6; plan 1's `post-project-cli.test.ts` and `feature-video-media-import.test.ts` pass unchanged.

- [ ] **Step 8: Format and commit**

```bash
npx prettier --write scripts/feature-video/time-args.mjs scripts/feature-video/music-import.mjs scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-music-import.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git add scripts/feature-video/time-args.mjs scripts/feature-video/music-import.mjs scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-music-import.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git commit -m "add-music, music and bar times on the command line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/feature-video/time-args.mjs scripts/feature-video/music-import.mjs scripts/feature-video/media-import.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-music-import.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
```

---

### Task 14: align-take: line takes up with the music from their sound

The promo's takes are shot while the track plays out loud, so each take's own sound holds the music. `align-take` finds where: it decodes the take and the music's file to mono at 8 kHz with ffmpeg (the take's first sample at its picture's 0 s), turns each into a loudness envelope at 200 frames a second (5 ms, well inside a video frame), and compares the rises in loudness (drum hits, note starts) at every offset. `align-take --feature SLUG` reports the offset (the music's own time minus the take's own time at the same moment), a score, a confidence (how far the best match beats the next one, counting matches closer than 0.25 s as one) and the best candidates. A score under 0.15 means the take hardly follows the music; a confidence under 1.5 means several offsets fit, as they do when the music repeats. With `--take ID` it only measures; with `--place ITEM` it also puts that clip in time through `sync-to-music`, unless a warning came up, in which case it leaves the clip alone, prints the candidates and exits 1, so a person picks one with `sync-to-music --offset`.

**Files:**
- Create: `scripts/feature-video/align-take.mjs`
- Modify: `scripts/post-project.mjs` (an import, the no-music message, the `align-take` command and the usage text)
- Test: `tests/unit/media-composition/feature-video-align-take.test.ts`, with shared audio fixtures in `tests/unit/media-composition/feature-video-audio-fixtures.ts`, and four more tests in `tests/unit/media-composition/post-project-cli-music.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the fixtures, `tests/unit/media-composition/feature-video-audio-fixtures.ts`. They write short WAVs and camera takes with ffmpeg:

```ts
/**
 * Made-up sound for the align-take and command line tests: tone bursts at
 * uneven gaps that never repeat, a camera's quieter copy of them, and WAV
 * bytes to write either to disk.
 */

/** A seeded random source, so every run hears the same music. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Short tone bursts at uneven gaps over a quiet floor: music with no repeat. */
export function clickTrack(
  seconds: number,
  rate: number,
  seed = 7
): Float32Array {
  const next = random(seed);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) out[i] = (next() - 0.5) * 0.002;
  for (let at = 0.1; at < seconds - 0.05; at += 0.15 + 0.45 * next()) {
    const start = Math.round(at * rate);
    const length = Math.round(0.03 * rate);
    const level = 0.3 + 0.6 * next();
    for (let i = 0; i < length && start + i < out.length; i += 1)
      out[start + i]! +=
        level * Math.sin((2 * Math.PI * 1000 * i) / rate) * (1 - i / length);
  }
  return out;
}

/** The music from `fromSeconds`, quieter and over room noise, as a camera hears it. */
export function cameraTake(
  music: Float32Array,
  rate: number,
  fromSeconds: number,
  seconds: number
): Float32Array {
  const next = random(99);
  const start = Math.round(fromSeconds * rate);
  return Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) =>
      (start + i >= 0 ? (music[start + i] ?? 0) * 0.3 : 0) +
      (next() - 0.5) * 0.02
  );
}

/** 16-bit mono WAV bytes. */
export function wav(samples: Float32Array, rate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      i * 2
    )
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
```

Create `tests/unit/media-composition/feature-video-align-take.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  alignSignals,
  alignTake,
  loudnessEnvelope,
  mediaPathFromUrl,
  onsetStrength,
} from "../../../scripts/feature-video/align-take.mjs";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";

const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe("loudness envelopes", () => {
  it("measures 1/200 s frames in dB and keeps only the rises", () => {
    const samples = new Float32Array(160);
    samples.fill(0.5, 40, 80);
    const envelope = loudnessEnvelope(samples, 8000);
    expect(envelope).toHaveLength(4);
    expect(envelope[0]).toBeCloseTo(-100, 3);
    expect(envelope[1]).toBeCloseTo(10 * Math.log10(0.25), 3);
    expect(Array.from(onsetStrength(envelope), (v) => Math.round(v))).toEqual([
      0, 94, 0, 0,
    ]);
  });
});

describe("lining a take up with the music", () => {
  const rate = 8000;
  const music = clickTrack(20, rate);

  it("finds a take that starts inside the music", () => {
    const result = alignSignals(
      music,
      cameraTake(music, rate, 3.2037, 10),
      rate
    );
    expect(Math.abs(result.offsetSeconds - 3.2037)).toBeLessThanOrEqual(0.005);
    expect(result.confidence).toBeGreaterThan(1.5);
    expect(result.candidates[0]).toEqual({
      offsetSeconds: result.offsetSeconds,
      score: result.score,
    });
    expect(result).not.toHaveProperty("warning");
  });

  it("finds a take that started before the music", () => {
    const result = alignSignals(music, cameraTake(music, rate, -1, 9), rate);
    expect(Math.abs(result.offsetSeconds + 1)).toBeLessThanOrEqual(0.005);
  });

  it("warns when the take's sound is not the music", () => {
    const other = cameraTake(clickTrack(12, rate, 31337), rate, 0, 10);
    expect(alignSignals(music, other, rate).warning).toBeDefined();
  });

  it("lists the bars that fit when the music repeats", () => {
    // A 2 s intro, then one 2 s bar played six times.
    const bar = clickTrack(2, rate, 11);
    const looped = new Float32Array(14 * rate);
    looped.set(clickTrack(2, rate, 12));
    for (let copy = 1; copy <= 6; copy += 1) looped.set(bar, copy * 2 * rate);
    const result = alignSignals(looped, cameraTake(looped, rate, 6, 5), rate);
    expect(result.warning).toMatch(/^Several offsets fit about as well/);
    expect(result.candidates).toHaveLength(3);
    for (const { offsetSeconds } of result.candidates) {
      expect([2, 4, 6, 8]).toContain(Math.round(offsetSeconds));
      expect(
        Math.abs(offsetSeconds - Math.round(offsetSeconds))
      ).toBeLessThanOrEqual(0.005);
    }
  });
});

describe("media files from their URLs", () => {
  it("finds the file in the folder the URL names", () => {
    expect(
      mediaPathFromUrl(
        "/api/dev/feature-videos/promo/media/music/derail.wav",
        "E:/features"
      )
    ).toBe(path.join("E:/features", "promo", "media", "music", "derail.wav"));
    for (const url of [
      "/api/dev/feature-videos/promo/media/../secret.wav",
      "/api/dev/feature-videos/promo/media/a%2F..%2Fb.wav",
      "https://example.test/x.wav",
    ])
      expect(() => mediaPathFromUrl(url, "E:/features")).toThrow(
        "is not a feature video media URL."
      );
  });
});

describe("aligning real files", () => {
  let dir: string;
  let musicFile: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "align-take-"));
    musicFile = path.join(dir, "music.wav");
    await fs.writeFile(musicFile, wav(clickTrack(12, 48000), 48000));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  /**
   * A 6 s clip filmed while the music played from its 2.5 s, the sound
   * starting `soundLateSeconds` after the picture, as some cameras record it.
   */
  function filmTake(soundLateSeconds: number): string {
    const takeFile = path.join(dir, `take-${soundLateSeconds}.mp4`);
    execFileSync(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x120:rate=30",
      "-itsoffset",
      String(soundLateSeconds),
      "-ss",
      "2.5",
      "-i",
      musicFile,
      "-t",
      "6",
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-af",
      "volume=0.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      takeFile,
    ]);
    return takeFile;
  }

  it.skipIf(!canEncode)(
    "lines up a camera clip's sound with the music file",
    async () => {
      const result = await alignTake(filmTake(0), musicFile);
      expect(Math.abs(result.offsetSeconds - 2.5)).toBeLessThan(1 / 60);
      expect(result).not.toHaveProperty("warning");
    }
  );

  it.skipIf(!canEncode)(
    "counts from the picture's start when the sound starts later",
    async () => {
      // The music's 2.5 s plays at the clip's 0.1 s, so its 2.4 s at the clip's 0 s.
      const result = await alignTake(filmTake(0.1), musicFile);
      expect(Math.abs(result.offsetSeconds - 2.4)).toBeLessThan(1 / 60);
    }
  );
});
```

Then, in `tests/unit/media-composition/post-project-cli-music.test.ts`:

**Edit 1.** Import the audio fixtures. Find:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";
```

**Edit 2.** Add the music and take URLs the new tests use. Find:

```ts
})();

/** The parts of a post these commands read. */
```

Replace it with:

```ts
})();

const MUSIC_URL = "/api/dev/feature-videos/promo/media/music/song.wav";
const TAKE_URL = "/api/dev/feature-videos/promo/media/footage/take.wav";
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";

/** The parts of a post these commands read. */
```

**Edit 3.** Add at the end of the file, after one blank line:

```ts
describe("lining takes up with the music", () => {
  const RATE = 8000;
  const song = clickTrack(20, RATE);

  /** The post's music, and clip v1 of a take whose camera heard `heard`. */
  async function filmed(heard: Float32Array): Promise<void> {
    const media = path.join(folder, "media");
    await fs.mkdir(path.join(media, "music"), { recursive: true });
    await fs.mkdir(path.join(media, "footage"), { recursive: true });
    await fs.writeFile(path.join(media, "music", "song.wav"), wav(song, RATE));
    await fs.writeFile(
      path.join(media, "footage", "take.wav"),
      wav(heard, RATE)
    );
    project = {
      tracks: [{ items: [{ id: "v1", kind: "video", takeId: "take-1" }] }],
      takes: [{ id: "take-1", ref: { kind: "linked", url: TAKE_URL } }],
      music: { url: MUSIC_URL, gain: 1 },
    };
  }

  it.skipIf(!hasFfmpeg)(
    "finds where a clip's take sits in the music and puts it in time",
    async () => {
      await filmed(cameraTake(song, RATE, 3.2, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--place",
        "v1"
      );
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(Math.abs(report.offsetSeconds - 3.2)).toBeLessThanOrEqual(0.005);
      expect(report.placed).toBe(true);
      expect(sent()).toEqual([
        {
          op: "sync-to-music",
          item: "v1",
          offsetSeconds: report.offsetSeconds,
        },
      ]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "measures a take named by its id without moving anything",
    async () => {
      await filmed(cameraTake(song, RATE, 3.2, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--take",
        "take-1"
      );
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(Math.abs(report.offsetSeconds - 3.2)).toBeLessThanOrEqual(0.005);
      expect(report).not.toHaveProperty("placed");
      expect(posts()).toEqual([]);
    }
  );

  it.skipIf(!hasFfmpeg)(
    "leaves the clip where it is when the match is doubtful, and exits 1",
    async () => {
      await filmed(cameraTake(clickTrack(12, RATE, 31337), RATE, 0, 10));
      const result = await cli(
        "align-take",
        "--feature",
        "promo",
        "--place",
        "v1"
      );
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.placed).toBe(false);
      expect(report.warning).toEqual(expect.any(String));
      expect(report.candidates.length).toBeGreaterThan(0);
      expect(posts()).toEqual([]);
    }
  );

  it("says what align-take needs", async () => {
    project = {
      tracks: [{ items: [{ id: "t1", kind: "titles" }] }],
      takes: [{ id: "take-2", ref: { kind: "catalog", videoId: "abc123" } }],
      music: { url: MUSIC_URL, gain: 1 },
    };
    const refusals: [string[], string][] = [
      [
        [],
        "align-take needs --place ITEM to line up a clip, or --take ID to measure a take.",
      ],
      [["--place", "t1"], '"t1" is not a video clip.'],
      [["--place", "v9"], 'No item "v9" in this post.'],
      [["--take", "take-9"], 'No take "take-9" in this post.'],
      [
        ["--take", "take-2"],
        'Take "take-2" is not a file in a feature video folder.',
      ],
    ];
    for (const [flags, message] of refusals) {
      const result = await cli("align-take", "--feature", "promo", ...flags);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    }
    delete project.music;
    const silent = await cli(
      "align-take",
      "--feature",
      "promo",
      "--take",
      "take-1"
    );
    expect(silent.stderr).toContain(NO_MUSIC);
    expect(posts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-align-take.test.ts tests/unit/media-composition/post-project-cli-music.test.ts`

Expected: FAIL. `feature-video-align-take.test.ts` cannot resolve `../../../scripts/feature-video/align-take.mjs`. The CLI file shows `4 failed | 6 passed (10)`: "finds where a clip's take sits in the music and puts it in time" and "measures a take named by its id without moving anything" with `expected 1 to be +0`, "leaves the clip where it is when the match is doubtful, and exits 1" with `SyntaxError: Unexpected end of JSON input`, and "says what align-take needs" with `expected 'Usage: post-project.mjs <command> [--…' to contain 'align-take needs --place ITEM to line…'`.

- [ ] **Step 3: Create the alignment**

Create `scripts/feature-video/align-take.mjs`:

```js
import { spawn } from "node:child_process";
import path from "node:path";
import { toolPath } from "./media-import.mjs";

/**
 * Finds where a take sits in the music, for footage shot while the track
 * played out loud. Both sounds become loudness envelopes at 200 frames a
 * second; the rises in loudness (drum hits, note starts) are compared at
 * every offset, and the best match wins. One frame is 5 ms, well inside one
 * video frame.
 */

export const DECODE_RATE = 8000;
export const ENVELOPE_RATE = 200;
/** Matches closer together than this (0.25 s) count as one. */
const CANDIDATE_GAP_FRAMES = 50;
/** The best match must beat the next one by this much to be placed on its own. */
export const MIN_CONFIDENCE = 1.5;
/** Below this the take's sound hardly follows the music at all. */
export const MIN_SCORE = 0.15;
const FAINT =
  "The take's sound hardly follows the music. Check that the music can be heard in the take.";
const UNCLEAR =
  "Several offsets fit about as well, as they do when the music repeats. Pick one of the candidates and place it with: sync-to-music --item ID --offset S.";

/**
 * The file's first sound as mono samples at `DECODE_RATE`, the first sample
 * at the file's own 0 s, where its picture starts. A camera's sound can start
 * a few hundredths later; that gap becomes silence, or the offset would be
 * off by it.
 */
export function decodeMono(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      toolPath("ffmpeg"),
      [
        "-v",
        "error",
        "-i",
        file,
        "-vn",
        "-af",
        "aresample=async=1:first_pts=0",
        "-ac",
        "1",
        "-ar",
        String(DECODE_RATE),
        "-f",
        "f32le",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    const chunks = [];
    let errors = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text) => (errors += text));
    child.on("error", reject);
    child.on("close", (code) => {
      const name = path.basename(file);
      if (code !== 0)
        return reject(
          new Error(
            `ffmpeg could not read the sound in ${name}: ${errors.trim() || `exit code ${code}`}`
          )
        );
      const bytes = Buffer.concat(chunks);
      // A Float32Array needs its own buffer: the Buffer may start at any byte.
      const samples = new Float32Array(Math.floor(bytes.length / 4));
      new Uint8Array(samples.buffer).set(bytes.subarray(0, samples.length * 4));
      if (samples.length === 0) reject(new Error(`${name} has no sound.`));
      else resolve(samples);
    });
  });
}

/** Loudness in dB, one value per 1/200 s. */
export function loudnessEnvelope(samples, sampleRate = DECODE_RATE) {
  const frame = Math.round(sampleRate / ENVELOPE_RATE);
  const out = new Float32Array(Math.floor(samples.length / frame));
  for (let f = 0; f < out.length; f += 1) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i += 1)
      sum += samples[i] * samples[i];
    out[f] = 10 * Math.log10(sum / frame + 1e-10);
  }
  return out;
}

/** How much louder each frame is than the one before; falls count as 0. */
export function onsetStrength(envelope) {
  const out = new Float32Array(envelope.length);
  for (let i = 1; i < envelope.length; i += 1)
    out[i] = Math.max(0, envelope[i] - envelope[i - 1]);
  return out;
}

function prefixSums(values) {
  const sum = new Float64Array(values.length + 1);
  const squares = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i += 1) {
    sum[i + 1] = sum[i] + values[i];
    squares[i + 1] = squares[i] + values[i] * values[i];
  }
  return { sum, squares };
}

/**
 * How well `take` matches `music` at every offset: take frame j sits on music
 * frame j + lag, and `scores[lag - lagMin]` is the correlation of the two over
 * their overlap, which must be at least `minOverlap` frames.
 */
export function matchScores(music, take, minOverlap) {
  const m = prefixSums(music);
  const t = prefixSums(take);
  const lagMin = -(take.length - minOverlap);
  const scores = new Float64Array(music.length - minOverlap - lagMin + 1);
  for (let index = 0; index < scores.length; index += 1) {
    const lag = lagMin + index;
    const from = Math.max(0, -lag);
    const to = Math.min(take.length, music.length - lag);
    const count = to - from;
    let cross = 0;
    for (let j = from; j < to; j += 1) cross += take[j] * music[j + lag];
    const takeSum = t.sum[to] - t.sum[from];
    const musicSum = m.sum[to + lag] - m.sum[from + lag];
    const takeVariance = t.squares[to] - t.squares[from] - takeSum ** 2 / count;
    const musicVariance =
      m.squares[to + lag] - m.squares[from + lag] - musicSum ** 2 / count;
    scores[index] =
      takeVariance > 0 && musicVariance > 0
        ? (cross - (takeSum * musicSum) / count) /
          Math.sqrt(takeVariance * musicVariance)
        : 0;
  }
  return { lagMin, scores };
}

/** The `count` best offsets, best first, each more than 0.25 s from the others. */
export function topCandidates(lagMin, scores, count = 3) {
  const picked = [];
  while (picked.length < count) {
    let best = -1;
    for (let index = 0; index < scores.length; index += 1) {
      if (best >= 0 && scores[index] <= scores[best]) continue;
      const lag = lagMin + index;
      if (
        picked.some((pick) => Math.abs(pick.lag - lag) <= CANDIDATE_GAP_FRAMES)
      )
        continue;
      best = index;
    }
    if (best < 0) break;
    picked.push({ lag: lagMin + best, score: scores[best] });
  }
  return picked;
}

const round = (value, places) =>
  Math.round(value * 10 ** places) / 10 ** places;

/**
 * The music's own time minus the take's own time at the same moment, from
 * two mono signals at `sampleRate`. Positive when the camera started after
 * the music did. A warning comes with a match that is faint, or that other
 * offsets fit nearly as well.
 */
export function alignSignals(music, take, sampleRate = DECODE_RATE) {
  const musicOnsets = onsetStrength(loudnessEnvelope(music, sampleRate));
  const takeOnsets = onsetStrength(loudnessEnvelope(take, sampleRate));
  const minOverlap = Math.min(
    takeOnsets.length,
    musicOnsets.length,
    5 * ENVELOPE_RATE
  );
  if (minOverlap < ENVELOPE_RATE)
    throw new Error("The take and the music must each run at least 1 s.");
  const { lagMin, scores } = matchScores(musicOnsets, takeOnsets, minOverlap);
  const candidates = topCandidates(lagMin, scores);
  const [best, next] = candidates;
  const confidence =
    next && next.score > 0 ? round(best.score / next.score, 2) : null;
  const warning =
    best.score < MIN_SCORE
      ? FAINT
      : confidence !== null && confidence < MIN_CONFIDENCE
        ? UNCLEAR
        : undefined;
  return {
    offsetSeconds: best.lag / ENVELOPE_RATE,
    score: round(best.score, 3),
    confidence,
    candidates: candidates.map(({ lag, score }) => ({
      offsetSeconds: lag / ENVELOPE_RATE,
      score: round(score, 3),
    })),
    ...(warning ? { warning } : {}),
  };
}

export async function alignTake(takeFile, musicFile) {
  const [music, take] = await Promise.all([
    decodeMono(musicFile),
    decodeMono(takeFile),
  ]);
  return alignSignals(music, take);
}

/**
 * The file behind a feature video media URL, under `root`, the folder that
 * holds every feature video. A URL may name another feature video's folder
 * when the media is shared.
 */
export function mediaPathFromUrl(url, root) {
  const match = /^\/api\/dev\/feature-videos\/([^/?#]+)\/media\/([^?#]+)$/.exec(
    String(url)
  );
  const parts = match
    ? [match[1], ...match[2].split("/")].map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return "";
        }
      })
    : [];
  if (
    parts.length < 2 ||
    parts.some(
      (part) => !part || part === "." || part === ".." || /[\\/:]/.test(part)
    )
  )
    throw new Error(`${url} is not a feature video media URL.`);
  const [slug, ...rest] = parts;
  return path.join(root, slug, "media", ...rest);
}
```

- [ ] **Step 4: Add the command**

In `scripts/post-project.mjs`:

**Edit 1.** Import the alignment. Find:

```js
import path from "node:path";
```

Replace it with:

```js
import path from "node:path";
import { alignTake, mediaPathFromUrl } from "./feature-video/align-take.mjs";
```

**Edit 2.** After `featureMediaUrl`, the message for a post without music. Find:

```js
    .map(encodeURIComponent)
    .join("/")}`;
```

Replace it with:

```js
    .map(encodeURIComponent)
    .join("/")}`;
const NO_MUSIC = "This post has no music. Add it with: add-music <file>.";
```

**Edit 3.** The `align-take` command, before `duplicate`. Find:

```js
  } else if (command === "duplicate") {
```

Replace it with:

```js
  } else if (command === "align-take") {
    const feature = required("feature");
    const place = option("place");
    const project = await currentSnapshot();
    if (!project.music) throw new Error(NO_MUSIC);
    let takeId = option("take");
    if (place) {
      const clip = project.tracks
        .flatMap((track) => track.items)
        .find((item) => item.id === place);
      if (!clip) throw new Error(`No item "${place}" in this post.`);
      if (clip.kind !== "video")
        throw new Error(`"${place}" is not a video clip.`);
      takeId = clip.takeId;
    }
    if (!takeId)
      throw new Error(
        "align-take needs --place ITEM to line up a clip, or --take ID to measure a take."
      );
    const take = project.takes.find((entry) => entry.id === takeId);
    if (!take) throw new Error(`No take "${takeId}" in this post.`);
    if (take.ref.kind !== "linked")
      throw new Error(
        `Take "${takeId}" is not a file in a feature video folder.`
      );
    const { folder } = await request(
      "GET",
      {},
      undefined,
      featureRoute(feature)
    );
    // A copy made with --share-media plays files from the original's folder, beside this one.
    const root = path.dirname(folder);
    const match = await alignTake(
      mediaPathFromUrl(take.ref.url, root),
      mediaPathFromUrl(project.music.url, root)
    );
    if (!place) result = match;
    else if (match.warning) {
      // Nothing moves on a doubtful match; the candidates are printed instead.
      result = { ...match, placed: false };
      process.exitCode = 1;
    } else
      result = {
        ...match,
        placed: true,
        edit: await sendOps([
          {
            op: "sync-to-music",
            item: place,
            offsetSeconds: match.offsetSeconds,
          },
        ]),
      };
  } else if (command === "duplicate") {
```

**Edit 4.** The usage text. Find:

```js
  remove-music
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
```

Replace it with:

```js
  remove-music
  align-take --place ITEM | --take ID   where a take sits in the music, from its camera sound; --place puts the clip in time with it
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-align-take.test.ts tests/unit/media-composition/post-project-cli-music.test.ts tests/unit/media-composition/post-project-cli.test.ts`

Expected: PASS with no test skipped. `feature-video-align-take.test.ts` has 8 tests and `post-project-cli-music.test.ts` 10; plan 1's `post-project-cli.test.ts` passes unchanged.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/feature-video/align-take.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-audio-fixtures.ts tests/unit/media-composition/feature-video-align-take.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git add scripts/feature-video/align-take.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-audio-fixtures.ts tests/unit/media-composition/feature-video-align-take.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git commit -m "align-take: line takes up with the music from their sound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/feature-video/align-take.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-audio-fixtures.ts tests/unit/media-composition/feature-video-align-take.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
```

---

### Task 15: loudness: measure a render and suggest the music's level

Short-video platforms play everything at about -14 LUFS and turn louder posts down. `loudness <file>` measures a finished render the way they do (EBU R128 through ffmpeg's `ebur128` filter, with its true peak) and prints the integrated loudness, the loudness range and the peak. Given `--feature SLUG`, it also prints the music's level and the level that would bring the render to -14 LUFS without pushing its peaks past -1 dBTP, assuming the music is all that plays; `music --gain` sets it. It never changes the post itself.

**Files:**
- Create: `scripts/feature-video/loudness.mjs`
- Modify: `scripts/post-project.mjs` (an import, the `loudness` command and the usage text)
- Test: `tests/unit/media-composition/feature-video-loudness.test.ts`, and one more test in `tests/unit/media-composition/post-project-cli-music.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/media-composition/feature-video-loudness.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  measureLoudness,
  parseEbur128Summary,
  suggestMusicGain,
} from "../../../scripts/feature-video/loudness.mjs";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";

const hasFfmpeg = (() => {
  try {
    execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
})();

/** ffmpeg 8.0.1's summary for a quiet tone, as Windows prints it. */
const TONE = [
  "  ebur128:out0 -> Stream #0:0 (pcm_s16le)",
  "[Parsed_ebur128_0 @ 00000168717ecac0] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -33.8 LUFS",
  "    Threshold: -43.8 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         0.0 LU",
  "    Threshold: -53.8 LUFS",
  "    LRA low:   -33.8 LUFS",
  "    LRA high:  -33.8 LUFS",
  "",
  "  True peak:",
  "    Peak:      -33.1 dBFS",
  "[out#0/null @ 0000016873009bc0] video:0KiB audio:1125KiB subtitle:0KiB",
].join("\r\n");

/** The same for two seconds of silence. */
const SILENCE = [
  "[Parsed_ebur128_0 @ 0000015e67f9cac0] Summary:",
  "",
  "  Integrated loudness:",
  "    I:         -70.0 LUFS",
  "    Threshold:   0.0 LUFS",
  "",
  "  Loudness range:",
  "    LRA:         0.0 LU",
  "    Threshold:   0.0 LUFS",
  "    LRA low:     0.0 LUFS",
  "    LRA high:    0.0 LUFS",
  "",
  "  True peak:",
  "    Peak:       -inf dBFS",
].join("\r\n");

describe("reading ffmpeg's loudness summary", () => {
  it("reads loudness, range and peak", () => {
    expect(parseEbur128Summary(TONE)).toEqual({
      integratedLufs: -33.8,
      rangeLu: 0,
      truePeakDbtp: -33.1,
    });
    expect(parseEbur128Summary(SILENCE)).toEqual({
      integratedLufs: -70,
      rangeLu: 0,
      truePeakDbtp: -Infinity,
    });
  });

  it("reads only the last summary", () => {
    const frameLine =
      "[Parsed_ebur128_0 @ 1] t: 5.9  TARGET:-23 LUFS  M: -12.0 S: -12.0  I: -12.0 LUFS  LRA: 0.0 LU";
    expect(parseEbur128Summary(`${frameLine}\r\n${TONE}`).integratedLufs).toBe(
      -33.8
    );
  });

  it("says when there is no summary", () => {
    expect(() => parseEbur128Summary("Error opening input")).toThrow(
      "ffmpeg printed no loudness summary."
    );
  });
});

describe("suggesting a music level", () => {
  it("brings the render to -14 LUFS", () => {
    // 4 dB too loud at level 0.8: 0.8 * 10^(-4/20).
    expect(suggestMusicGain(0.8, -10, -6)).toBe(0.505);
  });

  it("stops the peaks at -1 dBTP", () => {
    // Loudness would allow +6 dB, but the peak is already at -3 dBTP.
    expect(suggestMusicGain(1, -20, -3)).toBe(1.259);
  });

  it("goes no higher than 2, and gives nothing for silence", () => {
    expect(suggestMusicGain(1, -33.8, -33.1)).toBe(2);
    expect(suggestMusicGain(1, -70, -Infinity)).toBeNull();
  });
});

describe("measuring a file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "loudness-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it.skipIf(!hasFfmpeg)(
    "measures a tone's peak where it was made",
    async () => {
      const file = path.join(dir, "tone.wav");
      // ffmpeg's sine source peaks at 1/8 of full scale: -18.06 dB.
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=997:sample_rate=48000",
        "-t",
        "3",
        file,
      ]);
      const measured = await measureLoudness(file);
      expect(measured.truePeakDbtp).toBeCloseTo(-18.06, 0);
      expect(measured.integratedLufs).toBeGreaterThan(-30);
      expect(measured.integratedLufs).toBeLessThan(-15);
    }
  );
});
```

Then, in `tests/unit/media-composition/post-project-cli-music.test.ts`:

**Edit 1.** Import the gain suggestion. Find:

```ts
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";
```

Replace it with:

```ts
import { cameraTake, clickTrack, wav } from "./feature-video-audio-fixtures";
import { suggestMusicGain } from "../../../scripts/feature-video/loudness.mjs";
```

**Edit 2.** Add at the end of the file, after one blank line:

```ts
describe("measuring a render's loudness", () => {
  it.skipIf(!hasFfmpeg)(
    "reports loudness and peak, and with --feature the music level to try",
    async () => {
      const render = path.join(root, "render.wav");
      // ffmpeg's sine source peaks at 1/8 of full scale: -18.06 dB.
      execFileSync(toolPath("ffmpeg"), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=997:sample_rate=48000",
        "-t",
        "3",
        render,
      ]);
      const alone = await cli("loudness", render);
      expect(alone.code).toBe(0);
      const measured = JSON.parse(alone.stdout);
      expect(measured).toMatchObject({ targetLufs: -14, peakCeilingDbtp: -1 });
      expect(measured.truePeakDbtp).toBeCloseTo(-18.06, 0);
      expect(measured).not.toHaveProperty("suggestedGain");

      const none = await cli("loudness", render, "--feature", "promo");
      expect(none.code).toBe(1);
      expect(none.stderr).toContain(NO_MUSIC);

      project.music = { url: MUSIC_URL, gain: 0.8 };
      const suggested = JSON.parse(
        (await cli("loudness", render, "--feature", "promo")).stdout
      );
      expect(suggested.musicGain).toBe(0.8);
      expect(suggested.suggestedGain).toBe(
        suggestMusicGain(0.8, suggested.integratedLufs, suggested.truePeakDbtp)
      );
      expect(suggested.suggestedGain).toBeGreaterThan(0.8);
      expect(posts()).toEqual([]);
    }
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-loudness.test.ts tests/unit/media-composition/post-project-cli-music.test.ts`

Expected: FAIL. Both files cannot resolve `../../../scripts/feature-video/loudness.mjs`.

- [ ] **Step 3: Create the measurement**

Create `scripts/feature-video/loudness.mjs`:

```js
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { toolPath } from "./media-import.mjs";

/**
 * How loud a finished render is, measured the way the platforms measure it
 * (EBU R128 through ffmpeg's ebur128 filter), and the music level that would
 * bring it to their usual target.
 */

const execFileAsync = promisify(execFile);
/** The integrated loudness most short-video platforms play at. */
export const TARGET_LUFS = -14;
/** Peaks stay under this so the platforms' own encoders do not clip them. */
export const PEAK_CEILING_DBTP = -1;
/** ffmpeg reports this for silence. */
const SILENT_LUFS = -70;

/** The integrated loudness, loudness range and true peak in ebur128's summary. */
export function parseEbur128Summary(text) {
  const at = text.lastIndexOf("Summary:");
  if (at < 0) throw new Error("ffmpeg printed no loudness summary.");
  const summary = text.slice(at).replace(/\r/g, "");
  const read = (pattern, what) => {
    const match = pattern.exec(summary);
    if (!match) throw new Error(`The loudness summary has no ${what}.`);
    return match[1] === "-inf" ? -Infinity : Number(match[1]);
  };
  return {
    integratedLufs: read(/^\s*I:\s+(-?\d+(?:\.\d+)?) LUFS$/m, "loudness"),
    rangeLu: read(/^\s*LRA:\s+(-?\d+(?:\.\d+)?) LU$/m, "loudness range"),
    truePeakDbtp: read(/^\s*Peak:\s+(-inf|-?\d+(?:\.\d+)?) dBFS$/m, "peak"),
  };
}

/**
 * The music level that brings the render to the target loudness without its
 * peaks passing the ceiling, assuming the music is all that plays. Null for
 * silence, which no level fixes.
 */
export function suggestMusicGain(gain, integratedLufs, truePeakDbtp) {
  if (!(integratedLufs > SILENT_LUFS)) return null;
  const toTarget = 10 ** ((TARGET_LUFS - integratedLufs) / 20);
  const toCeiling = 10 ** ((PEAK_CEILING_DBTP - truePeakDbtp) / 20);
  return (
    Math.round(Math.min(2, gain * Math.min(toTarget, toCeiling)) * 1000) / 1000
  );
}

export async function measureLoudness(file) {
  let stderr;
  try {
    ({ stderr } = await execFileAsync(
      toolPath("ffmpeg"),
      [
        "-nostats",
        "-hide_banner",
        "-i",
        file,
        "-vn",
        "-af",
        "ebur128=peak=true:framelog=verbose",
        "-f",
        "null",
        "-",
      ],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
    ));
  } catch (cause) {
    throw new Error(
      `ffmpeg could not measure ${path.basename(file)}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
  return parseEbur128Summary(stderr);
}
```

- [ ] **Step 4: Add the command**

In `scripts/post-project.mjs`:

**Edit 1.** Import the measurement. Find:

```js
import { alignTake, mediaPathFromUrl } from "./feature-video/align-take.mjs";
```

Replace it with:

```js
import { alignTake, mediaPathFromUrl } from "./feature-video/align-take.mjs";
import {
  PEAK_CEILING_DBTP,
  TARGET_LUFS,
  measureLoudness,
  suggestMusicGain,
} from "./feature-video/loudness.mjs";
```

**Edit 2.** The `loudness` command, before `duplicate`. Find:

```js
  } else if (command === "duplicate") {
```

Replace it with:

```js
  } else if (command === "loudness") {
    const file = path.resolve(positional(0, "a rendered video or sound file"));
    const measured = await measureLoudness(file);
    result = {
      ...measured,
      targetLufs: TARGET_LUFS,
      peakCeilingDbtp: PEAK_CEILING_DBTP,
    };
    if (option("feature")) {
      const music = (await currentSnapshot()).music;
      if (!music) throw new Error(NO_MUSIC);
      result.musicGain = music.gain;
      result.suggestedGain = suggestMusicGain(
        music.gain,
        measured.integratedLufs,
        measured.truePeakDbtp
      );
    }
  } else if (command === "duplicate") {
```

**Edit 3.** The usage text. Find:

```js
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
```

Replace it with:

```js
  sync-to-music --item ID --offset S   puts a clip in time with the music at one of align-take's offsets
  loudness <render.mp4> [--feature SLUG]   loudness and true peak; with --feature, the music level that reaches -14 LUFS
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-loudness.test.ts tests/unit/media-composition/post-project-cli-music.test.ts tests/unit/media-composition/post-project-cli.test.ts`

Expected: PASS with no test skipped. `feature-video-loudness.test.ts` has 7 tests and `post-project-cli-music.test.ts` 11; plan 1's `post-project-cli.test.ts` passes unchanged.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/feature-video/loudness.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-loudness.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git add scripts/feature-video/loudness.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-loudness.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
git commit -m "loudness: measure a render and suggest the music's level

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/feature-video/loudness.mjs scripts/post-project.mjs tests/unit/media-composition/feature-video-loudness.test.ts tests/unit/media-composition/post-project-cli-music.test.ts
```

---

### Task 16: Document the music lane

The bridge doc gains a Music section: how an agent adds the music, sets its grid, lines takes up with it, checks loudness, and which file owns what. The capability registry names the music's owners and the tempo finder's new home.

**Files:**
- Modify: `docs/development/post-studio-manifest-bridge.md` (a Music section before "When disk and the editor disagree", and the ownership line)
- Modify: `docs/architecture/canonical-capabilities.md` (the feature video paragraph's ownership sentence, a music paragraph after that paragraph, and a tempo finder row after the "BPM, tempo, tap tempo, speed preset" row)

- [ ] **Step 1: Add the Music section to the bridge doc**

In `docs/development/post-studio-manifest-bridge.md`:

**Edit 1.** Add a Music section before "When disk and the editor disagree". Find:

```markdown
### When disk and the editor disagree
```

Replace it with:

````markdown
### Music

A feature video can have one music file under the whole post. The editor's preview plays it and keeps the picture in time with it, and the export mixes it under the takes. Export's Sound choice sets only the takes' sound: with Silent the music still plays. A render whose music file cannot be read fails instead of going out without it. Only feature videos have music, since the file lives in the feature video's folder.

```powershell
node scripts/post-project.mjs add-music D:\music\derail.wav --feature promo-1-0 --label "Derail" --artist "Yellowbase" --license "Epidemic Sound, license id, date"
node scripts/post-project.mjs music --feature promo-1-0 --bpm 85 --downbeat 0.42
node scripts/post-project.mjs music --feature promo-1-0 --from @2 --to @34 --fade-out 2 --gain 0.8
node scripts/post-project.mjs align-take --feature promo-1-0 --place video-3
node scripts/post-project.mjs trim --feature promo-1-0 --item video-3 --edge end --seconds @9.3
node scripts/post-project.mjs loudness D:\renders\promo.mp4 --feature promo-1-0
node scripts/post-project.mjs remove-music --feature promo-1-0
```

`add-music` copies the file into `media/music/` under a safe name no other file there uses and puts it under the post. A `.wav` of 16 or 24-bit PCM at 44.1 or 48 kHz with one or two channels is copied as it is. Anything else, such as an MP3, becomes a 16-bit 48 kHz stereo WAV: a compressed file can decode a few milliseconds apart in the browser and in ffmpeg, which would move every beat. Adding the same file again keeps its place, trims, level, fades and beat grid; a different file replaces the music and starts whole at 0 s at full level.

`music` changes any of its settings. `--start` is where the music begins on the post's clock; `--from` and `--to` are the part of the file that plays; `--gain` is its level, where 1 plays the file as it is and 2 is the most; `--fade-in` and `--fade-out` are seconds. `--bpm`, `--downbeat` (where bar 1 falls, in the file's own seconds) and `--beats-per-bar` make the beat grid, and `--bpm none` removes it. Until the music has a tempo, a downbeat or beats per bar needs `--bpm` in the same command. `--label`, `--artist` and `--license` are the credit, and an empty `--artist ""` or `--license ""` removes one.

A time on the command line (`--start`, `--from`, `--to`, `add-titles --at`, `trim --seconds`) is seconds (`12.5`), a clock (`1:02.5`) or, once the music has a beat grid, a bar: `@9` is bar 9 and `@9.3` is bar 9, beat 3. `--from` and `--to` count bars in the file; the others count them where the music now sits in the post.

`align-take` finds where a take sits in the music from the take's own sound, for footage shot while the track played out loud. Both sounds are decoded at 8 kHz and turned into loudness envelopes at 200 frames a second, 5 ms each, and their rises in loudness are compared at every offset. `offsetSeconds` is the music's own time minus the take's own time at the same moment. The result also gives a `score`, a `confidence` (the best match's score over the next one's) and up to three `candidates` at least 0.25 s apart. A faint match (score under 0.15) or an unclear one (confidence under 1.5, as when the music repeats) comes with a `warning`. `--take ID` only measures. `--place ITEM` also puts that clip in time with the music; on a warning nothing moves, the command exits with code 1, and `sync-to-music --item ID --offset S` places the clip at the candidate you pick. Placing a clip changes which part of its take it plays, not where it sits in the post; it needs the clip at normal speed and enough take before and after.

`loudness` measures a render the way the platforms do, with ffmpeg's EBU R128 filter: integrated loudness in LUFS, loudness range, and true peak. With `--feature` it also suggests the music `gain` that brings the render to -14 LUFS without its peaks passing -1 dBTP, at most 2, assuming the music is all that plays; set it with `music --gain`. A silent render gets no suggestion.

In the editor, the music has its own row under the tracks. Drag it to move it. Selecting it shows its ends and the bar 1 flag: drag an end to trim the music, or the flag to move the grid. With the music selected, Music opens its panel (level, fades, the beat grid with Tap the beat and Suggest BPM, and the credit) and Delete removes it. The ruler numbers the bars, and clips snap to the music's edges and bars, and to its beats once they are far enough apart to pick out. Suggest BPM only offers a tempo; it never sets one.

Ownership: `post-music.ts` owns the music's schema, `music-grid.ts` bars, beats and the times that name a bar, `post-music-edits.ts` its edits, and `post-audio-plan.ts` its sound for the export and the preview (`planMusicAudio`). `music-preview-sync.ts` and `PostMusicPreview.svelte` keep the preview's player and clock on the music; `PostTimelineMusicLane.svelte` and `PostMusicTool.svelte` are its lane and panel. `scripts/feature-video/music-import.mjs`, `align-take.mjs`, `loudness.mjs` and `time-args.mjs` serve the CLI.

### When disk and the editor disagree
````

**Edit 2.** Slugs and media URLs now live in `feature-video-url.ts`. Find:

```markdown
Ownership: `feature-video.ts` owns slugs, the file format and media URLs;
```

Replace it with:

```markdown
Ownership: `feature-video-url.ts` owns slugs and media URLs, so the post schema can check a music URL without importing the rest of `feature-video.ts`, which owns the file format;
```

- [ ] **Step 2: Update the capability registry**

In `docs/architecture/canonical-capabilities.md`:

**Edit 1.** Slugs and media URLs now live in `feature-video-url.ts`. Find:

```markdown
`domain/feature-video.ts` owns slugs, the file format and media URLs.
```

Replace it with:

```markdown
`domain/feature-video-url.ts` owns slugs and media URLs, and
`domain/feature-video.ts` the file format.
```

**Edit 2.** After the feature video paragraph, the music's. Find:

```markdown
Searches: feature video, promo video, project folder, media route, byte range,
revision, disk wins.
```

Replace it with:

```markdown
Searches: feature video, promo video, project folder, media route, byte range,
revision, disk wins.

A feature video's music is one file under the whole post. `domain/post-music.ts`
owns its schema, `domain/music-grid.ts` bars, beats and the times that name a
bar, and `domain/post-music-edits.ts` its edits; `domain/post-audio-plan.ts`
plans its sound with `planMusicAudio` for the export and the preview alike.
`services/music-preview-sync.ts` and `PostMusicPreview.svelte` keep the
preview's player and clock on the music; the timeline lane is
`timeline/PostTimelineMusicLane.svelte` and its panel `PostMusicTool.svelte`.
The CLI's music commands use `scripts/feature-video/music-import.mjs`,
`align-take.mjs`, `loudness.mjs` and `time-args.mjs`. Searches: music,
soundtrack, beat grid, bar, downbeat, align take, loudness, LUFS.
```

**Edit 3.** A row for the tempo finder, after the BPM row. Its cells are padded to the table's column widths. Find:

```markdown
| effect preview, preset lab, continuous demo
```

Replace it with:

```markdown
| BPM detection, song tempo, beat times, suggest BPM                                                                                  | `shared/audio/bpm-analyzer.ts`: `analyzeAudioBpm` estimates a song's tempo from its sound and `generateStepTimestamps` spaces beats at a tempo; Compose's timeline and the Post Studio music panel's Suggest BPM use it                                                                                                                                                                                                                                                                                                                                                                                                    |
| effect preview, preset lab, continuous demo
```

- [ ] **Step 3: Check the docs against the code**

From the worktree root in Git Bash:

```bash
npx prettier --check docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
for p in src/lib/shared/media-composition/domain/feature-video-url.ts src/lib/shared/media-composition/domain/feature-video.ts src/lib/shared/media-composition/domain/post-music.ts src/lib/shared/media-composition/domain/music-grid.ts src/lib/shared/media-composition/domain/post-music-edits.ts src/lib/shared/media-composition/domain/post-audio-plan.ts src/lib/shared/media-composition/services/music-preview-sync.ts src/lib/shared/share/components/post-studio/editor/PostMusicPreview.svelte src/lib/shared/share/components/post-studio/editor/PostMusicTool.svelte src/lib/shared/share/components/post-studio/editor/timeline/PostTimelineMusicLane.svelte src/lib/shared/audio/bpm-analyzer.ts scripts/feature-video/music-import.mjs scripts/feature-video/align-take.mjs scripts/feature-video/loudness.mjs scripts/feature-video/time-args.mjs; do [ -e "$p" ] || echo "missing: $p"; done
grep -c "export function planMusicAudio" src/lib/shared/media-composition/domain/post-audio-plan.ts
grep -c -e "export async function analyzeAudioBpm" -e "export function generateStepTimestamps" src/lib/shared/audio/bpm-analyzer.ts
grep -c "POST_MUSIC_MAX_GAIN = 2" src/lib/shared/media-composition/domain/post-music.ts
grep -cE "TARGET_LUFS = -14|PEAK_CEILING_DBTP = -1" scripts/feature-video/loudness.mjs
grep -cE "DECODE_RATE = 8000|ENVELOPE_RATE = 200|CANDIDATE_GAP_FRAMES = 50|MIN_CONFIDENCE = 1.5|MIN_SCORE = 0.15" scripts/feature-video/align-take.mjs
grep -cE 'PLAIN_PCM = \["pcm_s16le", "pcm_s24le"\]|PLAIN_RATES = \[44100, 48000\]' scripts/feature-video/music-import.mjs
git diff -U0 -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md | grep '^+' | grep -n $'\xe2\x80\x94'
git diff -U0 -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md | grep '^+' | grep -niwE "robust|comprehensive|crucial|seamless|leverage|navigate|landscape|delve|utilize"
```

Expected: Prettier reports that both files use its style; no `missing:` line; the six counts print 1, 2, 1, 2, 5 and 2, which are the facts the new text states (the gain limit, the loudness target and peak ceiling, the alignment's rates and thresholds, and the WAV formats copied as they are); the last two commands print nothing. If Prettier flags a file, run `npx prettier --write` on it and check with `git diff` that only the added lines changed.

- [ ] **Step 4: Commit**

```bash
git status --short
git add docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
git commit -m "Document the music lane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
```

Expected: before the commit, `git status --short` lists only the two docs.

---

### Task 17: Coordinator checks, review and integration

This task is run by the coordinator in its own session, not by an implementer subagent. It checks the whole branch on a real server and in a real browser against piece 2's acceptance (a click track that renders on time, a preview that stays within one frame of the music over 30 seconds, the lane at every size the Post editor appears, and its drags), has it reviewed, and merges it into local `main`.

**Files:** none planned. A fix names its own files and commits them with a pathspec.

Throughout, in PowerShell:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$wt = 'E:\worktrees\tka-platform\feature-video-music-lane'
$cli = "$wt\scripts\post-project.mjs"
$url = 'http://localhost:5192'
$fx = "$scratch\music-fixtures"
$ffmpeg = 'C:\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe'
```

Each PowerShell call starts a fresh shell, so repeat these lines at the top of every call that uses them. In Git Bash, set `SCRATCH=/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad` the same way.

The browser is the agent Chrome: start it with `pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank` from `E:/tka-platform` (it reuses a running agent Chrome) and drive it with Chrome DevTools MCP in one task tab. During Steps 7 and 8, keep that tab in front (`select_page` with `bringToFront: true`) and the window uncovered: Chrome stops animation frames in a hidden tab or a covered window, and both the render and the drift probe run on them.

- [ ] **Step 1: Bring the branch up to date with main**

```powershell
git -C E:/worktrees/tka-platform/feature-video-music-lane merge --no-edit main
git -C E:/worktrees/tka-platform/feature-video-music-lane status --short
```

Expected: "Already up to date." or a merge commit, then no status output. On a conflict, resolve each conflicted file in the worktree keeping both sides' intent, `git add` exactly those files, run their tests, and finish with `git commit --no-edit`: a merge commit cannot take a pathspec, and this worktree's index holds only the merge.

- [ ] **Step 2: Run the tests**

From the worktree root in Git Bash:

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition tests/unit/shared/audio tests/unit/compose tests/unit/stage tests/unit/timeline src/lib/shared/timeline tests/unit/post-module-state.test.ts tests/unit/prop-color-picker-contract.test.ts src/routes/api/dev src/lib/shared/share/components/post-studio src/lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice.test.ts src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte.test.ts
```

Expected: no failures, and nothing skipped in the six files that need ffmpeg: `feature-video-media-import.test.ts`, `post-project-cli.test.ts`, `feature-video-music-import.test.ts`, `post-project-cli-music.test.ts`, `feature-video-align-take.test.ts` and `feature-video-loudness.test.ts`. If the summary reports skipped tests, run those six alone with `--reporter=verbose` to see which. When a file this plan never touched fails, run that one file from `E:/tka-platform` to see whether `main` fails the same way; if it does, note it for the final report and go on.

- [ ] **Step 3: Compare type errors with the baseline**

First pass the resource gate, in PowerShell:

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|vite\\bin\\vite\.js' } | Select-Object ProcessId, CommandLine
```

Expected: at least 4096 MB available, no `svelte-check` running, and at most one Vite server besides port 5173's. When a `svelte-check` runs, wait for it with a Monitor until-loop; never stop another task's process. Then, from the worktree root in Git Bash:

```bash
SCRATCH=/c/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/52d73a85-39eb-47d6-a5bf-30b3ac564fe0/scratchpad
npm run check:fast -- --no-svelte-warnings > "$SCRATCH/check-fast-plan2-after.log" 2>&1
sed 's/\x1b\[[0-9;]*m//g; s/\r$//' "$SCRATCH/check-fast-plan2-after.log" \
  | awk '/^[^ ].*\.(ts|svelte|mjs|js):[0-9]+:[0-9]+$/ { file = $0; next } file != "" && /^Error/ { sub(/:[0-9]+:[0-9]+$/, "", file); print file " " $0 } { file = "" }' \
  | grep -E "feature-video|post-music|music-grid|music-preview|PostMusic|post-project\.ts|post-project-ops|bpm-analyzer|SnapGuides|TimelineAudioTrack|snap-service|post-audio-plan|post-audio-track|PostExportPanel|PostEditorWorkspace|PostEditorCanvas|TimeRuler|time-ruler|post-editor-tools|post-editor-labels|post-timeline-geometry|PostTimeline|music-lane|music-tool" \
  | sort > "$SCRATCH/check-fast-plan2-after.txt"
diff "$SCRATCH/check-fast-plan2-before.txt" "$SCRATCH/check-fast-plan2-after.txt"
```

Expected: no line starting with `>`. A `<` line is an error the branch removed. A new error goes to a Sonnet implementer with the file, the message and a pathspec commit, and this step runs again.

- [ ] **Step 4: Start the preview**

Pass the resource gate (Step 3), then:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
New-Item -ItemType Directory -Force "$scratch\feature-videos-music" | Out-Null
$env:TKA_FEATURE_VIDEO_ROOT = "$scratch\feature-videos-music"
$p = Start-Process -FilePath node -ArgumentList 'node_modules/vite/bin/vite.js','--port','5192','--strictPort','--host','localhost' -WorkingDirectory 'E:\worktrees\tka-platform\feature-video-music-lane' -RedirectStandardOutput "$scratch\preview-5192.log" -RedirectStandardError "$scratch\preview-5192.err.log" -PassThru -WindowStyle Hidden
$p.Id
```

Record the process id, port 5192, the worktree and both log paths in the task notes. If port 5192 is taken, use the next free port from 5193 and change `$url` to match. Wait, with a Monitor until-loop rather than sleeps, until `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5192/api/dev/feature-videos` prints `200`.

- [ ] **Step 5: Make the test media**

Two projects need media. `music-check` gets a 2 s take of a test pattern with a 440 Hz tone, and a 12 s click track with a click every 0.5 s from 0.5 s. `music-drift` gets 40 s of uneven bursts as its music, and a 44 s take whose sound is that music, quieter and with noise, from a camera that started 2 s before the music did.

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$fx = "$scratch\music-fixtures"
New-Item -ItemType Directory -Force $fx | Out-Null
@'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { clickTrack, cameraTake, wav } = await import(
  pathToFileURL(
    "E:/worktrees/tka-platform/feature-video-music-lane/tests/unit/media-composition/feature-video-audio-fixtures.ts"
  ).href
);
const out = process.argv[2];
const rate = 48000;
const write = (name, samples) =>
  fs.writeFileSync(path.join(out, name), wav(samples, rate));

// 12 s with a click every 0.5 s from 0.5 s: 10 ms of 1 kHz at 0.9.
const clicks = new Float32Array(12 * rate);
for (let at = 0.5; at < 12; at += 0.5) {
  const start = Math.round(at * rate);
  for (let i = 0; i < 0.01 * rate; i += 1)
    clicks[start + i] = 0.9 * Math.sin((2 * Math.PI * 1000 * i) / rate);
}
write("click-120.wav", clicks);
// The check take's own sound: 2 s of 440 Hz.
write(
  "check-tone.wav",
  Float32Array.from(
    { length: 2 * rate },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate)
  )
);
// 40 s of uneven bursts, and a camera that started 2 s before the music did.
const music = clickTrack(40, rate);
write("drift-music.wav", music);
write("drift-take-sound.wav", cameraTake(music, rate, -2, 44));
console.log(
  fs
    .readdirSync(out)
    .filter((name) => name.endsWith(".wav"))
    .sort()
    .join(" ")
);
'@ | node --input-type=module - $fx
```

Expected: `check-tone.wav click-120.wav drift-music.wav drift-take-sound.wav`. Node runs the `.ts` fixture module by stripping its types. Then the two takes:

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$fx = "$scratch\music-fixtures"
$ffmpeg = 'C:\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe'
& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=1080x1920:rate=30 -i "$fx\check-tone.wav" -t 2 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 192k "$fx\check-take.mp4"
& $ffmpeg -hide_banner -loglevel error -y -f lavfi -i testsrc2=size=1080x1920:rate=30 -i "$fx\drift-take-sound.wav" -t 44 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 192k "$fx\drift-take.mp4"
```

Expected: ffmpeg prints nothing, and `check-take.mp4` and `drift-take.mp4` exist.

- [ ] **Step 6: Build the two projects with the agent commands**

No editor is open yet, so every edit goes to the file on disk.

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$cli = 'E:\worktrees\tka-platform\feature-video-music-lane\scripts\post-project.mjs'
$url = 'http://localhost:5192'
$fx = "$scratch\music-fixtures"
node $cli create music-check --sequence "DCKΨ-" --title "Music check" --canvas 9:16 --url $url
node $cli add-take "$fx\check-take.mp4" --feature music-check --label "Check take" --append --url $url
node $cli add-music "$fx\click-120.wav" --feature music-check --label "Click track" --url $url
node $cli music --start 0.25 --bpm 120 --downbeat 0.5 --feature music-check --url $url
node $cli show --json --feature music-check --url $url
```

Expected:
- `add-take` prints `"media": "footage/check-take.mp4"`, `"converted": false` and an edit with `"status": "applied"`.
- `add-music` prints `"media": "music/click-120.wav"` and `"converted": false`: a 16-bit 48 kHz WAV is copied as it is.
- `show --json` prints a `music` with `id` `music-1`, `url` `/api/dev/feature-videos/music-check/media/music/click-120.wav`, `label` "Click track", `startSeconds` 0.25, `sourceInSeconds` 0, `sourceOutSeconds` 12, `durationSeconds` 12, `gain` 1, both fades 0, and `grid` `{ "bpm": 120, "downbeatSeconds": 0.5, "beatsPerBar": 4 }`. The clicks at 0.5 s, 1 s and 1.5 s in the file then fall at 0.75 s, 1.25 s and 1.75 s in the 2 s post.

```powershell
$scratch = 'C:\Users\Austen\AppData\Local\Temp\claude\E--tka-platform\52d73a85-39eb-47d6-a5bf-30b3ac564fe0\scratchpad'
$cli = 'E:\worktrees\tka-platform\feature-video-music-lane\scripts\post-project.mjs'
$url = 'http://localhost:5192'
$fx = "$scratch\music-fixtures"
node $cli create music-drift --sequence "DCKΨ-" --title "Music drift" --canvas 9:16 --url $url
node $cli add-take "$fx\drift-take.mp4" --feature music-drift --label "Drift take" --append --url $url
$item = (node $cli show --json --feature music-drift --url $url | Out-String | ConvertFrom-Json).tracks[0].items[0].id
node $cli add-music "$fx\drift-music.wav" --feature music-drift --label "Drift music" --url $url
node $cli music --bpm 120 --downbeat 2.1 --gain 0.02 --feature music-drift --url $url
node $cli trim --item $item --edge end --seconds 40 --feature music-drift --url $url
node $cli align-take --place $item --feature music-drift --url $url
node $cli show --json --feature music-drift --url $url
node $cli loudness "$fx\drift-take.mp4" --feature music-drift --url $url
```

Bar 1 falls at 2.1 s, clear of the music's start handle at 0 s, and the music plays at 2 percent, so the speakers stay quiet during the checks. A level of 0 would take the music out of the preview's sound and clock altogether.

Expected:
- `align-take` prints an `offsetSeconds` within 0.01 of -2, no `warning`, and `"placed": true`.
- `show --json` then has the clip at `start` 0, `sourceIn` within 0.01 of 2 and `sourceOut` within 0.01 of 42: the clip plays the take from where the camera heard the music's first second.
- `loudness` prints `integratedLufs`, `rangeLu`, `truePeakDbtp`, `targetLufs` -14, `peakCeilingDbtp` -1, `musicGain` 0.02, and a `suggestedGain` from 0 to 2. Its numbers measure the take, not a render, which is all this check needs.

- [ ] **Step 7: Render the click track and check when the clicks land**

In the task tab at 1440×900, kept in front, load [http://localhost:5192/post?feature=music-check](http://localhost:5192/post?feature=music-check) and wait for the music's button in the lane, whose name starts with "Music: Click track". Click the Export tool (`[data-tool="export"]`, named "Export"). The panel shows "The music plays either way; this sets only the takes' sound." under Sound. Pick "Silent" so that only the music sounds, then click "Render the post". Wait for the download link with `evaluate_script` polling up to 60 s for `.export a.download`; do not wait for the text "Done", which the tool panel's own Done button also shows. Then:

```js
async () => {
  const link = document.querySelector(".export a.download");
  const bytes = await (await fetch(link.href)).arrayBuffer();
  const sound = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes);
  const samples = sound.getChannelData(0);
  const rate = sound.sampleRate;
  const onsets = [];
  let lastLoud = -Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) <= 0.1) continue;
    if (i - lastLoud > 0.25 * rate) onsets.push(Number((i / rate).toFixed(4)));
    lastLoud = i;
  }
  return { seconds: sound.duration, onsets };
};
```

Expected: `seconds` about 2, and exactly three onsets, each within 1/30 s (0.0333) of 0.75, 1.25 and 1.75. This is the spec's integration check: a feature project with a generated two-second clip and a click track renders, and its clicks land within one frame of their planned times. Record the three offsets for the report. When every click is late by about the same 0.021 s or 0.043 s, that is the AAC encoder's start-up delay in the render (the WAV music has none): within one frame, note it as a follow-up for piece 4; beyond one frame, have an Opus subagent diagnose it with superpowers:systematic-debugging, then a Sonnet implementer fixes it with a test that reproduces it, and this step runs again.

Then select the music with its button in the lane, click the Music tool (`[data-tool="music"]`, named "Music") and click "Suggest BPM". Within about 10 s the panel's status reads "About 120 BPM, N% sure." (60 or 240 is an acceptable reading of an even click), and never "Could not read the music file." Leave the "Use" button alone: Suggest BPM only offers a tempo.

- [ ] **Step 8: Measure the preview's drift over 30 seconds**

In the same tab, still at 1440×900 and in front, load [http://localhost:5192/post?feature=music-drift](http://localhost:5192/post?feature=music-drift) and wait for the button whose name starts with "Music: Drift music". Open the Export tool, pick "Silent" and close the panel with its Done button, so the take's own sound stays quiet. Click the Play button (`.transport .play`, named "Play") with the MCP `click` tool: a real click lets Chrome start the sound. Right after it, run:

```js
async () => {
  const { file } = await (await fetch("/api/dev/feature-videos/music-drift")).json();
  const { music } = file.project;
  const take = file.project.tracks[0].items[0];
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const clip = document.querySelector(".music-lane .music-clip");
  const line = document.querySelector(".lanes-content > .playhead-line");
  const audios = [...document.querySelectorAll("audio")];
  const audio = audios.find((element) => element.currentSrc.includes("drift-music"));
  // The music's lane clip is as wide as the part of the music that plays.
  const pps = parseFloat(clip.style.width) / (music.sourceOutSeconds - music.sourceInSeconds);
  const rows = [];
  const started = performance.now();
  await new Promise((resolve) => {
    const sample = () => {
      if (performance.now() - started >= 30000) return resolve();
      const clock = parseFloat(line.style.left) / pps;
      const playing = [...document.querySelectorAll("video")].filter(
        (video) => !video.paused && video.currentSrc.includes("drift-take")
      );
      if (audio && !audio.paused && playing.length === 1)
        rows.push({
          clock,
          audio: audio.currentTime - (music.sourceInSeconds + clock - music.startSeconds),
          picture: playing[0].currentTime - (take.sourceIn + clock - take.start),
        });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const worst = (key) => Math.max(...rows.map((row) => Math.abs(row[key])));
  const mean = (key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  window.musicDrift = {
    audioElements: audios.length,
    samples: rows.length,
    span: rows.length ? rows.at(-1).clock - rows[0].clock : 0,
    worstAudio: worst("audio"),
    meanAudio: mean("audio"),
    worstPicture: worst("picture"),
    meanPicture: mean("picture"),
  };
  return window.musicDrift;
};
```

Each sample compares, on one animation frame, where the music's player is and where the picture is with where the timeline's clock says they should be.

Expected: `audioElements` 1, `samples` above 900, `span` at least 29, `worstAudio` under 1/30 and `worstPicture` under 1/30. Record all seven numbers for the report. Far fewer samples mean the window was covered or the tab hidden: bring the tab to the front and run the step again. If the call times out before it returns, wait with a Monitor until-loop and read `window.musicDrift`. A picture or music failure goes to an Opus subagent for diagnosis with superpowers:systematic-debugging, then to a Sonnet implementer with a test that reproduces it and a pathspec commit, and this step runs again. This is the spec's risk "Preview music drifts from the picture", measured over 30 s.

- [ ] **Step 9: Check the lane and the panel at every size**

The music lane, the bar numbers and the Music panel are new elements in the Post editor, so the full seven-size pass applies. On music-drift, for each size (375×667 as a phone with touch, then 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440 and 3840×2160, and last 720×450, which is how 1440×900 reflows at 200% zoom), emulate it on the task tab, reload, wait for the music's button, and run:

```js
(() => {
  const clip = document.querySelector(".music-lane .music-clip");
  const marks = [...document.querySelectorAll(".time-ruler .mark")];
  const lefts = marks.map((mark) => mark.getBoundingClientRect().left);
  const gaps = lefts.slice(1).map((left, i) => left - lefts[i]);
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    clipHeight: clip ? clip.getBoundingClientRect().height : 0,
    gridLines: document.querySelectorAll(".music-clip .grid-line").length,
    marks: marks.length,
    firstMark: marks[0]?.textContent.trim() ?? null,
    narrowestGap: gaps.length ? Math.min(...gaps) : null,
    canvases:
      document.querySelector(".music-clip .wave > div")?.shadowRoot?.querySelectorAll("canvas").length ?? 0,
  };
})();
```

Expected at every size: `overflow` 0 or less, `clipHeight` above 0, `gridLines` above 0, `marks` at least 1 with `firstMark` "1", `narrowestGap` null or at least 28, and `canvases` at least 1 (the waveform can take a few seconds to draw; poll up to 10 s), with no console errors. Save a WebP screenshot at quality 70 as `$scratch\shots\music-lane-<width>.webp` and look at it: the lane reads as a row of the timeline, its label is readable, and the bar numbers and grid lines do not crowd. Then select the music, click the Music tool, save `$scratch\shots\music-panel-<width>.webp`, and run:

```js
(() => {
  const box = document.querySelector(".music-tool").getBoundingClientRect();
  return { left: box.left, right: innerWidth - box.right, top: box.top, below: box.bottom - innerHeight };
})();
```

Expected: `left`, `right` and `top` 0 or more; when `below` is above 0, the panel's own scroll reaches the Credit fields. At 375×667 and at 1440×900, also try a long name: run `node $cli music --label "A long track name to test the lane and the panel, extended mix, recorded live at the harbour stage, take three" --feature music-drift --url $url`, which goes to the open editor, save `$scratch\shots\music-long-name-<width>.webp` with the panel open, check that the name is cut with an ellipsis in the lane and wraps or is cut inside the panel without pushing anything out of view, then press Ctrl+Z (MCP `press_key` with `Control+z`) and confirm with `show --json` that the label is "Drift music" again.

Fix any defect through a Sonnet implementer with a pathspec commit, then repeat this step at the sizes it affects.

- [ ] **Step 10: Check the lane's drags at 1440×900**

The lane follows a real pointer with pointer capture, so its drags use the MCP `drag` tool, which moves the real mouse; synthetic events in a script do not drive it. The mouse aims at the middle of an element, and 0 s is the lane's left edge, where the left half of a start handle is out of view; so first move the music half a second in, which the open editor takes as one edit:

```powershell
node 'E:\worktrees\tka-platform\feature-video-music-lane\scripts\post-project.mjs' music --start 0.5 --feature music-drift --url 'http://localhost:5192'
```

Emulate 1440×900, reload music-drift, select the music with its button ("Music: Drift music, …"), and take a fresh `take_snapshot` before each drag for its element ids. Before the first drag, `show --json` has the music at `startSeconds` 0.5, `sourceInSeconds` 0, `sourceOutSeconds` 40, with `downbeatSeconds` 2.1. Read the music with `node $cli show --json --feature music-drift --url $url` before each drag, after it and after each Ctrl+Z (MCP `press_key` with `Control+z`):

1. Move: drag the music's button onto the "Trim the music's end" handle. `startSeconds` lands between 15 and 26; `sourceInSeconds` and `sourceOutSeconds` are unchanged. Save `$scratch\shots\music-moved-1440.webp`. Ctrl+Z brings `startSeconds` back to 0.5.
2. Start trim: drag the "Trim the music's start" handle onto the music's button. `startSeconds` lands between 15 and 26 and `sourceInSeconds` 0.5 below it, since trimming the start keeps the rest of the music where it sounds; `sourceOutSeconds` stays 40. Ctrl+Z brings back 0.5 and 0.
3. End trim: drag the "Trim the music's end" handle onto the music's button. `sourceOutSeconds` lands between 15 and 25; the start is unchanged. Ctrl+Z brings back 40.
4. Bar 1: drag the "Move bar 1" flag onto the music's button. `downbeatSeconds` lands between 15 and 25; `bpm` 120 and `beatsPerBar` 4 are unchanged. Ctrl+Z brings back 2.1.
5. Delete: with the music selected, click the Delete tool (`[data-tool="delete"]`, named "Delete"). `show --json` has no `music`. Ctrl+Z brings it back as it was.
6. Level: select the music and click the Music tool. Its Level reads "2%". Run `node $cli music --gain 0.5 --feature music-drift --url $url`; the Level reads "50%". Ctrl+Z, and it reads "2%" again.

With the music selected and its handles and flag showing, save `$scratch\shots\music-selected-1440.webp`. A failed drag or undo goes to a Sonnet implementer with the evidence and a test that reproduces it, then the failed item runs again.

- [ ] **Step 11: Aesthetic review with ui-bust**

Follow `.agents/skills/ui-bust/SKILL.md` and `docs/architecture/visual-review.md` in **Review** mode, not Plan: the lane reuses the timeline's row grammar, the panel uses the editor's panel primitives, and the approved spec placed both. Dispatch a separate reviewer, `model: opus`, read-only, and give it the brief and the frames from Steps 9 and 10 (or the route) before any of the builder's reasoning:

- Audience: Austen editing a feature video now; later, anyone making a post with music.
- Task: put one song under a post, set its beat grid, and line takes up with it.
- Real content: a synthetic click track and a test pattern. Record this as a validation limit.
- Owner constraints: the visual canon in `docs/architecture/visual-design-canon.md`.
- Success: the lane reads as part of the timeline; bar numbers and grid lines help without crowding; the panel matches the other editor panels; nothing clips at any size.

The report uses the template in `visual-review.md`, with rubric VR-1 and calibration NOT CALIBRATED. The evidence ledger was last researched on 2026-09-21; a refresh is due only once that date is more than 90 days old (after 2026-12-20). Allow at most two correction rounds: each fix goes through a Sonnet implementer with a pathspec commit, followed by the affected frames again. Any material tradeoff left after round two goes into the final report rather than a third round.

- [ ] **Step 12: Opus review**

Dispatch `superpowers:code-reviewer` with `model: opus`, read-only: review `git diff main...codex/feature-video-music-lane` in `E:/worktrees/tka-platform/feature-video-music-lane` against piece 2 of `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md` and this plan, and report findings ranked by severity, each with a concrete failure scenario. Check each finding against the code before acting on it. For each confirmed finding, dispatch one Sonnet implementer with the finding, the owned files and the test to add, committing with a pathspec. Then run Step 2 again, and the browser checks from Steps 7 to 10 that cover each changed path. Send Austen a two or three sentence milestone note: what the review found, what was fixed, what comes next.

- [ ] **Step 13: Merge into local main**

```powershell
git -C E:/worktrees/tka-platform/feature-video-music-lane status --short
git -C E:/worktrees/tka-platform/feature-video-music-lane merge --no-edit main
```

Expected: no status output, then "Already up to date." or a merge commit. Close the task tabs on port 5192, then stop only the recorded preview (`Stop-Process -Id <recorded id>`) and check that `Get-NetTCPConnection -LocalPort 5192 -ErrorAction SilentlyContinue` prints nothing, because a running server holds files the worktree removal must delete. Pass the resource gate (Step 3), then:

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/feature-video-music-lane --route /post
```

Run it from PowerShell, never Git Bash, which rewrites `--route /post` into a Windows path. It runs `npm run check` in the worktree, compiles the changed components, merges into local `main`, removes the worktree and deletes the branch. It refuses while any link other than the root `node_modules` junction exists in the worktree; remove a named link with `cmd /c rmdir <path>` and run it again. When it reports that `main` moved or that `.git/automerge.lock` is held, never delete the lock: wait, merge `main` into the branch again (Step 1), and run it again.

- [ ] **Step 14: Confirm the editor on the primary dev server**

```powershell
curl.exe -k -g -s -o NUL -w "%{http_code}" "https://[::1]:5173/post"
```

Expected: `200`. Anything else: ask Austen to restart the server from Agent Hub, and never start, stop or restart port 5173 yourself. In the task browser, load [https://localhost:5173/post?feature=promo-1-0](https://localhost:5173/post?feature=promo-1-0). The editor opens the promo with no music row, no Music tool while nothing is selected, and no console errors. Then load [https://localhost:5173/post?feature=](https://localhost:5173/post?feature=) and leave that tab open as the delivered view, so no idle editor holds promo-1-0 and later agent edits go to disk.

- [ ] **Step 15: Report**

Close every temporary tab. Send Austen the lane at 375 and 1440 and the panel at 1440 (his phone can't open links), with a plain two or three sentence note: the promo can now have its music under it, with the click and drift numbers from Steps 7 and 8, and nothing went live. Update the memory note `project_promo_video_1_0.md`: piece 2 on local main, not pushed; the click offsets and drift numbers; any follow-ups for piece 4 (the AAC start-up delay if one was measured; no op or command yet sets the takes' Sound; `show` does not print the music). Then ask the music question with AskUserQuestion, as multiple choice: Derail by Yellowbase (Recommended), fly away by dreem, or PARSEC by Autohacker. Collect any caption answers still outstanding from the five prompts.
