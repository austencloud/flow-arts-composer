# Studio Project Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Studio project library fills its box without page scroll, starts projects from three pills, names each kind once, puts sync problems on their own card and tells same-named projects apart.

**Architecture:** Per-project sync failures move from the page error string into an optional `problem` on each `PostProjectChoice`. `studio-library-entry.ts` carries that through, adds a `subtitle` for colliding titles and owns the kind labels. `StudioProjectLibrary.svelte` becomes a fixed grid (header and tools rows, one scrolling area) using `SegmentedControl` for filter and sort. `PostModule.svelte` does not change.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest (`npm run test:ci -- <paths>`), `npm run check:fast`.

**Spec:** `docs/superpowers/specs/2026-10-10-studio-library-design.md`

**Worktree:** `E:/worktrees/tka-platform/studio-library` on branch `codex/studio-library`. All paths below are relative to it. `node_modules` is a junction into the primary checkout: never delete it.

**Rules for every task:**
- Commit only the files the task names, with explicit pathspecs: `git commit -F - -- <paths>`. Never `git add -A` or `git add .`. No stash, reset or checkout of files.
- Do not touch `src/lib/features/post/PostModule.svelte` or anything under `src/lib/features/post-studio/`.
- No em dashes in code, comments or copy. No emojis.
- Do not start a dev server. Do not run `svelte-check` or `npm run check` (one machine-wide budget); `npm run check:fast` is allowed only in Task 4.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Sync problems belong to their project

**Files:**
- Modify: `src/lib/features/post/services/post-workspace-projects.ts:40-46`
- Modify: `src/lib/features/post/services/post-account-projects.ts:261-391` (`listSyncedPostProjects`)
- Test: `tests/unit/media-composition/post-account-cloud.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/media-composition/post-account-cloud.test.ts`, add this import after the existing imports (the module is already mocked by `vi.mock("#lib/shared/firestore/index.js", ...)` in the same file):

```ts
import { firestoreList } from "#lib/shared/firestore/index.js";
```

Inside `describe("account Post writes", () => { ... })`, right after the test named `"syncs a local source-free project and keeps it isolated by account"`, add:

```ts
  it("puts a missing source on the project's card, not the page", async () => {
    const lost = createEmptyPostProject({
      sequenceId: "lost-source",
      now: 7,
      title: "Lost",
    });
    expect(savePostProject(lost).ok).toBe(true);

    const listed = await listSyncedPostProjects();

    expect(listed.error).toBeNull();
    expect(listed.projects).toEqual([
      expect.objectContaining({
        sequenceId: "lost-source",
        problem: "Its source sequence is missing, so it stays on this device.",
      }),
    ]);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("keeps a project whose upload fails on the device with a card problem", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.cachedSource = source("stuck");
    const stuck = createEmptyPostProject({
      sequenceId: "stuck",
      now: 8,
      title: "Stuck",
    });
    expect(savePostProject(stuck).ok).toBe(true);
    mocks.transaction.mockRejectedValue(new Error("permission-denied"));

    const listed = await listSyncedPostProjects();

    expect(listed.error).toBeNull();
    expect(listed.projects).toEqual([
      expect.objectContaining({
        sequenceId: "stuck",
        problem: "It could not sync, so it stays on this device.",
      }),
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still reports a failed cloud listing on the page", async () => {
    vi.mocked(firestoreList).mockRejectedValueOnce(
      new Error("Cloud posts could not be listed.")
    );

    const listed = await listSyncedPostProjects();

    expect(listed.error).toBe("Cloud posts could not be listed.");
  });

  it("holds the guest claim open and reports a draft it could not import", async () => {
    const sequenceId = "studio-arrangement:lost-guest";
    const project = createEmptyPostProject({ sequenceId, now: 44 });
    localStorage.setItem(
      `tka:post-studio:project:v2:${sequenceId}`,
      JSON.stringify(project)
    );
    mocks.legacyChoices = [
      {
        sequenceId,
        title: "Lost guest",
        word: "",
        updatedAt: 44,
        hasDraft: true,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] })))
    );

    const listed = await listSyncedPostProjects();

    expect(localStorage.getItem("tka:post-studio:legacy-owner:v1")).toBeNull();
    expect(listed.error).toContain(
      `The source sequence for ${sequenceId} is unavailable.`
    );
  });
```

- [ ] **Step 2: Run the tests and confirm the first two fail**

Run: `npm run test:ci -- tests/unit/media-composition/post-account-cloud.test.ts`
Expected: "puts a missing source on the project's card" and "keeps a project whose upload fails" FAIL (`error` is a string and `problem` is missing). The other two may already pass; they guard behavior that must not change.

- [ ] **Step 3: Add `problem` to `PostProjectChoice`**

In `src/lib/features/post/services/post-workspace-projects.ts`, replace the interface at lines 40-46 with:

```ts
export interface PostProjectChoice {
  sequenceId: string;
  title: string;
  word: string;
  updatedAt: number;
  hasDraft: boolean;
  /** A sync problem that belongs to this project alone, shown on its card. */
  problem?: string;
}
```

- [ ] **Step 4: Collect per-project problems in `listSyncedPostProjects`**

In `src/lib/features/post/services/post-account-projects.ts`:

4a. Above `export async function listSyncedPostProjects()`, add:

```ts
const IMPORT_PROBLEM =
  "A copy from before sign-in could not be added to your account.";
const MISSING_SOURCE_PROBLEM =
  "Its source sequence is missing, so it stays on this device.";
const SYNC_PROBLEM = "It could not sync, so it stays on this device.";
```

4b. Directly after `const errors: string[] = [];` in that function, add:

```ts
  /**
   * Failures that belong to one project. Each shows on that project's card
   * when it is listed; one with no card falls back to the page error.
   */
  const problems = new Map<string, { card: string; page: string }>();
```

4c. In the legacy import loop, replace

```ts
      if (draft.error) {
        errors.push(draft.error);
        continue;
      }
```

with

```ts
      if (draft.error) {
        problems.set(choice.sequenceId, {
          card: IMPORT_PROBLEM,
          page: draft.error,
        });
        continue;
      }
```

4d. In the same loop, replace

```ts
        if (!source) {
          errors.push(
            `The source sequence for ${choice.sequenceId} is unavailable. The device draft was kept.`
          );
          continue;
        }
```

with

```ts
        if (!source) {
          problems.set(choice.sequenceId, {
            card: IMPORT_PROBLEM,
            page: `The source sequence for ${choice.sequenceId} is unavailable. The device draft was kept.`,
          });
          continue;
        }
```

4e. The legacy claim must still wait while any draft failed to import. Replace

```ts
    if (!owner && errors.length === 0) claimLegacyPosts(uid);
```

with

```ts
    if (!owner && errors.length === 0 && problems.size === 0)
      claimLegacyPosts(uid);
```

4f. In the upload loop, replace the whole `if (!remote) { ... }` branch body:

```ts
      if (!remote) {
        try {
          const source =
            project.sourceKind === "none"
              ? null
              : await resolvePostSequence(project.sequenceId);
          if (!source && project.sourceKind !== "none")
            throw new Error(
              `The source sequence for ${project.sequenceId} is unavailable. This post was kept on this device.`
            );
          revisions.set(revisionKey(uid, project.sequenceId), 0);
          await saveAccountPostProject(uid, project, source);
          cloudById.set(project.sequenceId, project);
        } catch (cause) {
          errors.push(
            cause instanceof Error
              ? cause.message
              : "A local post could not sync."
          );
        }
      } else if
```

with

```ts
      if (!remote) {
        try {
          const source =
            project.sourceKind === "none"
              ? null
              : await resolvePostSequence(project.sequenceId);
          if (!source && project.sourceKind !== "none") {
            problems.set(project.sequenceId, {
              card: MISSING_SOURCE_PROBLEM,
              page: `The source sequence for ${project.sequenceId} is unavailable. This post was kept on this device.`,
            });
            continue;
          }
          revisions.set(revisionKey(uid, project.sequenceId), 0);
          await saveAccountPostProject(uid, project, source);
          cloudById.set(project.sequenceId, project);
        } catch (cause) {
          console.warn(`[Post] ${project.sequenceId} could not sync:`, cause);
          problems.set(project.sequenceId, {
            card: SYNC_PROBLEM,
            page:
              cause instanceof Error
                ? cause.message
                : "A local post could not sync.",
          });
        }
      } else if
```

(Only the `if (!remote)` branch changes; keep the `else if (project.updatedAt > remote.updatedAt)` branch exactly as it is.)

4g. After the loop that fills `choices` and before the `return`, add:

```ts
  for (const [sequenceId, problem] of problems) {
    const choice = choices.get(sequenceId);
    if (choice) choices.set(sequenceId, { ...choice, problem: problem.card });
    else errors.push(problem.page);
  }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run test:ci -- tests/unit/media-composition/post-account-cloud.test.ts tests/unit/post-module-state.test.ts tests/unit/post-workspace-projects.test.ts`
Expected: all PASS, and the summary has no `Errors` line (an Errors line means skipped files).

- [ ] **Step 6: Commit**

```bash
git commit -F - -- src/lib/features/post/services/post-workspace-projects.ts src/lib/features/post/services/post-account-projects.ts tests/unit/media-composition/post-account-cloud.test.ts <<'EOF'
feat(post): sync problems show on their own project

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Library entries carry problems, subtitles and one name per kind

**Files:**
- Modify: `src/lib/features/post/components/studio-library-entry.ts` (whole file)
- Create: `tests/unit/post/studio-library-entry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/post/studio-library-entry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  studioKindLabels,
  studioLibraryEntries,
} from "#lib/features/post/components/studio-library-entry.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";

const feature = (
  slug: string,
  title: string,
  savedAt: number
): FeatureVideoSummary => ({
  slug,
  title,
  revision: 1,
  savedAt,
  sequenceId: "DCK",
});

describe("studioLibraryEntries", () => {
  it("tells same-named showcases apart by their folder", () => {
    const entries = studioLibraryEntries(
      [],
      [
        feature("generate-vertical", "Generate", 3),
        feature("generate-desktop", "Generate", 2),
        feature("generate-promo", " generate ", 1),
      ]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual([
      "Vertical",
      "Desktop",
      "Promo",
    ]);
  });

  it("uses the whole folder name when it does not start with the title", () => {
    const entries = studioLibraryEntries(
      [],
      [feature("launch-a", "Launch", 2), feature("teaser", "Launch", 1)]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual(["A", "teaser"]);
  });

  it("leaves unique titles without a subtitle", () => {
    const entries = studioLibraryEntries(
      [],
      [feature("promo-1-0", "1.0 promo", 2), feature("generate-promo", "Generate", 1)]
    );
    expect(entries.map((entry) => entry.subtitle)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("carries a project's sync problem to its entry", () => {
    const [entry] = studioLibraryEntries(
      [
        {
          sequenceId: "studio-project:tutorial:abc",
          title: "Lesson",
          word: "",
          updatedAt: 5,
          hasDraft: true,
          problem: "Its source sequence is missing, so it stays on this device.",
        },
      ],
      []
    );
    expect(entry).toMatchObject({
      kind: "tutorial",
      problem: "Its source sequence is missing, so it stays on this device.",
    });
  });

  it("names each kind once", () => {
    expect(studioKindLabels.tutorial).toEqual({
      one: "Tutorial",
      many: "Tutorials",
    });
    expect(studioKindLabels.showcase.many).toBe("Showcases");
    expect(studioKindLabels.arrangement.one).toBe("Arrangement");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:ci -- tests/unit/post/studio-library-entry.test.ts`
Expected: FAIL (`studioKindLabels` is not exported; `subtitle` and `problem` are undefined).

- [ ] **Step 3: Replace `studio-library-entry.ts`**

Write `src/lib/features/post/components/studio-library-entry.ts`:

```ts
import type { PostProjectChoice } from "../services/post-workspace-projects.js";
import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
import { studioProjectKindFromId } from "#lib/shared/media-composition/domain/studio-project-id.js";

export type StudioIntent = "tutorial" | "showcase" | "arrangement";

/** One name per kind, used by the start buttons, the filter and the cards. */
export const studioKindLabels: Record<StudioIntent, { one: string; many: string }> =
  {
    tutorial: { one: "Tutorial", many: "Tutorials" },
    showcase: { one: "Showcase", many: "Showcases" },
    arrangement: { one: "Arrangement", many: "Arrangements" },
  };

export interface StudioLibraryEntry {
  id: string;
  title: string;
  /** Tells apart entries of one kind that share a title. */
  subtitle?: string;
  word: string;
  updatedAt: number;
  kind: StudioIntent;
  sequenceId?: string;
  featureSlug?: string;
  /** A sync problem that belongs to this project alone. */
  problem?: string;
}

const titleKey = (entry: StudioLibraryEntry) =>
  `${entry.kind}:${entry.title.trim().toLocaleLowerCase()}`;

/** "generate-vertical" under "Generate" reads "Vertical"; otherwise the folder name. */
function folderSubtitle(slug: string, title: string): string {
  const prefix = title
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const rest =
    prefix && slug.startsWith(`${prefix}-`)
      ? slug.slice(prefix.length + 1)
      : "";
  return rest ? rest.charAt(0).toLocaleUpperCase() + rest.slice(1) : slug;
}

export function studioLibraryEntries(
  projects: PostProjectChoice[],
  features: FeatureVideoSummary[]
): StudioLibraryEntry[] {
  const entries = [
    ...projects.map((project): StudioLibraryEntry => {
      const kind = studioProjectKindFromId(project.sequenceId) ?? "tutorial";
      const fallback =
        kind === "arrangement"
          ? "Saved arrangement"
          : kind === "showcase"
            ? "Saved software showcase"
            : "Saved tutorial";
      return {
        id: project.sequenceId,
        sequenceId: project.sequenceId,
        title:
          project.title === project.sequenceId &&
          studioProjectKindFromId(project.sequenceId)
            ? fallback
            : project.title,
        word: project.word,
        updatedAt: project.updatedAt,
        kind,
        ...(project.problem ? { problem: project.problem } : {}),
      };
    }),
    ...features.map(
      (feature): StudioLibraryEntry => ({
        id: `feature:${feature.slug}`,
        featureSlug: feature.slug,
        title: feature.title,
        word: feature.sequenceId,
        updatedAt: feature.savedAt,
        kind: "showcase",
      })
    ),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
  const titles = new Map<string, number>();
  for (const entry of entries)
    titles.set(titleKey(entry), (titles.get(titleKey(entry)) ?? 0) + 1);
  return entries.map((entry) =>
    entry.featureSlug && (titles.get(titleKey(entry)) ?? 0) > 1
      ? { ...entry, subtitle: folderSubtitle(entry.featureSlug, entry.title) }
      : entry
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test:ci -- tests/unit/post/studio-library-entry.test.ts`
Expected: 5 tests PASS, no `Errors` line.

- [ ] **Step 5: Commit**

```bash
git commit -F - -- src/lib/features/post/components/studio-library-entry.ts tests/unit/post/studio-library-entry.test.ts <<'EOF'
feat(post): library entries name each kind once and tell twins apart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Project card shows the kind label, subtitle and problem; no cover caption

**Files:**
- Modify: `src/lib/features/post/components/StudioProjectCard.svelte`

No unit test: this is markup and style. Task 5 checks it in the browser.

- [ ] **Step 1: Use the shared labels**

In the `<script>`, change the import

```ts
  import type { StudioLibraryEntry } from "./studio-library-entry.js";
```

to

```ts
  import {
    studioKindLabels,
    type StudioLibraryEntry,
  } from "./studio-library-entry.js";
```

and delete the local constant:

```ts
  const labels = {
    tutorial: "Sequence video",
    showcase: "Software showcase",
    arrangement: "Arrangement",
  };
```

- [ ] **Step 2: Remove both cover captions**

Delete this block (after the `{/if}` that closes the image or video branch):

```svelte
        <span class="preview-label"
          >{moving
            ? preview.cover.kind === "video"
              ? "Playing source clip"
              : "Sequence preview"
            : "Source preview"}</span
        >
```

and this block (after the `.sequence-cover` div):

```svelte
        <span class="preview-label"
          >{moving ? "Sequence preview" : "Source sequence"}</span
        >
```

- [ ] **Step 3: Name the button with its subtitle and problem**

Replace

```svelte
    aria-label={`Open ${entry.title}`}
```

with

```svelte
    aria-label={`Open ${entry.title}${entry.subtitle ? `, ${entry.subtitle}` : ""}${entry.problem ? ", not synced" : ""}`}
```

- [ ] **Step 4: Replace the card text**

Replace the whole `<div class="card-text"> ... </div>` block with:

```svelte
    <div class="card-text">
      <span class="kind-row"
        ><span class="kind">{studioKindLabels[entry.kind].one}</span
        >{#if entry.problem}<span class="problem-badge"
            ><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            Not synced</span
          >{/if}</span
      >
      <div class="title" title={entry.title}>
        {#if isTkaWord(entry.title)}<TKAWordGlyph
            word={entry.title}
            height={24}
            darkMode
          />{:else}{entry.title}{/if}
      </div>
      {#if entry.subtitle}<span class="subtitle">{entry.subtitle}</span>{/if}
      <span class="details">{details}</span>
      {#if entry.problem}<span class="problem">{entry.problem}</span>{/if}
    </div>
```

- [ ] **Step 5: Update the styles**

In `<style>`, replace the shared rule and the caption rule:

```css
  .duration,
  .preview-label {
    position: absolute;
    bottom: 10px;
    padding: 4px 7px;
    border-radius: 4px;
    background: #14161dee;
    color: #fff;
    font-size: 12px;
    line-height: 1.2;
    z-index: 2;
  }
  .duration {
    right: 10px;
    font-variant-numeric: tabular-nums;
  }
  .preview-label {
    left: 10px;
  }
```

with

```css
  .duration {
    position: absolute;
    bottom: 10px;
    right: 10px;
    padding: 4px 7px;
    border-radius: 4px;
    background: #14161dee;
    color: #fff;
    font-size: 12px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    z-index: 2;
  }
```

Then, after the existing `.kind { ... }` rule, add:

```css
  .kind-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
  }
  /* A status tag, not a control: tinted, no border, no hover. */
  .problem-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--semantic-warning) 16%, transparent);
    color: var(--semantic-warning-text, var(--semantic-warning));
    font-size: 12px;
    line-height: 1.3;
  }
  .subtitle {
    margin-top: -4px;
    font-size: 13px;
    color: var(--theme-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .problem {
    font-size: 12px;
    line-height: 1.5;
    color: var(--semantic-warning-text, var(--semantic-warning));
  }
```

- [ ] **Step 6: Confirm nothing else referenced the removed names**

Run: `grep -n "preview-label\|labels\[" src/lib/features/post/components/StudioProjectCard.svelte`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git commit -F - -- src/lib/features/post/components/StudioProjectCard.svelte <<'EOF'
feat(post): project cards show subtitles and sync problems, drop captions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The library becomes one fixed screen

**Files:**
- Modify: `src/lib/features/post/components/StudioProjectLibrary.svelte` (whole file)

- [ ] **Step 1: Replace the file**

Write `src/lib/features/post/components/StudioProjectLibrary.svelte`:

```svelte
<script lang="ts">
  import { flip } from "svelte/animate";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    flipDuration,
    growFade,
    popIn,
  } from "#lib/shared/transitions/motion.js";
  import type { PostProjectChoice } from "../services/post-workspace-projects.js";
  import type { FeatureVideoSummary } from "#lib/shared/media-composition/domain/feature-video.js";
  import {
    studioKindLabels,
    studioLibraryEntries,
    type StudioIntent,
    type StudioLibraryEntry,
  } from "./studio-library-entry.js";
  import StudioProjectCard from "./StudioProjectCard.svelte";
  import StudioProjectCreate from "./StudioProjectCreate.svelte";
  import StudioArrangements from "./StudioArrangements.svelte";

  let {
    projects,
    features,
    loading,
    error,
    featureError,
    unreadableFeatures,
    onopen,
    onfeature,
    onrefresh,
  }: {
    projects: PostProjectChoice[];
    features: FeatureVideoSummary[];
    loading: boolean;
    error: string | null;
    featureError: string | null;
    unreadableFeatures: string[];
    onopen: (id: string, footage?: File) => void;
    onfeature: (slug: string) => void;
    onrefresh: () => void;
  } = $props();
  type KindFilter = StudioIntent | "all";
  type SortOrder = "recent" | "name";
  const kinds: StudioIntent[] = ["tutorial", "showcase", "arrangement"];
  let query = $state("");
  let filter = $state<KindFilter>("all");
  let sort = $state<SortOrder>("recent");
  let activePreview = $state<string | null>(null);
  let creating = $state(false);
  let intent = $state<StudioIntent | null>(null);
  let copying = $state<string | null>(null);
  let copyError = $state<string | null>(null);
  let width = $state(0);
  const entries = $derived(studioLibraryEntries(projects, features));
  const shown = $derived(
    entries
      .filter(
        (entry) =>
          (filter === "all" || entry.kind === filter) &&
          `${entry.title} ${entry.subtitle ?? ""} ${entry.word}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())
      )
      .sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title)
          : b.updatedAt - a.updatedAt
      )
  );
  /** At phone width the kind filter goes two by two so every label fits. */
  const narrow = $derived(width > 0 && width <= 500);
  const filters: {
    value: KindFilter;
    label: string;
    ariaLabel: string;
    count: number;
  }[] = $derived([
    {
      value: "all",
      label: "All",
      ariaLabel: `All projects, ${entries.length}`,
      count: entries.length,
    },
    ...kinds.map((kind) => {
      const count = entries.filter((entry) => entry.kind === kind).length;
      return {
        value: kind,
        label: studioKindLabels[kind].many,
        ariaLabel: `${studioKindLabels[kind].many}, ${count}`,
        count,
      };
    }),
  ]);
  const sorts: { value: SortOrder; label: string }[] = [
    { value: "recent", label: "Recent" },
    { value: "name", label: "Name" },
  ];
  function start(value: StudioIntent): void {
    intent = value;
    creating = true;
    activePreview = null;
  }
  async function copy(entry: StudioLibraryEntry): Promise<void> {
    copying = entry.id;
    copyError = null;
    activePreview = null;
    try {
      const service = await import("../services/studio-project-library.js");
      if (entry.featureSlug)
        onfeature(
          await service.duplicateSoftwareFeatureVideo(
            entry.featureSlug,
            `${entry.title} copy`
          )
        );
      else if (entry.sequenceId)
        onopen(
          await service.duplicateStudioProject(
            entry.sequenceId,
            `${entry.title} copy`
          )
        );
    } catch (cause) {
      copyError =
        cause instanceof Error
          ? cause.message
          : "The project could not be copied.";
    } finally {
      copying = null;
    }
  }
</script>

<div class="studio-library" bind:clientWidth={width}>
  <div class="library-top">
    <header class="library-header">
      <h1>Your projects <span class="count">{entries.length}</span></h1>
      <div class="start" role="group" aria-label="Start a project">
        {#each kinds as kind (kind)}
          <button
            type="button"
            class="start-button"
            aria-label={`New ${studioKindLabels[kind].one.toLocaleLowerCase()}`}
            onclick={() => start(kind)}
            ><i class="fas fa-plus" aria-hidden="true"></i><span
              >{studioKindLabels[kind].one}</span
            ></button
          >
        {/each}
      </div>
    </header>
    <div class="library-tools">
      <div class="filter">
        <SegmentedControl
          options={filters}
          value={filter}
          columns={narrow ? 2 : undefined}
          ariaLabel="Project types"
          onchange={(value) => {
            filter = value;
            activePreview = null;
          }}
        />
      </div>
      <label class="search"
        ><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input
          aria-label="Search projects"
          type="search"
          bind:value={query}
          placeholder="Find a project"
        /></label
      >
      <div class="sort">
        <SegmentedControl
          options={sorts}
          value={sort}
          ariaLabel="Sort projects"
          onchange={(value) => (sort = value)}
        />
      </div>
    </div>
  </div>
  <div class="library-scroll">
    {#if error || featureError || copyError}
      <div class="library-error" role="alert" transition:growFade>
        <p>{error || featureError || copyError}</p>
        <button
          type="button"
          onclick={() => {
            copyError = null;
            onrefresh();
          }}>Try again</button
        >
      </div>
    {/if}
    {#if unreadableFeatures.length}<p
        class="notice"
        role="status"
        transition:growFade
      >
        Could not read: {unreadableFeatures.join(", ")}. Earlier copies remain
        in each project’s history.
      </p>{/if}
    {#if copying}<p class="notice" role="status" transition:growFade>
        Creating a separate copy…
      </p>{/if}
    {#if loading && !entries.length}
      <div class="empty" role="status">
        <i class="fas fa-film" aria-hidden="true"></i>
        <h2>Loading your projects…</h2>
        <p>Finding saved edits and previews.</p>
      </div>
    {:else if !shown.length}
      <div class="empty">
        <i class="fas fa-film" aria-hidden="true"></i>
        <h2>
          {entries.length
            ? "No matching projects"
            : "Make something worth watching"}
        </h2>
        <p>
          {entries.length
            ? "Try a different name or project type."
            : "Start a tutorial, a showcase or an arrangement with the buttons above."}
        </p>
        {#if entries.length}<button
            type="button"
            onclick={() => {
              query = "";
              filter = "all";
            }}>Clear filters</button
          >{/if}
      </div>
    {:else}
      <div class="project-grid" aria-label="Saved projects">
        {#each shown as entry (entry.id + ":" + entry.updatedAt)}
          <div
            class="card-slot"
            animate:flip={{ duration: flipDuration() }}
            in:popIn
          >
            <StudioProjectCard
              {entry}
              active={activePreview === entry.id}
              onpreview={(id) => (activePreview = id)}
              onopen={() =>
                entry.featureSlug
                  ? onfeature(entry.featureSlug)
                  : onopen(entry.sequenceId!)}
              oncopy={() => void copy(entry)}
              disabled={copying !== null}
            />
          </div>
        {/each}
      </div>
    {/if}
    <StudioArrangements {onopen} />
    <footer class="library-footer">
      <span
        ><i class="fas fa-cloud" aria-hidden="true"></i>
        {authState.user && !authState.user.isAnonymous
          ? "Edits sync with your account."
          : "Edits are saved on this device."} Device videos are kept in this browser;
        on another device, pick them again.</span
      >
      {#if features.length}<span
          >Software project folders are saved on this computer.</span
        >{/if}
    </footer>
  </div>
</div>
<StudioProjectCreate
  open={creating}
  {intent}
  {entries}
  onclose={() => (creating = false)}
  {onopen}
  {onfeature}
/>

<style>
  /* One fixed screen: the header and tools stay put, only the grid area scrolls. */
  .studio-library {
    --library-pad: clamp(16px, 3vw, 48px);
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 16px;
    padding-top: var(--library-pad);
    overflow: hidden;
    container: studio-library / inline-size;
  }
  .library-top {
    display: grid;
    gap: 16px;
    padding-inline: var(--library-pad);
  }
  .library-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 20px;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: -0.02em;
    line-height: 1.15;
    font-weight: 650;
  }
  .count {
    margin-left: 8px;
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-text-secondary);
    font-variant-numeric: tabular-nums;
  }
  button,
  input {
    font: inherit;
    color: inherit;
  }
  button {
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .start {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .start-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      background-color var(--duration-fast) var(--ease-out);
  }
  .start-button i {
    font-size: 12px;
    color: var(--theme-accent);
  }
  .start-button:hover {
    border-color: var(--theme-text-secondary);
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
  }
  .library-tools {
    display: grid;
    grid-template-columns: minmax(0, 34rem) minmax(0, 1fr) minmax(12rem, 18rem) 10rem;
    grid-template-areas: "filter . search sort";
    align-items: center;
    gap: 12px;
  }
  .filter {
    grid-area: filter;
    min-width: 0;
  }
  .search {
    grid-area: search;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding-left: 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-secondary);
    background: var(--theme-card-bg);
  }
  .sort {
    grid-area: sort;
    min-width: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 42px;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 14px;
  }
  .library-scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px var(--library-pad) var(--library-pad);
  }
  .project-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr));
    align-items: start;
    gap: 24px;
  }
  .card-slot {
    min-width: 0;
  }
  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    text-align: center;
    min-height: 240px;
    padding: 30px 16px;
    border: 1px dashed var(--theme-stroke);
    border-radius: 10px;
  }
  .empty > i {
    font-size: 28px;
    color: var(--theme-text-secondary);
  }
  .empty h2 {
    margin: 18px 0 8px;
    font-size: 20px;
    font-weight: 600;
  }
  .empty p {
    margin: 0 0 20px;
    max-width: 360px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .empty button,
  .library-error button {
    padding: 10px 14px;
    min-height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    background: var(--theme-card-bg);
    font-size: 14px;
  }
  .library-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: 14px;
  }
  .library-error p {
    margin: 0;
  }
  .notice {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text-secondary);
  }
  .library-footer {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    border-top: 1px solid var(--theme-stroke);
    padding-top: 20px;
    margin-top: 32px;
    color: var(--theme-text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  @container studio-library (max-width: 850px) {
    .library-tools {
      grid-template-columns: minmax(0, 1fr) 10rem;
      grid-template-areas:
        "search sort"
        "filter filter";
    }
  }
  @container studio-library (max-width: 500px) {
    h1 {
      font-size: 1.375rem;
    }
    .library-header {
      display: grid;
    }
    .start {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .start-button {
      flex-direction: column;
      gap: 4px;
      min-height: 56px;
      padding: 8px 4px;
      border-radius: 12px;
    }
    .project-grid {
      gap: 16px;
    }
  }
  @container studio-library (min-width: 2000px) {
    .project-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
```

- [ ] **Step 2: Run the nearby tests**

Run: `npm run test:ci -- tests/unit/post tests/unit/post-module-state.test.ts tests/unit/media-composition/post-account-cloud.test.ts`
Expected: all PASS, no `Errors` line.

- [ ] **Step 3: Run the type gate**

First confirm no other `svelte-check` is running:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|svelte-fast-check' } | Select-Object ProcessId
```

If one is running, wait for it to finish. Then run: `npm run check:fast`
Expected: exit 0 with no errors in `src/lib/features/post/`.

- [ ] **Step 4: Check for raw chips, checkboxes, dropdowns and raw motion**

Run: `grep -nE "type=\"checkbox\"|<select|transition: all|cubic-bezier|[0-9]+ms" src/lib/features/post/components/StudioProjectLibrary.svelte src/lib/features/post/components/StudioProjectCard.svelte`
Expected: no new matches (any match must be pre-existing in StudioProjectCard and unrelated to this change).

- [ ] **Step 5: Commit**

```bash
git commit -F - -- src/lib/features/post/components/StudioProjectLibrary.svelte <<'EOF'
feat(post): Studio library fits one screen with pill starts and segmented filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Browser verification (controller)

The controller does this task, not a subagent.

- [ ] Start a task-owned Vite server from the worktree on a free port after the resource checks in `.claude/rules/resource-budget.md` (never port 5173).
- [ ] Open `/post` and measure at 375x667, 412x915, 707x772, 823x600, 820x1180, 1440x900, 1920x1080, 2560x1440 and 3840x2160, plus 200% zoom at 1440x900: `document.documentElement.scrollHeight === clientHeight`, the library root's `scrollHeight === clientHeight`, no horizontal overflow, header and tools fully on screen.
- [ ] Confirm the three Generate cards read Vertical, Desktop and Promo; the fixture project shows Not synced and no page banner names it; the start pills open the create dialog with the right intent; the filter and sort change the grid.
- [ ] Stop the server, merge `main` into the branch if it moved, and run `npm run wt:finish -- codex/studio-library --route /post` from `E:/tka-platform`.
