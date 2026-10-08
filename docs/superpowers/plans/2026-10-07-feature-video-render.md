# Feature Video End Card and Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A feature video's end card keeps a scan link that its QR code shows to anyone, signed in or not, and one command renders the project into its `exports/` folder, with stills and a contact sheet for review.

**Architecture:** The Post card item gains `qrUrl`. The editor canvas passes it through the media layer and the choreo layer (and the shared studio card frame) to the Choreo Card's existing `qrUrl` prop, which draws that link's code without an account. `post-project.mjs render` queues a render job on the dev bridge. The editor's dev client sees the job in its heartbeat answer, runs the editor's own `renderPost()`, sends the MP4 to a new loopback `exports` route, and reports progress and the saved file through later heartbeats, where the CLI reads them. `render --open` first opens the editor in a private headless Chrome. `stills` and `contact-sheet` call ffmpeg on the saved file.

**Tech Stack:** Node 24, SvelteKit 2 dev routes, Svelte 5 runes, Zod 4.3, raw Chrome DevTools Protocol, ffmpeg 8.0.1, Vitest 4 (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-06-feature-video-pipeline-design.md`, piece 4.

**Depends on:** plans 1 to 3, all on local `main`. Base of this branch: `main` at `582bdb5533`.

**Where this plan departs from the spec:**

- **`render --open` uses a private headless Chrome.** The spec says the capture Chrome, which piece 3 retired. `render --open` starts its own headless Chrome the way `capture.mjs` does and closes it afterwards. A spike on 2026-10-07 in that Chrome measured a secure context on `http://localhost`, a visible and focused page, about 57 animation frames a second, and working H.264 and AAC encoders, which is everything the editor's exporter needs.
- **Two new ops, `add-card` and `sound`.** The spec names neither. The render check builds its test project through the CLI, so it needs a way to put a card with a link at the end and to render without the take's own sound.
- **The Scan link field shows only in a feature video's editor.** An ordinary post's card keeps the account's own code, as now. A typed link on ordinary posts would be a new product surface, which is Austen's call.
- **Stills and contact sheets have fixed names.** The spec does not name them. Stills go to `exports/stills/<export>-<t>s.jpg` and the sheet to `exports/stills/<export>-contact.jpg`, beside the render they came from.
- **No new QR wait.** The exporter already waits until no `[data-qr-pending="true"]` element remains, and a card with a saved link never sets that attribute.
- **A bridge render waits for the editor.** It waits up to 60 seconds for the editor to be ready to render (fonts, the labeled card, the overlay), then fails with the editor's own reason.
- **Loudness is already covered.** The existing `loudness` command measures any render; this plan adds nothing for it.

---

## Ground rules for every task

- Work only in `E:/worktrees/tka-platform/feature-video-render` on branch `codex/feature-video-render`. Never edit, stage or commit anything in `E:/tka-platform`.
- Never run `pnpm install` or `npm install`. Never delete, move or recreate `node_modules`: it is a junction into the primary checkout.
- Never start a dev server and never touch port 5173. Never touch port 9222 or any Chrome you did not start. No task needs a browser; the coordinator does the browser checks.
- Never run `svelte-check`, `npm run check`, `npm run check:fast` or a build. The coordinator runs the type checks.
- Run tests from the worktree root with `npx vitest run --config tests/config/vitest.config.ts <files>`. The config runs jsdom; do not add `@vitest-environment` comments. Tests that need ffmpeg find it through `FFMPEG_DIR`, then `C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin`, then `PATH`, and skip without it. A skipped test is a result to report, not a pass.
- Each edit to an existing file is a **Find** block and its replacement. The Find text must occur exactly once in the file, whitespace included. When it occurs zero times or more than once, stop and report it; never guess where an edit goes. Apply a task's edits in the order given.
- Commit only the paths the task names: `git add <paths>`, then `git commit -m "<message>" -- <paths>`. End every commit message with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never use `git add -A`, `git add .`, `git add -u`, `git stash`, `git reset --hard`, `git checkout --`, `git clean`, or any force flag.
- Run `npx prettier --write` only on the files a task's format step lists. These files are not prettier-clean and must never be formatted: `src/lib/shared/media-composition/domain/post-project-edits.ts`, `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte`, `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`, `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`. Never format this plan or any other Markdown file.
- Comments, messages and interface text use plain words: no em dashes, and none of robust, comprehensive, crucial, seamless, leverage, navigate, landscape, delve, utilize.
- When a command's output differs from the step's expected output for a reason the step does not explain, stop and report the output instead of improvising.

## Coordinator steps outside the tasks

The coordinator (the session running this plan) does these; implementers skip them.

1. Before Task 1, pass the resource gate in `.claude/rules/resource-budget.md` (at least 4096 MB free, no other `svelte-check` running) and record `npm run check:fast -- --no-svelte-warnings` so later runs can be compared. When comparing, join each path line with its error line and ignore line numbers.
2. After Tasks 3, 4 and 9, run the same `check:fast` command and compare it with the record. A new error in a file this plan touched goes back to that task's implementer.
3. After Task 13, start a task server from this worktree on port 5193 with a scratch `TKA_FEATURE_VIDEO_ROOT`, after the resource gate: `Start-Process node node_modules/vite/bin/vite.js --port 5193 --strictPort --host localhost`, plain http. Then run `node scripts/feature-video/render-check.mjs --url http://localhost:5193`, look at its stills (the card's QR should be in the 4.5 s one) and contact sheet, and send them to Austen as pictures.
4. Browser checks on the 5193 server in the agent's own browser: a guest sees the card's QR for a saved link; the Scan link field takes a good link, shows the rule for a bad one, and clears; a render from the editor's own button reports "Saved to exports/..." and still offers the download. Also confirm that a fresh headless Chrome loads `https://localhost:5173/` without a certificate error (read only), since `render --open` depends on it there.
5. One Opus review of the whole branch, then fixes.
6. Merge local `main` into the branch, then from `E:/tka-platform` run `npm run wt:finish -- codex/feature-video-render --route /post`. Verify `/post` on the primary server, then stop the task server.

---

## File map

| File | What it owns |
| --- | --- |
| `src/lib/shared/media-composition/domain/post-project.ts` | `qrUrl` on the card item, `isPostCardQrUrl`, the link rule |
| `src/lib/shared/media-composition/domain/post-project-edits.ts` | `updateItem` sets and clears a card's link |
| `src/lib/shared/media-composition/domain/post-project-ops.ts` | The `add-card` and `sound` ops; the `item` op names a bad link |
| `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`, `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`, `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`, `src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts`, `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte` | Carry the link to the Choreo Card |
| `src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte` | The Scan link field |
| `src/lib/shared/media-composition/domain/feature-video-export.ts` (new) | Export file names, the exports route URL, the saved-export shape |
| `src/lib/server/feature-video-exports.ts` (new) | Streams a render into `exports/` without replacing an earlier one |
| `src/routes/api/dev/feature-videos/[slug]/exports/+server.ts` (new) | The loopback route that takes a render |
| `src/lib/shared/media-composition/services/feature-video-client.ts` | Sends a render to that route |
| `src/lib/server/post-project-dev-bridge.ts`, `src/routes/api/dev/post-project/+server.ts` | Render jobs: queue, hand to the editor, take its reports, answer the CLI |
| `src/lib/shared/media-composition/services/post-project-dev-client.ts` | Runs a render job in the editor and reports it |
| `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`, `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte` | The render hook; a feature video's render also lands in `exports/` |
| `scripts/feature-video/render.mjs` (new) | `render`: find or open the editor, queue, follow, report |
| `scripts/feature-video/stills.mjs` (new) | Stills and contact sheets with ffmpeg |
| `scripts/post-project.mjs` | `sound`, `add-card`, `render`, `stills`, `contact-sheet`; `show` prints a card's link and the sound |
| `scripts/feature-video/render-check.mjs` (new) | The end-to-end check against a task server |
| `docs/architecture/canonical-capabilities.md`, `docs/development/post-studio-manifest-bridge.md` | The new commands and routes |

New tests live in `tests/unit/media-composition/` (domain, server, client and CLI) and `tests/unit/scripts/` (scripts).

---

### Task 1: A card keeps a scan link

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project.ts`
- Modify: `src/lib/shared/media-composition/domain/post-project-edits.ts`
- Create: `tests/unit/media-composition/post-card-qr-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-card-qr-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POST_MAX_QR_URL_LENGTH,
  POST_QR_URL_RULE,
  PostCardItemSchema,
  findItem,
  isPostCardQrUrl,
} from "$lib/shared/media-composition/domain/post-project";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import { NOW, card, project, text } from "./post-project-fixtures";

const LINK = "https://tka.run/s/abc123";
/** Exactly as long as a card's link may be. */
const LONGEST = `https://tka.run/${"a".repeat(POST_MAX_QR_URL_LENGTH - 16)}`;
const ctx = { now: NOW + 1 };

describe("isPostCardQrUrl", () => {
  it("takes an https link up to the longest allowed", () => {
    expect(LONGEST).toHaveLength(POST_MAX_QR_URL_LENGTH);
    expect(isPostCardQrUrl(LINK)).toBe(true);
    expect(isPostCardQrUrl(LONGEST)).toBe(true);
    expect(isPostCardQrUrl(`${LONGEST}a`)).toBe(false);
  });

  it.each([
    "http://tka.run/s/abc123",
    "javascript:alert(1)",
    "tka.run/s/abc123",
    "",
    "https://",
    " https://tka.run/s/abc123",
    "https://tka.run/s/abc 123",
    42,
    null,
    undefined,
  ])("refuses %j", (value) => {
    expect(isPostCardQrUrl(value)).toBe(false);
  });
});

describe("the card item's qrUrl", () => {
  it("is kept when it follows the rule and refused with the rule otherwise", () => {
    expect(
      PostCardItemSchema.parse({ ...card("end"), qrUrl: LINK })
    ).toMatchObject({
      qrUrl: LINK,
    });
    expect(
      PostCardItemSchema.safeParse({
        ...card("end"),
        qrUrl: "http://tka.run/s/abc123",
      }).success
    ).toBe(false);
    const tooLong = PostCardItemSchema.safeParse({
      ...card("end"),
      qrUrl: `${LONGEST}a`,
    });
    expect(tooLong.error?.issues[0]?.message).toBe(POST_QR_URL_RULE);
  });

  it("is optional", () => {
    expect(PostCardItemSchema.parse(card("end"))).not.toHaveProperty("qrUrl");
  });
});

describe("updateItem with qrUrl", () => {
  const before = project([card("end")], [[text("t", 0, 2)]]);

  it("sets a card's link, and null removes it", () => {
    const linked = updateItem(before, "end", { qrUrl: LINK }, ctx);
    expect(findItem(linked, "end")?.item).toMatchObject({ qrUrl: LINK });
    const cleared = updateItem(linked, "end", { qrUrl: null }, ctx);
    expect(findItem(cleared, "end")?.item).not.toHaveProperty("qrUrl");
  });

  it("passes over a link that breaks the rule", () => {
    expect(
      updateItem(before, "end", { qrUrl: "http://tka.run/s/abc123" }, ctx)
    ).toBe(before);
  });

  it("gives no other kind of item a link", () => {
    expect(updateItem(before, "t", { qrUrl: LINK }, ctx)).toBe(before);
  });
});
```

The fixture `project(main, overlays)` takes the overlay tracks as arrays of items, so `[[text("t", 0, 2)]]` is one overlay track with one text item.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-card-qr-url.test.ts`
Expected: FAIL. `isPostCardQrUrl` is not a function, and `POST_MAX_QR_URL_LENGTH` is undefined.

- [ ] **Step 3: Add the rule and the field to `post-project.ts`**

Edit `src/lib/shared/media-composition/domain/post-project.ts`. Apply these two edits in order.

Find:
```ts
export const POST_DEFAULT_CARD_SECONDS = 5;
```
Replace with:
```ts
export const POST_DEFAULT_CARD_SECONDS = 5;
/** Longest scan link a card keeps. */
export const POST_MAX_QR_URL_LENGTH = 200;
export const POST_QR_URL_RULE = `A card's link must be an https address with no spaces, at most ${POST_MAX_QR_URL_LENGTH} characters.`;
```

Find:
```ts
export const PostCardItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("card"),
```
Replace with:
```ts
/**
 * Whether a card can carry this scan link: an https address with a host, no
 * spaces, and at most POST_MAX_QR_URL_LENGTH characters.
 */
export function isPostCardQrUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > POST_MAX_QR_URL_LENGTH ||
    /\s/.test(value) ||
    !value.startsWith("https://")
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export const PostCardItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("card"),
    /** The link the card's QR shows instead of the account's own code. */
    qrUrl: z.string().refine(isPostCardQrUrl, POST_QR_URL_RULE).optional(),
```

- [ ] **Step 4: Let `updateItem` set and clear it**

Edit `src/lib/shared/media-composition/domain/post-project-edits.ts`. Apply these three edits in order. This file is not prettier-clean; keep the new lines in its style and do not format it.

Find:
```ts
  defaultBoxFor,
  findItem,
  itemEnd,
```
Replace with:
```ts
  defaultBoxFor,
  findItem,
  isPostCardQrUrl,
  itemEnd,
```

Find:
```ts
  cardAppearance?: PostCardItem["cardAppearance"] | null;
  qrAppearance?: PostImageItem["qrAppearance"] | null;
}

export function updateItem(
```
Replace with:
```ts
  cardAppearance?: PostCardItem["cardAppearance"] | null;
  qrAppearance?: PostImageItem["qrAppearance"] | null;
  /** A card's scan link; null removes it. A link that breaks the rule is passed over. */
  qrUrl?: string | null;
}

export function updateItem(
```

Find:
```ts
  if (item.kind === "card" && patch.cardAppearance !== undefined) {
    if (patch.cardAppearance) next.cardAppearance = patch.cardAppearance;
    else delete next.cardAppearance;
  }
  if (item.kind === "moves" && patch.mode) next.mode = patch.mode;
```
Replace with:
```ts
  if (item.kind === "card" && patch.cardAppearance !== undefined) {
    if (patch.cardAppearance) next.cardAppearance = patch.cardAppearance;
    else delete next.cardAppearance;
  }
  if (item.kind === "card" && patch.qrUrl !== undefined) {
    if (patch.qrUrl === null) delete next.qrUrl;
    else if (isPostCardQrUrl(patch.qrUrl)) next.qrUrl = patch.qrUrl;
  }
  if (item.kind === "moves" && patch.mode) next.mode = patch.mode;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-card-qr-url.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Run the nearby suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition`
Expected: PASS. Report any failure with its output; do not change other tests.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project.ts tests/unit/media-composition/post-card-qr-url.test.ts
git add src/lib/shared/media-composition/domain/post-project.ts src/lib/shared/media-composition/domain/post-project-edits.ts tests/unit/media-composition/post-card-qr-url.test.ts
git commit -m "feat(post): a card keeps a scan link its QR shows" -- src/lib/shared/media-composition/domain/post-project.ts src/lib/shared/media-composition/domain/post-project-edits.ts tests/unit/media-composition/post-card-qr-url.test.ts
```

---

### Task 2: The `add-card` and `sound` ops

**Files:**
- Modify: `src/lib/shared/media-composition/domain/post-project-ops.ts`
- Create: `tests/unit/media-composition/post-project-ops-card.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-ops-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  POST_DEFAULT_CARD_SECONDS,
  POST_QR_URL_RULE,
  findItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "$lib/shared/media-composition/domain/post-project-ops";
import { NOW, card, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
const LINK = "https://tka.run/s/abc123";
const apply = (before: PostProject, ...ops: PostProjectOp[]) =>
  applyPostProjectOps(before, ops, ctx);
/** An op as a script might send it, wrong types and all. */
const loose = (op: object) => op as unknown as PostProjectOp;

describe("add-card", () => {
  it("puts a card at the end of the main track", () => {
    const next = apply(project([video("v1")]), {
      op: "add-card",
      label: "End",
      fadeIn: 0.5,
    });
    const items = next.tracks[0]!.items;
    expect(items.map((item) => item.kind)).toEqual(["video", "card"]);
    expect(items[1]).toMatchObject({
      kind: "card",
      label: "End",
      start: 10,
      duration: POST_DEFAULT_CARD_SECONDS,
      fadeIn: 0.5,
    });
    expect(items[1]).not.toHaveProperty("qrUrl");
  });

  it("gives the card a link and shows the QR in its info cell", () => {
    const next = apply(project([video("v1")]), { op: "add-card", qrUrl: LINK });
    expect(next.tracks[0]!.items[1]).toMatchObject({
      kind: "card",
      qrUrl: LINK,
      cardAppearance: { infoCellChoice: "qr" },
    });
  });

  it("names what is wrong", () => {
    const before = project([video("v1")]);
    expect(() =>
      apply(before, { op: "add-card", qrUrl: "http://tka.run/s/abc123" })
    ).toThrow(POST_QR_URL_RULE);
    expect(() => apply(before, loose({ op: "add-card", fadeIn: -1 }))).toThrow(
      "fadeIn must be 0 or more."
    );
    expect(() => apply(before, loose({ op: "add-card", fadeIn: "1" }))).toThrow(
      "fadeIn must be 0 or more."
    );
    expect(() => apply(before, loose({ op: "add-card", label: 7 }))).toThrow(
      "label must be text."
    );
  });
});

describe("the item op and a card's link", () => {
  it("sets the link, and null removes it", () => {
    const linked = apply(project([card("end")]), {
      op: "item",
      item: "end",
      patch: { qrUrl: LINK },
    });
    expect(findItem(linked, "end")?.item).toMatchObject({ qrUrl: LINK });
    const cleared = apply(linked, {
      op: "item",
      item: "end",
      patch: { qrUrl: null },
    });
    expect(findItem(cleared, "end")?.item).not.toHaveProperty("qrUrl");
  });

  it("says why a link is refused", () => {
    expect(() =>
      apply(project([card("end")]), {
        op: "item",
        item: "end",
        patch: { qrUrl: "javascript:alert(1)" },
      })
    ).toThrow(POST_QR_URL_RULE);
  });
});

describe("sound", () => {
  it("sets whether the takes' own sound plays", () => {
    const before = project([video("v1")]);
    expect(before.audio).toBe("takes");
    expect(apply(before, { op: "sound", sound: "silent" }).audio).toBe(
      "silent"
    );
  });

  it("refuses anything but takes or silent", () => {
    expect(() =>
      apply(project([video("v1")]), loose({ op: "sound", sound: "loud" }))
    ).toThrow("sound must be takes or silent.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-ops-card.test.ts`
Expected: FAIL with `Unknown edit "add-card".` and `Unknown edit "sound".`

- [ ] **Step 3: Add the ops**

Edit `src/lib/shared/media-composition/domain/post-project-ops.ts`. Apply these six edits in order.

Find:
```ts
import {
  POST_BACKGROUNDS,
  POST_CANVAS_RATIOS,
  findItem,
```
Replace with:
```ts
import {
  POST_BACKGROUNDS,
  POST_CANVAS_RATIOS,
  POST_QR_URL_RULE,
  findItem,
  isPostCardQrUrl,
```

Find:
```ts
  addTunnelHook,
  appendVideoClip,
```
Replace with:
```ts
  addTunnelHook,
  appendCardClip,
  appendVideoClip,
```

Find:
```ts
  removeTunnelHook,
  setProjectBackground,
```
Replace with:
```ts
  removeTunnelHook,
  setProjectAudio,
  setProjectBackground,
```

Find:
```ts
  | ({ op: "music" } & MusicOpPatch)
  | { op: "remove-music" }
```
Replace with:
```ts
  | ({ op: "music" } & MusicOpPatch)
  | { op: "remove-music" }
  | {
      op: "add-card";
      label?: string;
      /** The link the card's QR shows; it also puts the QR in the card's info cell. */
      qrUrl?: string;
      fadeIn?: number;
    }
  | { op: "sound"; sound: PostProject["audio"] }
```

Find:
```ts
    case "item": {
      let next = project;
```
Replace with:
```ts
    case "item": {
      const qrUrl = (op.patch as { qrUrl?: unknown } | undefined)?.qrUrl;
      // updateItem passes over a link that breaks the rule; a script should hear why.
      if (qrUrl !== undefined && qrUrl !== null && !isPostCardQrUrl(qrUrl))
        throw new Error(POST_QR_URL_RULE);
      let next = project;
```

Find:
```ts
    case "remove-music":
      if (!project.music) throw new Error(NO_MUSIC);
      return removeMusic(project, ctx);
```
Replace with:
```ts
    case "remove-music":
      if (!project.music) throw new Error(NO_MUSIC);
      return removeMusic(project, ctx);
    case "add-card": {
      if (op.qrUrl !== undefined && !isPostCardQrUrl(op.qrUrl))
        throw new Error(POST_QR_URL_RULE);
      if (
        op.fadeIn !== undefined &&
        (typeof op.fadeIn !== "number" ||
          !Number.isFinite(op.fadeIn) ||
          op.fadeIn < 0)
      )
        throw new Error("fadeIn must be 0 or more.");
      if (op.label !== undefined && typeof op.label !== "string")
        throw new Error("label must be text.");
      const added = appendCardClip(project, ctx, {
        ...(op.label !== undefined ? { label: op.label } : {}),
        ...(op.fadeIn !== undefined ? { fadeIn: op.fadeIn } : {}),
      });
      if (op.qrUrl === undefined) return added.project;
      // The link shows only in the QR cell, so a card given one shows that cell.
      return updateItem(
        added.project,
        added.itemId,
        { qrUrl: op.qrUrl, cardAppearance: { infoCellChoice: "qr" } },
        ctx
      );
    }
    case "sound":
      if (op.sound !== "takes" && op.sound !== "silent")
        throw new Error("sound must be takes or silent.");
      return setProjectAudio(project, op.sound, ctx);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-ops-card.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the nearby suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition`
Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-card.test.ts
git add src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-card.test.ts
git commit -m "feat(post): add-card and sound ops" -- src/lib/shared/media-composition/domain/post-project-ops.ts tests/unit/media-composition/post-project-ops-card.test.ts
```

---

### Task 3: The link reaches the Choreo Card

The card's QR state already draws the code for a `qrUrl` with no account (`choreo-card-qr-state.svelte.ts` calls `generateForUrl`), and `resolveInfoCellDisplay` shows the QR cell for a guest when the card has one. This task only carries the saved link from the post to that prop, along both paths a card is drawn by: the choreo layer's own `ChoreoCard`, and the viewer's shared card surface, which draws from a `StudioCardFrame`.

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`
- Modify: `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`
- Modify: `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`
- Modify: `src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts`
- Modify: `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`

There is no unit test for this wiring: the project has no Svelte component test library, and the coordinator checks it in the browser and with `check:fast`.

- [ ] **Step 1: The canvas passes a card's link**

Edit `src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte`.

Find:
```svelte
                  {qrSequence}
                  tunnelHook={layer.tunnelHook ?? null}
```
Replace with:
```svelte
                  {qrSequence}
                  qrUrl={sourceItem?.kind === "card" ? sourceItem.qrUrl : undefined}
                  tunnelHook={layer.tunnelHook ?? null}
```

- [ ] **Step 2: The media layer takes it and hands it on**

Edit `src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte`. Apply these three edits in order.

Find:
```ts
    sequence: SequenceData;
    qrSequence?: SequenceData;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
```
Replace with:
```ts
    sequence: SequenceData;
    qrSequence?: SequenceData;
    /** A card's saved scan link, which its QR shows. */
    qrUrl?: string;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
```

Find:
```ts
    sequence,
    qrSequence,
    cardRenderOptions = null,
```
Replace with:
```ts
    sequence,
    qrSequence,
    qrUrl,
    cardRenderOptions = null,
```

Find:
```svelte
      {cardRenderOptions}
      {qrSequence}
    />
```
Replace with:
```svelte
      {cardRenderOptions}
      {qrSequence}
      {qrUrl}
    />
```

- [ ] **Step 3: The choreo layer gives it to both card paths**

Edit `src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte`. Apply these four edits in order. This file is not prettier-clean; do not format it.

Find:
```ts
    qrSequence = sequence,
  }: {
```
Replace with:
```ts
    qrSequence = sequence,
    qrUrl,
  }: {
```

Find:
```ts
    /** The source behind a labeled `sequence`; what a scan of the card opens. */
    qrSequence?: SequenceData;
  } = $props();
```
Replace with:
```ts
    /** The source behind a labeled `sequence`; what a scan of the card opens. */
    qrSequence?: SequenceData;
    /** A saved scan link the card's QR shows instead of the account's own code. */
    qrUrl?: string;
  } = $props();
```

Find:
```ts
        qrSequence,
        highlightedStepIndex,
        options: cardRenderOptions,
```
Replace with:
```ts
        qrSequence,
        qrUrl,
        highlightedStepIndex,
        options: cardRenderOptions,
```

Find:
```svelte
      {sequence}
      {qrSequence}
      {highlightedStepIndex}
```
Replace with:
```svelte
      {sequence}
      {qrSequence}
      {qrUrl}
      {highlightedStepIndex}
```

- [ ] **Step 4: The shared card frame carries it**

Edit `src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts`.

Find:
```ts
  qrSequence: SequenceData;
  highlightedStepIndex: number | null;
```
Replace with:
```ts
  qrSequence: SequenceData;
  /** A saved scan link the card's QR shows instead of the account's own code. */
  qrUrl?: string;
  highlightedStepIndex: number | null;
```

- [ ] **Step 5: The shared surface draws it**

Edit `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte`. This file is not prettier-clean; do not format it.

Find:
```svelte
        qrSequence={studioCard ? studioCard.qrSequence : sequence}
```
Replace with:
```svelte
        qrSequence={studioCard ? studioCard.qrSequence : sequence}
        qrUrl={studioCard?.qrUrl}
```

- [ ] **Step 6: Check the edits**

Run: `git diff --stat`
Expected: the five files above, each with 1 to 5 added lines and no removed lines.

Run: `npx prettier --check src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts`
Expected: `All matched files use Prettier code style!` If a file is listed, run `npx prettier --write` on that file only and look at the diff again: prettier may wrap the new `qrUrl=` line in `PostEditorCanvas.svelte`, which is fine.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte
git commit -m "feat(post): a card's saved link reaches the Choreo Card's QR" -- src/lib/shared/share/components/post-studio/editor/PostEditorCanvas.svelte src/lib/shared/share/components/post-studio/PostStudioMediaLayer.svelte src/lib/shared/share/components/post-studio/PostStudioChoreoLayer.svelte src/lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte.ts src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte
```

---

### Task 4: The Scan link field

In a feature video's editor, a selected card's Appearance tool gains a Scan link field under the card's own settings. A good link is saved and switches the card's info cell to the QR; an empty field removes the link; a bad link is not saved, and the field says why. The words are plain English, as the rest of the feature video controls are (`PostEditorWorkspace.svelte` and `PostExportPanel.svelte` already show untranslated feature video text).

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`

There is no unit test for this markup; the coordinator checks it in the browser.

- [ ] **Step 1: The field**

Edit `src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte`. Apply these seven edits in order.

Find:
```ts
    POST_MIN_ZOOM,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
```
Replace with:
```ts
    POST_MIN_ZOOM,
    POST_QR_URL_RULE,
    POST_TIME_EPSILON,
    findItem,
    isPostCardQrUrl,
    itemEnd,
```

Find:
```ts
    /** The animation's opening tunnel is what is selected, with a look of its own. */
    tunnel?: boolean;
  }
```
Replace with:
```ts
    /** The animation's opening tunnel is what is selected, with a look of its own. */
    tunnel?: boolean;
    /** A feature video's editor: a card can carry the link its QR shows. */
    featureMode?: boolean;
  }
```

Find:
```ts
    sequenceBusy = false,
    tunnel = false,
  }: Props = $props();
```
Replace with:
```ts
    sequenceBusy = false,
    tunnel = false,
    featureMode = false,
  }: Props = $props();
```

Find:
```ts
  function patchItem(patch: PostItemPatch): void {
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }
```
Replace with:
```ts
  function patchItem(patch: PostItemPatch): void {
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }

  /** The card whose typed link broke the rule, so its field says why. */
  let cardLinkErrorFor = $state<string | null>(null);

  function changeCardLink(value: string): void {
    if (item.kind !== "card") return;
    const link = value.trim();
    if (!link) {
      cardLinkErrorFor = null;
      patchItem({ qrUrl: null });
      return;
    }
    if (!isPostCardQrUrl(link)) {
      cardLinkErrorFor = item.id;
      return;
    }
    cardLinkErrorFor = null;
    // The link shows only in the QR cell, so setting one picks that cell.
    patchItem({
      qrUrl: link,
      cardAppearance: { ...item.cardAppearance, infoCellChoice: "qr" },
    });
  }
```

Find:
```svelte
      onchange={(value) => patchItem({ cardAppearance: value })}
    />
  {:else if tool === "appearance" && item.kind === "image"}
```
Replace with:
```svelte
      onchange={(value) => patchItem({ cardAppearance: value })}
    />
    {#if featureMode}
      <!-- Keyed so text typed for one card never shows on the next. -->
      {#key item.id}
        <div class="card-link">
          <span class="readout-name">Scan link</span>
          <input
            class="field"
            type="url"
            value={item.qrUrl ?? ""}
            placeholder="https://tka.run/..."
            aria-label="Scan link"
            disabled={locked}
            onchange={(event) => changeCardLink(event.currentTarget.value)}
          />
          {#if cardLinkErrorFor === item.id}
            <p class="link-error" role="alert">{POST_QR_URL_RULE}</p>
          {:else}
            <p class="hint">
              The card's QR opens this link for anyone who scans it.
            </p>
          {/if}
        </div>
      {/key}
    {/if}
  {:else if tool === "appearance" && item.kind === "image"}
```

Find:
```css
  .hook-titles {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
```
Replace with:
```css
  .hook-titles,
  .card-link {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
```

Find:
```css
  .field:disabled {
    opacity: 0.5;
  }
</style>
```
Replace with:
```css
  .field:disabled {
    opacity: 0.5;
  }

  .link-error {
    margin: 0;
    color: var(--semantic-error, #f87171);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
```

- [ ] **Step 2: The workspace turns it on for a feature video**

Edit `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`.

Find:
```svelte
      stepCount={displaySequence.steps?.length ?? 0}
      sequenceBusy={labeledCard.pending}
    />
```
Replace with:
```svelte
      stepCount={displaySequence.steps?.length ?? 0}
      sequenceBusy={labeledCard.pending}
      featureMode={!!featureVideo}
    />
```

- [ ] **Step 3: Format and check**

Run: `npx prettier --write src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
Then run: `git diff --stat`
Expected: only these two files. Every change adds lines except one: `.hook-titles {` becomes `.hook-titles,` (prettier may rewrap a line you added; it must not touch lines you did not add). If prettier changed lines you did not add, stop and report it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte
git commit -m "feat(post): Scan link field on a feature video's card" -- src/lib/shared/share/components/post-studio/editor/PostItemTool.svelte src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte
```

---

### Task 5: A render lands in `exports/`

A new loopback route takes a finished render as the request body and streams it into the project's `exports/` folder. It never replaces an earlier render: a second `check.mp4` lands as `check-2.mp4`. The names and the answer's shape live in a small domain file that the editor and the bridge share.

**Files:**
- Create: `src/lib/shared/media-composition/domain/feature-video-export.ts`
- Create: `src/lib/server/feature-video-exports.ts`
- Create: `src/routes/api/dev/feature-videos/[slug]/exports/+server.ts`
- Create: `tests/unit/media-composition/feature-video-exports.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-exports.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FeatureExportError,
  saveFeatureExport,
} from "$lib/server/feature-video-exports";
import { featureVideos } from "$lib/server/feature-video-store";
import {
  FEATURE_EXPORT_NAME_RULE,
  defaultFeatureExportName,
  featureVideoExportUrl,
  isFeatureExportName,
  isSavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";
import { POST as exportRoute } from "../../../src/routes/api/dev/feature-videos/[slug]/exports/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";

/** The first bytes of an MP4: a box size, "ftyp", then a brand. */
const MP4_HEAD = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];

/** A stand-in MP4 of `bytes` bytes (at least 12): a real head, then zeros. */
function mp4(bytes = 64): Uint8Array {
  const data = new Uint8Array(bytes);
  data.set(MP4_HEAD);
  return data;
}

function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("export names", () => {
  it.each([
    "promo.mp4",
    "Promo 1.0 final.MP4",
    "a_b-c.d.mp4",
    `${"a".repeat(100)}.mp4`,
  ])("takes %j", (name) => {
    expect(isFeatureExportName(name)).toBe(true);
  });

  it.each([
    "promo",
    "promo.mov",
    ".promo.mp4",
    "-promo.mp4",
    "../promo.mp4",
    "a/b.mp4",
    "a\\b.mp4",
    "a..b.mp4",
    "con.mp4",
    "LPT1.mp4",
    `${"a".repeat(101)}.mp4`,
    "",
    7,
    null,
  ])("refuses %j", (name) => {
    expect(isFeatureExportName(name)).toBe(false);
  });

  it("names a render after its project and the time it was made", () => {
    expect(
      defaultFeatureExportName("promo-1-0", new Date(2026, 9, 7, 9, 5, 3))
    ).toBe("promo-1-0-20261007-090503.mp4");
    expect(isFeatureExportName(defaultFeatureExportName("promo-1-0"))).toBe(
      true
    );
  });

  it("builds the route a render is sent to", () => {
    expect(featureVideoExportUrl("promo")).toBe(
      "/api/dev/feature-videos/promo/exports"
    );
    expect(featureVideoExportUrl("promo", "cut 1.mp4")).toBe(
      "/api/dev/feature-videos/promo/exports?name=cut%201.mp4"
    );
    expect(() => featureVideoExportUrl("../x")).toThrow(
      '"../x" is not a feature video name.'
    );
  });

  it("knows the dev server's answer for a saved render", () => {
    const saved = {
      file: "exports/a.mp4",
      path: "E:/videos/promo/exports/a.mp4",
      bytes: 9,
    };
    expect(isSavedFeatureExport(saved)).toBe(true);
    expect(isSavedFeatureExport({ ...saved, file: "a.mp4" })).toBe(false);
    expect(isSavedFeatureExport({ ...saved, bytes: 0 })).toBe(false);
    expect(isSavedFeatureExport({ ...saved, path: 3 })).toBe(false);
    expect(isSavedFeatureExport(null)).toBe(false);
  });
});

describe("saveFeatureExport", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await tempFeatureRoot();
    await fs.writeFile(path.join(dir, "project.json"), "{}");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const exportsList = () => fs.readdir(path.join(dir, "exports"));

  it("keeps a render and never replaces an earlier one", async () => {
    const first = await saveFeatureExport(dir, {
      name: "check.mp4",
      body: stream(mp4(40), mp4(24)),
    });
    expect(first).toEqual({
      file: "exports/check.mp4",
      path: path.join(dir, "exports", "check.mp4"),
      bytes: 64,
    });
    const second = await saveFeatureExport(dir, {
      name: "check.mp4",
      body: stream(mp4()),
    });
    expect(second.file).toBe("exports/check-2.mp4");
    expect((await exportsList()).sort()).toEqual(["check-2.mp4", "check.mp4"]);
    expect((await fs.readFile(first.path)).subarray(0, 12)).toEqual(
      Buffer.from(MP4_HEAD)
    );
  });

  it("refuses an empty body or one that is not an MP4, and keeps nothing", async () => {
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream() })
    ).rejects.toBeInstanceOf(FeatureExportError);
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream() })
    ).rejects.toMatchObject({ status: 400, message: "The render was empty." });
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(new TextEncoder().encode("not a video at all")),
      })
    ).rejects.toMatchObject({
      status: 415,
      message: "That is not an MP4 file.",
    });
    expect(await exportsList()).toEqual([]);
  });

  it("stops a render past the cap and keeps nothing", async () => {
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(mp4(12), mp4(12)),
        maxBytes: 16,
      })
    ).rejects.toMatchObject({
      status: 413,
      message: "A render can be at most 16 bytes.",
    });
    expect(await exportsList()).toEqual([]);
  });

  it("refuses a declared size past the cap before reading", async () => {
    await expect(
      saveFeatureExport(dir, {
        name: "check.mp4",
        body: stream(mp4()),
        declaredBytes: 17,
        maxBytes: 16,
      })
    ).rejects.toMatchObject({ status: 413 });
  });

  it("refuses a bad name and a folder with no project", async () => {
    await expect(
      saveFeatureExport(dir, { name: "../check.mp4", body: stream(mp4()) })
    ).rejects.toMatchObject({ status: 400, message: FEATURE_EXPORT_NAME_RULE });
    await fs.rm(path.join(dir, "project.json"));
    await expect(
      saveFeatureExport(dir, { name: "check.mp4", body: stream(mp4()) })
    ).rejects.toMatchObject({
      status: 404,
      message: "This feature video has no project file.",
    });
  });
});

describe("the exports route", () => {
  let root: string;
  let savedRoot: string | undefined;

  beforeEach(async () => {
    savedRoot = process.env.TKA_FEATURE_VIDEO_ROOT;
    root = await tempFeatureRoot();
    process.env.TKA_FEATURE_VIDEO_ROOT = root;
    await featureVideos().create({
      slug: "promo",
      title: "Promo",
      sequenceId: "seq",
    });
  });

  afterEach(async () => {
    if (savedRoot === undefined) delete process.env.TKA_FEATURE_VIDEO_ROOT;
    else process.env.TKA_FEATURE_VIDEO_ROOT = savedRoot;
    await fs.rm(root, { recursive: true, force: true });
  });

  const send = (query: string, body?: Uint8Array, type = "video/mp4") =>
    exportRoute(
      routeEvent(`/api/dev/feature-videos/promo/exports${query}`, {
        method: "POST",
        params: { slug: "promo" },
        headers: { "content-type": type },
        ...(body ? { body } : {}),
      }) as never
    );
  const exportsList = () => fs.readdir(path.join(root, "promo", "exports"));

  it("keeps the render in the project's exports folder", async () => {
    const response = await send("?name=check.mp4", mp4());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      file: "exports/check.mp4",
      bytes: 64,
    });
    expect(await exportsList()).toEqual(["check.mp4"]);
  });

  it("names a render after the project and the time when no name is sent", async () => {
    const response = await send("", mp4());
    expect((await response.json()).file).toMatch(
      /^exports\/promo-\d{8}-\d{6}\.mp4$/
    );
  });

  it("refuses another type, a bad name and an empty body", async () => {
    expect(
      await thrownStatus(() =>
        send("?name=check.mp4", mp4(), "application/json")
      )
    ).toBe(415);
    expect(await thrownStatus(() => send("?name=..%2Fcheck.mp4", mp4()))).toBe(
      400
    );
    expect(await thrownStatus(() => send("?name=check.mp4"))).toBe(400);
    expect(await exportsList()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-exports.test.ts`
Expected: FAIL, because `$lib/server/feature-video-exports` and `$lib/shared/media-composition/domain/feature-video-export` do not exist yet.

- [ ] **Step 3: The names and the answer's shape**

Create `src/lib/shared/media-composition/domain/feature-video-export.ts`:

```ts
import {
  FEATURE_VIDEO_API,
  isFeatureVideoSlug,
} from "$lib/shared/media-composition/domain/feature-video-url";

/**
 * Names for the renders a feature video keeps in its `exports/` folder, and
 * the answer the dev server gives once one is saved. The editor, the dev
 * bridge and the route share these.
 */

/** The largest render the dev server keeps. */
export const FEATURE_EXPORT_MAX_BYTES = 2 * 1024 ** 3;

export const FEATURE_EXPORT_NAME_RULE =
  "An export name starts with a letter or digit, uses only letters, digits, spaces, dots, dashes and underscores, and ends in .mp4 (at most 104 characters).";

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}\.mp4$/i;
/** Names Windows keeps for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

export function isFeatureExportName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NAME.test(value) &&
    !value.includes("..") &&
    !RESERVED.test(value)
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `<slug>-YYYYMMDD-HHMMSS.mp4`, in this computer's time. */
export function defaultFeatureExportName(
  slug: string,
  date = new Date()
): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${slug}-${day}-${time}.mp4`;
}

/** The route a render is sent to; `name` picks its file name in exports/. */
export function featureVideoExportUrl(slug: string, name?: string): string {
  if (!isFeatureVideoSlug(slug))
    throw new Error(`"${slug}" is not a feature video name.`);
  const route = `${FEATURE_VIDEO_API}/${slug}/exports`;
  return name ? `${route}?name=${encodeURIComponent(name)}` : route;
}

/** The dev server's answer once a render is in exports/. */
export interface SavedFeatureExport {
  /** Inside the project folder, like `exports/promo-1-0-20261007-090503.mp4`. */
  file: string;
  /** The whole path on this computer. */
  path: string;
  bytes: number;
}

export function isSavedFeatureExport(
  value: unknown
): value is SavedFeatureExport {
  if (!value || typeof value !== "object") return false;
  const saved = value as Record<string, unknown>;
  return (
    typeof saved.file === "string" &&
    saved.file.startsWith("exports/") &&
    typeof saved.path === "string" &&
    typeof saved.bytes === "number" &&
    Number.isFinite(saved.bytes) &&
    saved.bytes > 0
  );
}
```

- [ ] **Step 4: The writer**

Create `src/lib/server/feature-video-exports.ts`:

```ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FEATURE_EXPORT_MAX_BYTES,
  FEATURE_EXPORT_NAME_RULE,
  isFeatureExportName,
  type SavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";

/**
 * Keeps a finished render in a feature video's `exports/` folder. The body
 * streams to a hidden part file, so a render never sits whole in memory, and
 * lands under a name no earlier render has: a second `check.mp4` becomes
 * `check-2.mp4`. A render that fails partway leaves nothing behind.
 */

export class FeatureExportError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 415
  ) {
    super(message);
    this.name = "FeatureExportError";
  }
}

const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

function errorCode(cause: unknown): unknown {
  return cause && typeof cause === "object" && "code" in cause
    ? (cause as { code: unknown }).code
    : undefined;
}

function sizeText(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${Number((bytes / 1024 ** 3).toFixed(1))} GB`;
  if (bytes >= 1024 ** 2) return `${Number((bytes / 1024 ** 2).toFixed(1))} MB`;
  return `${bytes} bytes`;
}

function tooLarge(cap: number): FeatureExportError {
  return new FeatureExportError(
    `A render can be at most ${sizeText(cap)}.`,
    413
  );
}

/** Streams the body into `file`; returns its size and its first 8 bytes. */
async function writePart(
  file: string,
  body: ReadableStream<Uint8Array>,
  cap: number
): Promise<{ bytes: number; head: Buffer }> {
  const handle = await fs.open(file, "wx");
  const reader = body.getReader();
  const head = Buffer.alloc(8);
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > cap) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge(cap);
      }
      if (bytes < head.length)
        head.set(value.subarray(0, head.length - bytes), bytes);
      let written = 0;
      while (written < value.byteLength) {
        const { bytesWritten } = await handle.write(
          value,
          written,
          value.byteLength - written
        );
        written += bytesWritten;
      }
      bytes += value.byteLength;
    }
  } finally {
    await handle.close();
  }
  return { bytes, head };
}

/**
 * Claims `name` in `dir` by creating it empty, or `<stem>-2.mp4` and so on
 * when an earlier render has it. Returns the path it claimed.
 */
async function claimName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= 999; n += 1) {
    const candidate = path.join(dir, n === 1 ? name : `${stem}-${n}${ext}`);
    try {
      await (await fs.open(candidate, "wx")).close();
      return candidate;
    } catch (cause) {
      if (errorCode(cause) !== "EEXIST") throw cause;
    }
  }
  throw new FeatureExportError(
    `exports/ has no free name left for ${name}.`,
    409
  );
}

/** Windows refuses a rename while a scanner or indexer holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (cause) {
      if (attempt >= 3 || !RETRY_CODES.has(String(errorCode(cause))))
        throw cause;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

const removeQuietly = (file: string) =>
  fs
    .rm(file, { force: true, recursive: true, maxRetries: 5, retryDelay: 50 })
    .catch(() => undefined);

/**
 * Streams a render into `<projectDir>/exports/<name>`, numbering the name
 * when an earlier render has it.
 */
export async function saveFeatureExport(
  projectDir: string,
  input: {
    name: string;
    body: ReadableStream<Uint8Array>;
    /** The size the sender declared, when it declared one. */
    declaredBytes?: number;
    /** Tests lower this; the route keeps the default. */
    maxBytes?: number;
  }
): Promise<SavedFeatureExport> {
  const cap = input.maxBytes ?? FEATURE_EXPORT_MAX_BYTES;
  if (!isFeatureExportName(input.name))
    throw new FeatureExportError(FEATURE_EXPORT_NAME_RULE, 400);
  if (input.declaredBytes !== undefined && input.declaredBytes > cap)
    throw tooLarge(cap);
  try {
    await fs.access(path.join(projectDir, "project.json"));
  } catch {
    throw new FeatureExportError(
      "This feature video has no project file.",
      404
    );
  }
  const dir = path.join(projectDir, "exports");
  await fs.mkdir(dir, { recursive: true });
  const part = path.join(dir, `.${randomUUID()}.part`);
  let claimed: string | null = null;
  try {
    const { bytes, head } = await writePart(part, input.body, cap);
    if (bytes === 0) throw new FeatureExportError("The render was empty.", 400);
    // An MP4 opens with a box whose type, in bytes 4 to 8, is "ftyp".
    if (head.toString("latin1", 4, 8) !== "ftyp")
      throw new FeatureExportError("That is not an MP4 file.", 415);
    claimed = await claimName(dir, input.name);
    await renameWithRetry(part, claimed);
    return { file: `exports/${path.basename(claimed)}`, path: claimed, bytes };
  } catch (cause) {
    await removeQuietly(part);
    if (claimed) await removeQuietly(claimed);
    throw cause;
  }
}
```

- [ ] **Step 5: The route**

Create `src/routes/api/dev/feature-videos/[slug]/exports/+server.ts`:

```ts
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback } from "$lib/server/dev-loopback";
import {
  FeatureExportError,
  saveFeatureExport,
} from "$lib/server/feature-video-exports";
import {
  featureVideoFailure,
  featureVideos,
} from "$lib/server/feature-video-store";
import { defaultFeatureExportName } from "$lib/shared/media-composition/domain/feature-video-export";

/**
 * Dev only: keeps a finished render in a feature video's `exports/` folder.
 * The body is the MP4 itself. `?name=` picks the file name; a name an earlier
 * render has gets a number, so no render is ever replaced.
 */
export const POST: RequestHandler = async ({
  request,
  params,
  url,
  getClientAddress,
}) => {
  authorizeLoopback(request, getClientAddress);
  const slug = params.slug ?? "";
  try {
    const projectDir = featureVideos().folder(slug);
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("video/mp4"))
      error(415, "Send the render as video/mp4.");
    if (!request.body) error(400, "The render was empty.");
    const length = Number(request.headers.get("content-length") ?? "");
    const saved = await saveFeatureExport(projectDir, {
      name: url.searchParams.get("name") ?? defaultFeatureExportName(slug),
      body: request.body,
      ...(length > 0 ? { declaredBytes: length } : {}),
    });
    return json(saved, { status: 201 });
  } catch (cause) {
    if (cause instanceof FeatureExportError) error(cause.status, cause.message);
    featureVideoFailure(cause);
  }
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-exports.test.ts`
Expected: PASS, 29 tests.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/domain/feature-video-export.ts src/lib/server/feature-video-exports.ts "src/routes/api/dev/feature-videos/[slug]/exports/+server.ts" tests/unit/media-composition/feature-video-exports.test.ts
git add src/lib/shared/media-composition/domain/feature-video-export.ts src/lib/server/feature-video-exports.ts "src/routes/api/dev/feature-videos/[slug]/exports/+server.ts" tests/unit/media-composition/feature-video-exports.test.ts
git commit -m "feat(feature-video): keep renders in the project's exports folder" -- src/lib/shared/media-composition/domain/feature-video-export.ts src/lib/server/feature-video-exports.ts "src/routes/api/dev/feature-videos/[slug]/exports/+server.ts" tests/unit/media-composition/feature-video-exports.test.ts
```

---

### Task 6: The editor sends a render to `exports/`

**Files:**
- Modify: `src/lib/shared/media-composition/services/feature-video-client.ts`
- Create: `tests/unit/media-composition/feature-video-export-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/feature-video-export-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FEATURE_VIDEO_FILE_FORMAT,
  type FeatureVideoFile,
} from "$lib/shared/media-composition/domain/feature-video";
import { createEmptyPostProject } from "$lib/shared/media-composition/domain/post-project";
import {
  createFeatureVideoSync,
  saveFeatureVideoExport,
} from "$lib/shared/media-composition/services/feature-video-client";

const SAVED = {
  file: "exports/cut 1.mp4",
  path: "E:/videos/promo/exports/cut 1.mp4",
  bytes: 3,
};

const video = () =>
  new Blob([new Uint8Array([0, 0, 0])], { type: "video/mp4" });

/** A fetch stand-in that answers every request the same way. */
function answering(respond: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("saveFeatureVideoExport", () => {
  it("posts the render to the project's exports route", async () => {
    const { fetcher, calls } = answering(() =>
      Response.json(SAVED, { status: 201 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { name: "cut 1.mp4", fetcher })
    ).resolves.toEqual(SAVED);
    expect(calls[0]?.url).toBe(
      "/api/dev/feature-videos/promo/exports?name=cut%201.mp4"
    );
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
    });
    expect(calls[0]?.init?.body).toBeInstanceOf(Blob);
  });

  it("passes the dev server's reason on", async () => {
    const { fetcher } = answering(() =>
      Response.json({ message: "That is not an MP4 file." }, { status: 415 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow("That is not an MP4 file.");
  });

  it("refuses an answer that names no file in exports/", async () => {
    const { fetcher } = answering(() =>
      Response.json({ ...SAVED, file: "promo.mp4" }, { status: 201 })
    );
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow(
      "The dev server sent an unreadable answer about the export."
    );
  });

  it("says when the dev server cannot be reached", async () => {
    const { fetcher } = answering(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      saveFeatureVideoExport("promo", video(), { fetcher })
    ).rejects.toThrow("The dev server could not be reached.");
  });
});

describe("the sync's saveExport", () => {
  it("sends through the sync's own fetcher and lets the server pick the name", async () => {
    const { fetcher, calls } = answering(() =>
      Response.json(SAVED, { status: 201 })
    );
    const file: FeatureVideoFile = {
      format: FEATURE_VIDEO_FILE_FORMAT,
      slug: "promo",
      title: "Promo",
      revision: 1,
      savedAt: 1,
      project: createEmptyPostProject({ sequenceId: "seq", now: 1 }),
    };
    const sync = createFeatureVideoSync(file, { fetcher });
    await expect(sync.saveExport(video())).resolves.toEqual(SAVED);
    expect(calls[0]?.url).toBe("/api/dev/feature-videos/promo/exports");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-export-client.test.ts`
Expected: FAIL. `saveFeatureVideoExport` is not a function, and `sync.saveExport` is not a function.

- [ ] **Step 3: Add the sender**

Edit `src/lib/shared/media-composition/services/feature-video-client.ts`. Apply these three edits in order.

Find:
```ts
import {
  FEATURE_VIDEO_API,
  FeatureVideoFileSchema,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "$lib/shared/media-composition/domain/feature-video";
```
Replace with:
```ts
import {
  FEATURE_VIDEO_API,
  FeatureVideoFileSchema,
  type FeatureVideoFile,
  type FeatureVideoSummary,
} from "$lib/shared/media-composition/domain/feature-video";
import {
  featureVideoExportUrl,
  isSavedFeatureExport,
  type SavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";
```

Find:
```ts
  const parsed = FeatureVideoFileSchema.safeParse(body.file);
  if (!parsed.success)
    throw new Error(`The dev server sent an unreadable copy of ${slug}.`);
  return parsed.data;
}
```
Replace with:
```ts
  const parsed = FeatureVideoFileSchema.safeParse(body.file);
  if (!parsed.success)
    throw new Error(`The dev server sent an unreadable copy of ${slug}.`);
  return parsed.data;
}

/**
 * Sends a finished render to the project's exports/ folder. `name` picks its
 * file name; the dev server numbers it when an earlier render has that name.
 */
export async function saveFeatureVideoExport(
  slug: string,
  video: Blob,
  options: { name?: string; fetcher?: Fetcher } = {}
): Promise<SavedFeatureExport> {
  const fetcher = options.fetcher ?? fetch;
  const url = featureVideoExportUrl(slug, options.name);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: video,
    });
  } catch {
    throw new Error("The dev server could not be reached.");
  }
  const body = await readJson(response);
  if (!isSavedFeatureExport(body))
    throw new Error(
      "The dev server sent an unreadable answer about the export."
    );
  return { file: body.file, path: body.path, bytes: body.bytes };
}
```

Find:
```ts
    store,
    save,
    checkRevision,
```
Replace with:
```ts
    store,
    save,
    checkRevision,
    /** Sends a finished render to this project's exports/ folder. */
    saveExport: (video: Blob, name?: string) =>
      saveFeatureVideoExport(slug, video, {
        ...(name ? { name } : {}),
        fetcher,
      }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/feature-video-export-client.test.ts tests/unit/media-composition/feature-video-client.test.ts`
Expected: PASS. The new file has 5 tests; the existing client tests still pass.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/services/feature-video-client.ts tests/unit/media-composition/feature-video-export-client.test.ts
git add src/lib/shared/media-composition/services/feature-video-client.ts tests/unit/media-composition/feature-video-export-client.test.ts
git commit -m "feat(feature-video): the editor sends a render to exports" -- src/lib/shared/media-composition/services/feature-video-client.ts tests/unit/media-composition/feature-video-export-client.test.ts
```

---

### Task 7: Render jobs on the dev bridge

The CLI asks an open feature video editor to render. The bridge keeps one render job per editor session. The job is handed to the editor in each heartbeat answer until the editor reports that it started; later heartbeats carry the editor's progress and, at the end, the saved file or the reason it failed. The CLI reads the job through `GET /api/dev/post-project?sessionId=…&renderId=…`. While a render is queued or running, the bridge refuses edits, and while an edit is pending it refuses a render. A job the editor never starts fails after 30 seconds, and one whose editor goes silent for a minute fails too.

**Files:**
- Modify: `src/lib/server/post-project-dev-bridge.ts`
- Modify: `src/routes/api/dev/post-project/+server.ts`
- Create: `tests/unit/media-composition/post-project-render-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-render-bridge.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  heartbeatPostProject,
  postProjectRenderStatus,
  queuePostProjectOps,
  queuePostProjectRender,
  readRenderReport,
  type PostProjectRenderReport,
} from "$lib/server/post-project-dev-bridge";
import { FEATURE_EXPORT_NAME_RULE } from "$lib/shared/media-composition/domain/feature-video-export";
import {
  GET as statusRoute,
  POST as postProjectRoute,
} from "../../../src/routes/api/dev/post-project/+server";
import {
  routeEvent,
  tempFeatureRoot,
  thrownStatus,
} from "./feature-video-test-helpers";
import { project } from "./post-project-fixtures";

const SAVED = {
  file: "exports/check.mp4",
  path: "E:/videos/promo/exports/check.mp4",
  bytes: 2048,
};

/** An editor after its first heartbeat; promo's unless the test says none. */
function openEditor(featureSlug: string | null = "promo"): string {
  const sessionId = randomUUID();
  heartbeatPostProject({
    sessionId,
    revision: 0,
    snapshot: project([], [], []),
    ...(featureSlug ? { featureSlug } : {}),
  });
  return sessionId;
}

/** An edit that changes the empty post, which is 9:16. */
const toSquare = { op: "canvas" as const, canvas: "1:1" };

/** A folder for the edit backups the bridge writes, removed afterwards. */
async function inBackupFolder(run: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "render-bridge-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** A later heartbeat from a promo editor, with its render report if any. */
const beat = (sessionId: string, render?: PostProjectRenderReport) =>
  heartbeatPostProject({
    sessionId,
    revision: 0,
    featureSlug: "promo",
    ...(render ? { render } : {}),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a render job", () => {
  it("goes from the CLI to the editor and back", () => {
    const sessionId = openEditor();
    const queued = queuePostProjectRender({ sessionId, name: "check.mp4" });
    expect(queued).toEqual({ renderId: expect.any(String), state: "queued" });
    // Each heartbeat hands the job on until the editor says it started.
    expect(beat(sessionId).render).toEqual({
      id: queued.renderId,
      name: "check.mp4",
    });
    const started = beat(sessionId, {
      id: queued.renderId,
      state: "rendering",
      phase: "encoding",
      percent: 42,
    });
    expect(started).not.toHaveProperty("render");
    expect(postProjectRenderStatus(sessionId, queued.renderId)).toMatchObject({
      state: "rendering",
      phase: "encoding",
      percent: 42,
      message: "",
    });
    beat(sessionId, {
      id: queued.renderId,
      state: "completed",
      message: "Saved exports/check.mp4.",
      ...SAVED,
    });
    expect(postProjectRenderStatus(sessionId, queued.renderId)).toMatchObject({
      state: "completed",
      percent: 100,
      message: "Saved exports/check.mp4.",
      ...SAVED,
    });
  });

  it("takes reports only for its own job, and only until the job ends", () => {
    const sessionId = openEditor();
    const { renderId } = queuePostProjectRender({ sessionId });
    beat(sessionId, { id: "another", state: "failed", message: "Not this." });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "queued",
      message: "Waiting for the editor to start the render.",
    });
    beat(sessionId, { id: renderId, state: "failed" });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "failed",
      message: "The render failed.",
    });
    beat(sessionId, { id: renderId, state: "rendering", percent: 10 });
    expect(postProjectRenderStatus(sessionId, renderId)).toMatchObject({
      state: "failed",
    });
    expect(postProjectRenderStatus(sessionId, "missing")).toBeNull();
  });

  it("refuses what it cannot do, and says why", () => {
    expect(() => queuePostProjectRender({ sessionId: randomUUID() })).toThrow(
      "Editor session is not active."
    );
    expect(() =>
      queuePostProjectRender({ sessionId: openEditor(null) })
    ).toThrow("Only a feature video's editor renders to its folder.");
    const sessionId = openEditor();
    expect(() =>
      queuePostProjectRender({ sessionId, name: "../check.mp4" })
    ).toThrow(FEATURE_EXPORT_NAME_RULE);
    queuePostProjectRender({ sessionId });
    expect(() => queuePostProjectRender({ sessionId })).toThrow(
      "A render is already running in this editor."
    );
  });

  it("holds edits while the editor renders", () =>
    inBackupFolder(async (directory) => {
      const sessionId = openEditor();
      queuePostProjectRender({ sessionId });
      await expect(
        queuePostProjectOps({ sessionId, ops: [toSquare] }, directory)
      ).rejects.toThrow("The editor is rendering. Try again when it finishes.");
    }));

  it("waits for a pending edit before it renders", () =>
    inBackupFolder(async (directory) => {
      const sessionId = openEditor();
      await queuePostProjectOps({ sessionId, ops: [toSquare] }, directory);
      expect(() => queuePostProjectRender({ sessionId })).toThrow(
        "An edit is pending. Try again when it finishes."
      );
    }));

  it("fails a job the editor never starts, or drops partway", () => {
    const idle = openEditor();
    const first = queuePostProjectRender({ sessionId: idle });
    const dropped = openEditor();
    const second = queuePostProjectRender({ sessionId: dropped });
    beat(dropped, { id: second.renderId, state: "rendering", percent: 5 });

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    expect(postProjectRenderStatus(idle, first.renderId)).toMatchObject({
      state: "failed",
      message:
        "The editor did not start the render. Reload its tab and try again.",
    });
    // Its editor was heard from within the last minute.
    expect(postProjectRenderStatus(dropped, second.renderId)).toMatchObject({
      state: "rendering",
    });
    clock.mockReturnValue(now + 61_000);
    expect(postProjectRenderStatus(dropped, second.renderId)).toMatchObject({
      state: "failed",
      message: "The editor closed before the render finished.",
    });
  });
});

describe("readRenderReport", () => {
  it("keeps a good report and trims what is too long", () => {
    expect(
      readRenderReport({
        id: "r",
        state: "rendering",
        phase: "x".repeat(60),
        percent: 140,
        message: "m".repeat(400),
        extra: true,
      })
    ).toEqual({
      id: "r",
      state: "rendering",
      phase: "x".repeat(40),
      percent: 100,
      message: "m".repeat(300),
    });
    expect(readRenderReport({ id: "r", state: "completed", ...SAVED })).toEqual(
      { id: "r", state: "completed", ...SAVED }
    );
  });

  it.each([
    undefined,
    null,
    "rendering",
    { state: "rendering" },
    { id: "r", state: "paused" },
    { id: "r", state: "completed" },
    { id: "r", state: "completed", ...SAVED, file: "elsewhere.mp4" },
  ])("drops %j", (value) => {
    expect(readRenderReport(value)).toBeUndefined();
  });
});

describe("the post-project route", () => {
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

  const post = (body: Record<string, unknown>) =>
    postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify(body),
      }) as never
    );
  const get = (query: string) =>
    statusRoute(routeEvent(`/api/dev/post-project${query}`) as never);

  it("queues a render, takes the editor's report and answers its status", async () => {
    const sessionId = openEditor();
    const queued = await (
      await post({ kind: "render", sessionId, name: "check.mp4" })
    ).json();
    expect(queued).toEqual({ renderId: expect.any(String), state: "queued" });
    const answer = await (
      await post({
        kind: "heartbeat",
        sessionId,
        revision: 0,
        featureSlug: "promo",
        render: { id: queued.renderId, state: "rendering", percent: 30 },
      })
    ).json();
    expect(answer).not.toHaveProperty("render");
    const status = await (
      await get(`?sessionId=${sessionId}&renderId=${queued.renderId}`)
    ).json();
    expect(status).toMatchObject({ state: "rendering", percent: 30 });
  });

  it("refuses a broken render request and an unknown render", async () => {
    expect(
      await thrownStatus(() => post({ kind: "render", sessionId: 7 }))
    ).toBe(400);
    expect(
      await thrownStatus(() =>
        post({ kind: "render", sessionId: randomUUID() })
      )
    ).toBe(409);
    expect(
      await thrownStatus(() => get(`?sessionId=${randomUUID()}&renderId=r`))
    ).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-render-bridge.test.ts`
Expected: FAIL. `queuePostProjectRender` and `readRenderReport` are not functions.

- [ ] **Step 3: Add render jobs to the bridge**

Edit `src/lib/server/post-project-dev-bridge.ts`. Apply these seven edits in order.

Find:
```ts
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { isFeatureVideoSlug } from "$lib/shared/media-composition/domain/feature-video";
```
Replace with:
```ts
import { bridgeLockedChange } from "$lib/shared/media-composition/domain/post-project-bridge-guard";
import { isFeatureVideoSlug } from "$lib/shared/media-composition/domain/feature-video";
import {
  FEATURE_EXPORT_NAME_RULE,
  isFeatureExportName,
  isSavedFeatureExport,
  type SavedFeatureExport,
} from "$lib/shared/media-composition/domain/feature-video-export";
```

Find:
```ts
  featureSlug?: string;
  command?: Command;
  result?: Result;
};

const sessions = new Map<string, Session>();
const ACTIVE_MS = 10_000;
const MAX_SESSIONS = 12;
```
Replace with:
```ts
  featureSlug?: string;
  command?: Command;
  result?: Result;
  /** The last render the CLI asked this editor for. */
  render?: RenderJob;
};

/** A render the CLI asked an editor for, as the bridge last heard of it. */
export interface RenderJob {
  id: string;
  /** The file name the CLI asked for; without one the editor picks it. */
  name?: string;
  state: "queued" | "rendering" | "completed" | "failed";
  /** The exporter's phase while it runs, like "encoding". */
  phase: string | null;
  percent: number;
  message: string;
  /** Where the render landed, once it completed. */
  file?: string;
  path?: string;
  bytes?: number;
  queuedAt: number;
  updatedAt: number;
}

/** What an editor's heartbeat says about the render it was handed. */
export interface PostProjectRenderReport {
  id: string;
  state: "rendering" | "completed" | "failed";
  phase?: string;
  percent?: number;
  message?: string;
  file?: string;
  path?: string;
  bytes?: number;
}

const sessions = new Map<string, Session>();
const ACTIVE_MS = 10_000;
const MAX_SESSIONS = 12;
/** An editor starts a render on the heartbeat after it is queued. */
const RENDER_START_MS = 30_000;
/** A render whose editor has sent nothing for this long has stopped. */
const RENDER_QUIET_MS = 60_000;
const RENDER_MESSAGE_LIMIT = 300;
```

Find:
```ts
  featureSlug?: string;
  result?: {
    commandId: string;
    status: "completed" | "failed";
    message: string;
  };
}) {
```
Replace with:
```ts
  featureSlug?: string;
  result?: {
    commandId: string;
    status: "completed" | "failed";
    message: string;
  };
  render?: PostProjectRenderReport;
}) {
```

Find:
```ts
  session.seenAt = Date.now();
  const pending = session.command;
```
Replace with:
```ts
  session.seenAt = Date.now();
  applyRenderReport(session, input.render);
  const pending = session.command;
```

Find:
```ts
  return {
    command: session.command?.ready ? session.command : null,
    fingerprint: session.fingerprint,
  };
}
```
Replace with:
```ts
  settleRender(session);
  const job = session.render;
  return {
    command: session.command?.ready ? session.command : null,
    fingerprint: session.fingerprint,
    // Handed out until the editor reports that the render started.
    ...(job?.state === "queued"
      ? { render: { id: job.id, ...(job.name ? { name: job.name } : {}) } }
      : {}),
  };
}
```

Find:
```ts
    throw new Error("Editor session is not active.");
  if (session.command) throw new Error("An edit is already pending.");
```
Replace with:
```ts
    throw new Error("Editor session is not active.");
  if (session.command) throw new Error("An edit is already pending.");
  if (renderBusy(session))
    throw new Error("The editor is rendering. Try again when it finishes.");
```

Find:
```ts
export function postProjectEditStatus(sessionId: string, commandId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.command?.id === commandId) return { status: "pending" as const };
  if (session.result?.commandId === commandId) return { ...session.result };
  return null;
}
```
Replace with:
```ts
export function postProjectEditStatus(sessionId: string, commandId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.command?.id === commandId) return { status: "pending" as const };
  if (session.result?.commandId === commandId) return { ...session.result };
  return null;
}

/**
 * Asks a feature video's editor to render into its exports/ folder. The
 * editor's next heartbeat starts the render and later ones report on it;
 * postProjectRenderStatus answers with what they said.
 */
export function queuePostProjectRender(input: {
  sessionId: string;
  name?: string;
}) {
  const session = sessions.get(input.sessionId);
  if (!session || Date.now() - session.seenAt >= ACTIVE_MS)
    throw new Error("Editor session is not active.");
  if (!session.featureSlug)
    throw new Error("Only a feature video's editor renders to its folder.");
  if (input.name !== undefined && !isFeatureExportName(input.name))
    throw new Error(FEATURE_EXPORT_NAME_RULE);
  if (renderBusy(session))
    throw new Error("A render is already running in this editor.");
  if (session.command)
    throw new Error("An edit is pending. Try again when it finishes.");
  const now = Date.now();
  const job: RenderJob = {
    id: randomUUID(),
    ...(input.name !== undefined ? { name: input.name } : {}),
    state: "queued",
    phase: null,
    percent: 0,
    message: "Waiting for the editor to start the render.",
    queuedAt: now,
    updatedAt: now,
  };
  session.render = job;
  return { renderId: job.id, state: "queued" as const };
}

/** What the editor last said about a render, or null for an unknown one. */
export function postProjectRenderStatus(sessionId: string, renderId: string) {
  const session = sessions.get(sessionId);
  if (!session?.render || session.render.id !== renderId) return null;
  settleRender(session);
  return { ...session.render };
}

/**
 * A heartbeat's render report, checked. Undefined when the heartbeat has none
 * or one the bridge cannot read; a completed report must name the export.
 */
export function readRenderReport(
  value: unknown
): PostProjectRenderReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { id, state, phase, percent, message } = value as Record<
    string,
    unknown
  >;
  if (
    typeof id !== "string" ||
    (state !== "rendering" && state !== "completed" && state !== "failed")
  )
    return undefined;
  let saved: SavedFeatureExport | undefined;
  if (state === "completed") {
    if (!isSavedFeatureExport(value)) return undefined;
    saved = { file: value.file, path: value.path, bytes: value.bytes };
  }
  return {
    id,
    state,
    ...(typeof phase === "string" ? { phase: phase.slice(0, 40) } : {}),
    ...(typeof percent === "number" && Number.isFinite(percent)
      ? { percent: Math.min(100, Math.max(0, percent)) }
      : {}),
    ...(typeof message === "string"
      ? { message: message.slice(0, RENDER_MESSAGE_LIMIT) }
      : {}),
    ...saved,
  };
}

/** Takes the editor's report on the render it was handed, while it runs. */
function applyRenderReport(
  session: Session,
  report: PostProjectRenderReport | undefined
): void {
  const job = session.render;
  if (!report || !job || report.id !== job.id) return;
  if (job.state !== "queued" && job.state !== "rendering") return;
  job.state = report.state;
  job.phase = report.phase ?? null;
  job.percent =
    report.state === "completed" ? 100 : (report.percent ?? job.percent);
  if (report.state === "rendering") job.message = "";
  else
    job.message =
      report.message ?? (report.state === "failed" ? "The render failed." : "");
  if (report.state === "completed") {
    job.file = report.file;
    job.path = report.path;
    job.bytes = report.bytes;
  }
  job.updatedAt = session.seenAt;
}

function failRender(job: RenderJob, message: string, now: number): void {
  job.state = "failed";
  job.message = message;
  job.updatedAt = now;
}

/** Fails a render its editor dropped: never started, or gone silent. */
function settleRender(session: Session, now = Date.now()): void {
  const job = session.render;
  if (job?.state === "queued" && now - job.queuedAt > RENDER_START_MS)
    failRender(
      job,
      "The editor did not start the render. Reload its tab and try again.",
      now
    );
  else if (job?.state === "rendering" && now - session.seenAt > RENDER_QUIET_MS)
    failRender(job, "The editor closed before the render finished.", now);
}

/** True while this editor has a render queued or running. */
function renderBusy(session: Session): boolean {
  settleRender(session);
  const state = session.render?.state;
  return state === "queued" || state === "rendering";
}
```

- [ ] **Step 4: Route render requests and reports**

Edit `src/routes/api/dev/post-project/+server.ts`. Apply these five edits in order.

Find:
```ts
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";
```
Replace with:
```ts
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  postProjectRenderStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  queuePostProjectRender,
  readPostProjectSession,
  readRenderReport,
} from "$lib/server/post-project-dev-bridge";
```

Find:
```ts
  const sessionId = url.searchParams.get("sessionId");
  const commandId = url.searchParams.get("commandId");
  if (sessionId && commandId) {
```
Replace with:
```ts
  const sessionId = url.searchParams.get("sessionId");
  const commandId = url.searchParams.get("commandId");
  const renderId = url.searchParams.get("renderId");
  if (sessionId && renderId) {
    const status = postProjectRenderStatus(sessionId, renderId);
    if (!status) error(404, "Render not found");
    return json(status);
  }
  if (sessionId && commandId) {
```

Find:
```ts
      const featureSlug =
        typeof input.featureSlug === "string" ? input.featureSlug : undefined;
      const answer = heartbeatPostProject({
```
Replace with:
```ts
      const featureSlug =
        typeof input.featureSlug === "string" ? input.featureSlug : undefined;
      const render = readRenderReport(input.render);
      const answer = heartbeatPostProject({
```

Find:
```ts
        ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
```
Replace with:
```ts
        ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
        ...(render ? { render } : {}),
```

Find:
```ts
    if (input.kind === "ops") {
```
Replace with:
```ts
    if (input.kind === "render") {
      if (
        typeof input.sessionId !== "string" ||
        (input.name !== undefined && typeof input.name !== "string")
      )
        error(400, "Invalid render request");
      return json(
        queuePostProjectRender({
          sessionId: input.sessionId,
          ...(typeof input.name === "string" ? { name: input.name } : {}),
        })
      );
    }
    if (input.kind === "ops") {
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-render-bridge.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Run the nearby suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition`
Expected: PASS. The existing bridge tests (`post-project-dev-bridge.test.ts`, `feature-video-bridge.test.ts`, `post-project-cli*.test.ts`) must pass unchanged.

- [ ] **Step 7: Format and commit**

```bash
npx prettier --write src/lib/server/post-project-dev-bridge.ts src/routes/api/dev/post-project/+server.ts tests/unit/media-composition/post-project-render-bridge.test.ts
git add src/lib/server/post-project-dev-bridge.ts src/routes/api/dev/post-project/+server.ts tests/unit/media-composition/post-project-render-bridge.test.ts
git commit -m "feat(post): render jobs on the dev bridge" -- src/lib/server/post-project-dev-bridge.ts src/routes/api/dev/post-project/+server.ts tests/unit/media-composition/post-project-render-bridge.test.ts
```

---

### Task 8: The editor runs a render job

The editor's bridge client starts a render the heartbeat hands it, once, and reports it: `rendering` with the exporter's phase and percent while it runs, then `completed` with the saved file or `failed` with the reason. It keeps sending the ending until a heartbeat carries it. An editor with no render hook answers every job with a failure.

**Files:**
- Modify: `src/lib/shared/media-composition/services/post-project-dev-client.ts` (replace the whole file)
- Create: `tests/unit/media-composition/post-project-dev-render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-dev-render.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startPostProjectDevBridge,
  type PostProjectDevRender,
} from "$lib/shared/media-composition/services/post-project-dev-client";
import { project } from "./post-project-fixtures";

const SAVED = {
  file: "exports/check.mp4",
  path: "E:/videos/promo/exports/check.mp4",
  bytes: 2048,
};
/** Heartbeats come a second apart, so each wait allows a few. */
const WAIT = { timeout: 4000 };

/** A dev server stand-in: answers heartbeats in turn, then with no work. */
function fakeBridge(answers: Record<string, unknown>[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json({ command: null, ...answers.shift() });
    })
  );
  return bodies;
}

const editor = () => ({
  snapshot: project([], [], []),
  saveRevision: 0,
  replaceManifestFromDev: () => ({ ok: true }),
});

/** A render hook whose render the test ends by hand. */
function heldRender() {
  let finish: (saved: typeof SAVED) => void = () => {};
  let fail: (cause: Error) => void = () => {};
  // The executor runs at once, so finish and fail are set before the return.
  const done = new Promise<typeof SAVED>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const run = vi.fn((_name?: string) => done);
  const hook: PostProjectDevRender = {
    run,
    progress: () => ({ phase: "encoding", percent: 40 }),
  };
  return { hook, run, finish, fail };
}

const reports = (bodies: Record<string, unknown>[]) =>
  bodies.map((body) => body.render ?? null);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the bridge client's renders", () => {
  it("starts a handed-out render once and reports it to the end", async () => {
    // The server hands a job out again until it hears that the job started.
    const handOff = { render: { id: "r1", name: "check.mp4" } };
    const bodies = fakeBridge([{}, handOff, handOff]);
    const held = heldRender();
    const stop = startPostProjectDevBridge(editor(), {
      featureSlug: "promo",
      render: held.hook,
    });
    try {
      await vi.waitFor(
        () => expect(held.run).toHaveBeenCalledWith("check.mp4"),
        WAIT
      );
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r1",
            state: "rendering",
            phase: "encoding",
            percent: 40,
          }),
        WAIT
      );
      held.finish(SAVED);
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r1",
            state: "completed",
            message: "Saved exports/check.mp4.",
            ...SAVED,
          }),
        WAIT
      );
      const sent = bodies.length;
      await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(sent), WAIT);
      expect(bodies.at(-1)).not.toHaveProperty("render");
      expect(held.run).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  }, 15_000);

  it("reports why a render failed", async () => {
    const bodies = fakeBridge([{ render: { id: "r2" } }]);
    const held = heldRender();
    const stop = startPostProjectDevBridge(editor(), {
      featureSlug: "promo",
      render: held.hook,
    });
    try {
      await vi.waitFor(
        () => expect(held.run).toHaveBeenCalledWith(undefined),
        WAIT
      );
      held.fail(new Error("The animation is still being prepared."));
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r2",
            state: "failed",
            message: "The animation is still being prepared.",
          }),
        WAIT
      );
    } finally {
      stop();
    }
  }, 15_000);

  it("answers a job it cannot run", async () => {
    const bodies = fakeBridge([{ render: { id: "r3" } }]);
    const stop = startPostProjectDevBridge(editor(), { featureSlug: "promo" });
    try {
      await vi.waitFor(
        () =>
          expect(reports(bodies)).toContainEqual({
            id: "r3",
            state: "failed",
            message: "This editor cannot render.",
          }),
        WAIT
      );
    } finally {
      stop();
    }
  }, 15_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-dev-render.test.ts`
Expected: FAIL. No body carries a `render` report and `run` is never called, so each `vi.waitFor` times out.

- [ ] **Step 3: Replace the client**

Replace the whole of `src/lib/shared/media-composition/services/post-project-dev-client.ts` with:

```ts
import type { SavedFeatureExport } from "$lib/shared/media-composition/domain/feature-video-export";
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

const ENDPOINT = "/api/dev/post-project";

/** How an editor renders for `post-project.mjs render`. */
export interface PostProjectDevRender {
  /** Renders the post into its feature video's exports/ folder. */
  run(name?: string): Promise<SavedFeatureExport>;
  /** The running render's phase and percent, or null before it starts. */
  progress(): { phase: string; percent: number } | null;
}

export interface PostProjectDevBridgeOptions {
  /** The feature video this editor has open, so the CLI edits through it. */
  featureSlug?: string;
  /** Called after each heartbeat with that project's revision on disk. */
  onFeatureRevision?: (revision: number) => void;
  /** Lets the CLI render through this editor. */
  render?: PostProjectDevRender;
}

type RenderReport =
  | { id: string; state: "rendering"; phase: string; percent: number }
  | ({ id: string; state: "completed"; message: string } & SavedFeatureExport)
  | { id: string; state: "failed"; message: string };

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
  /** Renders already started here; the server hands one out more than once. */
  const seenRenders = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sentSnapshot = "";
  let result:
    | { commandId: string; status: "completed" | "failed"; message: string }
    | undefined;
  /** The render running now. */
  let running: string | null = null;
  /** How the last render ended, sent until a heartbeat carries it. */
  let finished: RenderReport | null = null;

  function renderReport(): RenderReport | null {
    if (!running) return finished;
    const progress = options.render?.progress() ?? null;
    return {
      id: running,
      state: "rendering",
      phase: progress?.phase ?? "preparing",
      percent: progress?.percent ?? 0,
    };
  }

  function startRender(id: string, name: string | undefined): void {
    seenRenders.add(id);
    const render = options.render;
    if (!render) {
      finished = { id, state: "failed", message: "This editor cannot render." };
      return;
    }
    running = id;
    void render
      .run(name)
      .then(
        (saved): RenderReport => ({
          id,
          state: "completed",
          message: `Saved ${saved.file}.`,
          file: saved.file,
          path: saved.path,
          bytes: saved.bytes,
        }),
        (cause: unknown): RenderReport => ({
          id,
          state: "failed",
          message:
            cause instanceof Error ? cause.message : "The render failed.",
        })
      )
      .then((report) => {
        finished = report;
        running = null;
      });
  }

  async function poll() {
    if (stopped) return;
    try {
      const snapshot = editor.snapshot;
      const encoded = JSON.stringify(snapshot);
      const includeSnapshot = encoded !== sentSnapshot;
      const report = renderReport();
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
          ...(report ? { render: report } : {}),
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
        render?: { id?: unknown; name?: unknown };
      };
      if (!data || !("command" in data))
        throw new Error("Invalid bridge response");
      sentSnapshot = encoded;
      result = undefined;
      // The server has heard how the render ended; stop sending it.
      if (report && report === finished) finished = null;
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
      const job = data.render;
      if (
        job &&
        typeof job.id === "string" &&
        !running &&
        !seenRenders.has(job.id)
      )
        startRender(
          job.id,
          typeof job.name === "string" ? job.name : undefined
        );
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-dev-render.test.ts tests/unit/media-composition/post-project-dev-bridge.test.ts tests/unit/media-composition/feature-video-bridge.test.ts`
Expected: PASS. The new file has 3 tests and takes a few seconds, since heartbeats are a second apart; the existing client tests pass unchanged.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/shared/media-composition/services/post-project-dev-client.ts tests/unit/media-composition/post-project-dev-render.test.ts
git add src/lib/shared/media-composition/services/post-project-dev-client.ts tests/unit/media-composition/post-project-dev-render.test.ts
git commit -m "feat(post): the editor runs render jobs from the dev bridge" -- src/lib/shared/media-composition/services/post-project-dev-client.ts tests/unit/media-composition/post-project-dev-render.test.ts
```

---

### Task 9: The workspace renders for the bridge and keeps the file

A feature video's render, from the editor's own Render button or from the bridge, is also sent to the project's `exports/` folder; the export panel then says where it landed, and still offers the download. The workspace gives the bridge client a render hook: it waits up to 60 seconds for the editor to be ready, runs the same `renderPost()` the button runs, and answers with the saved file or the reason it failed.

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
- Modify: `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte`

There is no unit test for this wiring: the project has no Svelte component test library. The coordinator checks it with `check:fast`, in the browser and with the render check in Task 13.

- [ ] **Step 1: The workspace**

Edit `src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`. Apply these eight edits in order.

Find:
```svelte
  import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
```
Replace with:
```svelte
  import type { FeatureVideoSync } from "$lib/shared/media-composition/services/feature-video-client";
  import type { SavedFeatureExport } from "$lib/shared/media-composition/domain/feature-video-export";
```

Find:
```svelte
                // Another editor, the CLI or a hand edit saved a newer copy.
                onFeatureRevision: (revision) =>
                  void featureVideo.checkRevision(revision),
```
Replace with:
```svelte
                // Another editor, the CLI or a hand edit saved a newer copy.
                onFeatureRevision: (revision) =>
                  void featureVideo.checkRevision(revision),
                // `post-project.mjs render` runs the export in this editor.
                render: { run: bridgeRender, progress: renderProgress },
```

Find:
```svelte
  let exportedUrl = $state<string | null>(null);
  let exportCancelled = false;
  let exportAbort: AbortController | null = null;
```
Replace with:
```svelte
  let exportedUrl = $state<string | null>(null);
  let exportCancelled = false;
  let exportAbort: AbortController | null = null;
  /** A feature video's render, once it is in the project's exports/ folder. */
  let savedExport = $state<SavedFeatureExport | null>(null);
  let saveExportError = $state("");
```

Find:
```svelte
  async function renderPost(): Promise<boolean> {
```
Replace with:
```svelte
  /** Renders the post; a feature video's render also lands in exports/. */
  async function renderPost(name?: string): Promise<boolean> {
```

Find:
```svelte
    exportCancelled = false;
    exportAbort = new AbortController();
    exportError = "";
```
Replace with:
```svelte
    exportCancelled = false;
    exportAbort = new AbortController();
    exportError = "";
    savedExport = null;
    saveExportError = "";
```

Find:
```svelte
      exportedUrl = URL.createObjectURL(blob);
      onExported?.(blob);
      return true;
```
Replace with:
```svelte
      exportedUrl = URL.createObjectURL(blob);
      onExported?.(blob);
      if (featureVideo) await keepFeatureExport(blob, name);
      return true;
```

Find:
```svelte
  function cancelExport(): void {
    exportCancelled = true;
    exportAbort?.abort();
  }

  const releaseExport = registerExport({
    render: renderPost,
    cancel: cancelExport,
  });
```
Replace with:
```svelte
  function cancelExport(): void {
    exportCancelled = true;
    exportAbort?.abort();
  }

  /** Sends a feature video's render to its folder's exports/. */
  async function keepFeatureExport(blob: Blob, name?: string): Promise<void> {
    if (!featureVideo) return;
    try {
      savedExport = await featureVideo.saveExport(blob, name);
    } catch (cause) {
      const reason =
        cause instanceof Error
          ? cause.message
          : "The dev server did not answer.";
      saveExportError = `Not saved to exports/. ${reason}`;
    }
  }

  /**
   * `post-project.mjs render` runs this through the dev bridge: it waits for
   * the editor to be ready, renders, and answers where the file landed.
   */
  async function bridgeRender(name?: string): Promise<SavedFeatureExport> {
    const deadline = Date.now() + 60_000;
    while (!canRender) {
      if (exporting) throw new Error("This editor is already rendering.");
      if (Date.now() > deadline)
        throw new Error(
          labeledCard.error ??
            overlayError ??
            "The editor was not ready to render after 60 s."
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!(await renderPost(name)))
      throw new Error(
        exportError ||
          (exportCancelled ? "The render was cancelled." : "The render failed.")
      );
    if (!savedExport)
      throw new Error(
        saveExportError || "The render finished but was not saved."
      );
    return savedExport;
  }

  /** How far the current render is, for the bridge; null between renders. */
  function renderProgress(): { phase: string; percent: number } | null {
    return exportProgress
      ? { phase: exportProgress.phase, percent: exportPercent }
      : null;
  }

  const releaseExport = registerExport({
    render: () => renderPost(),
    cancel: cancelExport,
  });
```

Find:
```svelte
      {exportError}
      onRender={() => void renderPost()}
      onCancel={cancelExport}
```
Replace with:
```svelte
      {exportError}
      savedTo={savedExport?.file ?? null}
      saveError={saveExportError}
      onRender={() => void renderPost()}
      onCancel={cancelExport}
```

- [ ] **Step 2: The export panel says where the render landed**

Edit `src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte`. Apply these three edits in order. This file is not prettier-clean; keep the new lines in its style and do not format it.

Find:
```svelte
    onTapBeats: (takeId: string) => void;
    onSharePost?: () => void;
  }
```
Replace with:
```svelte
    onTapBeats: (takeId: string) => void;
    onSharePost?: () => void;
    /** A feature video's render, once it is in the project's exports/ folder. */
    savedTo?: string | null;
    /** Why a feature video's render did not reach exports/. */
    saveError?: string;
  }
```

Find:
```svelte
    onTapBeats,
    onSharePost,
  }: Props = $props();
```
Replace with:
```svelte
    onTapBeats,
    onSharePost,
    savedTo = null,
    saveError = "",
  }: Props = $props();
```

Find:
```svelte
        {#if onSharePost}
          <PanelButton onclick={onSharePost}>
            <i class="fa-solid fa-share" aria-hidden="true"></i>
            {t("share_title")}
          </PanelButton>
        {/if}
      </div>
    </div>
  {/if}
</div>
```
Replace with:
```svelte
        {#if onSharePost}
          <PanelButton onclick={onSharePost}>
            <i class="fa-solid fa-share" aria-hidden="true"></i>
            {t("share_title")}
          </PanelButton>
        {/if}
      </div>
      {#if savedTo}
        <p class="help">Saved to {savedTo} in the project folder.</p>
      {/if}
      {#if saveError}
        <p class="error" role="alert">{saveError}</p>
      {/if}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Format the workspace and check**

Run: `npx prettier --write src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte`
Then run: `git diff --stat`
Expected: only the two files above, with additions and the two changed lines (`renderPost`'s signature and `render: () => renderPost()`). If prettier changed lines you did not add, stop and report it.

- [ ] **Step 4: Run the nearby suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte
git commit -m "feat(post): a feature video's render lands in exports and runs for the bridge" -- src/lib/shared/share/components/post-studio/editor/PostEditorWorkspace.svelte src/lib/shared/share/components/post-studio/editor/PostExportPanel.svelte
```

---

### Task 10: `render` finds or opens the editor and follows the job

`scripts/feature-video/render.mjs` holds the render command's logic so it can be tested without a browser or a server: every Chrome, bridge and clock call can be swapped for a fake. It finds the one editor that has the feature video open, queues a render there, prints progress in 10% steps on stderr, and returns the saved file. With `open`, it first starts a private headless Chrome, opens the editor at `/post?feature=<slug>`, waits for that editor to join the bridge, and closes the Chrome when the render ends, whether it succeeded or not. A render whose progress does not change for 3 minutes fails, since a render only advances while its tab gets animation frames.

**Files:**
- Create: `scripts/feature-video/render.mjs`
- Create: `tests/unit/scripts/feature-video-render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/feature-video-render.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  browserOrigin,
  openFeatureEditor,
  renderFeature,
  renderInEditor,
} from "../../../scripts/feature-video/render.mjs";

const instant = async () => {};

describe("browserOrigin", () => {
  it("opens the editor at localhost", () => {
    expect(browserOrigin("https://[::1]:5173")).toBe("https://localhost:5173");
    expect(browserOrigin("http://127.0.0.1:5193")).toBe(
      "http://localhost:5193"
    );
    expect(browserOrigin("http://localhost:5193/x")).toBe(
      "http://localhost:5193"
    );
  });
});

/** A headless Chrome that records what it was asked to do. */
function fakeChrome() {
  const calls: string[] = [];
  const tab = {
    send: vi.fn(async (method: string) => {
      calls.push(method);
    }),
    close: vi.fn(async () => {
      calls.push("tab.close");
    }),
  };
  return {
    calls,
    tab,
    launch: vi.fn(async () => ({
      port: 9333,
      close: async () => {
        calls.push("chrome.close");
      },
    })),
    open: vi.fn(async () => tab),
    go: vi.fn(async () => {}),
  };
}

describe("openFeatureEditor", () => {
  it("waits for the new editor to join the bridge", async () => {
    const chrome = fakeChrome();
    const lists = [[], [], [{ id: "editor-1", featureSlug: "promo" }]];
    const editor = await openFeatureEditor({
      origin: "http://localhost:5193",
      feature: "promo",
      listSessions: async () => lists.shift() ?? [],
      launch: chrome.launch,
      open: chrome.open,
      go: chrome.go,
      sleep: instant,
    });
    expect(editor.sessionId).toBe("editor-1");
    expect(chrome.open).toHaveBeenCalledWith("about:blank", {
      port: 9333,
      commandTimeoutMs: 60000,
    });
    expect(chrome.go).toHaveBeenCalledWith(
      chrome.tab,
      "http://localhost:5193/post?feature=promo"
    );
    expect(chrome.calls).toEqual(["Page.bringToFront"]);
    await editor.close();
    expect(chrome.calls).toEqual([
      "Page.bringToFront",
      "tab.close",
      "chrome.close",
    ]);
  });

  it("ignores an editor that was open before and gives up in time", async () => {
    const chrome = fakeChrome();
    let clock = 0;
    await expect(
      openFeatureEditor({
        origin: "http://localhost:5193",
        feature: "promo",
        listSessions: async () => [{ id: "old", featureSlug: "promo" }],
        launch: chrome.launch,
        open: chrome.open,
        go: chrome.go,
        sleep: instant,
        waitMs: 3000,
        now: () => (clock += 1000),
      })
    ).rejects.toThrow("The editor for promo did not open within 3 s.");
    expect(chrome.calls).toContain("chrome.close");
  });
});

/** A bridge that queues one render and answers its statuses in turn. */
function fakeBridge(statuses: Record<string, unknown>[]) {
  const posts: unknown[] = [];
  const request = vi.fn(
    async (
      method: string,
      query: Record<string, string> = {},
      body?: unknown
    ) => {
      if (method === "POST") {
        posts.push(body);
        return { renderId: "render-1", state: "queued" };
      }
      expect(query).toEqual({ sessionId: "editor-1", renderId: "render-1" });
      return statuses.shift();
    }
  );
  return { request, posts };
}

describe("renderInEditor", () => {
  it("follows the render and reports each 10% step once", async () => {
    const bridge = fakeBridge([
      { state: "queued", phase: null, percent: 0 },
      { state: "rendering", phase: "audio", percent: 5 },
      { state: "rendering", phase: "rendering", percent: 42 },
      { state: "rendering", phase: "rendering", percent: 47 },
      {
        state: "completed",
        phase: "rendering",
        percent: 100,
        file: "exports/check.mp4",
        path: "C:/promo/exports/check.mp4",
        bytes: 1234,
      },
    ]);
    const lines: string[] = [];
    const saved = await renderInEditor({
      request: bridge.request,
      sessionId: "editor-1",
      name: "check.mp4",
      log: (line: string) => lines.push(line),
      sleep: instant,
    });
    expect(saved).toEqual({
      file: "exports/check.mp4",
      path: "C:/promo/exports/check.mp4",
      bytes: 1234,
    });
    expect(bridge.posts).toEqual([
      { kind: "render", sessionId: "editor-1", name: "check.mp4" },
    ]);
    expect(lines).toEqual([
      "waiting for the editor",
      "audio 0%",
      "rendering 40%",
    ]);
  });

  it("fails with the editor's reason", async () => {
    const bridge = fakeBridge([
      {
        state: "failed",
        phase: null,
        percent: 0,
        message: "The editor was not ready to render after 60 s.",
      },
    ]);
    await expect(
      renderInEditor({
        request: bridge.request,
        sessionId: "editor-1",
        sleep: instant,
      })
    ).rejects.toThrow("The editor was not ready to render after 60 s.");
    expect(bridge.posts).toEqual([{ kind: "render", sessionId: "editor-1" }]);
  });

  it("gives up on a render that stops moving", async () => {
    const bridge = fakeBridge(
      Array.from({ length: 20 }, () => ({
        state: "rendering",
        phase: "rendering",
        percent: 12,
      }))
    );
    let clock = 0;
    await expect(
      renderInEditor({
        request: bridge.request,
        sessionId: "editor-1",
        sleep: instant,
        stallMs: 3000,
        now: () => (clock += 1000),
      })
    ).rejects.toThrow(
      "The render has not moved for 3 s (rendering 10%). Is the editor's tab in front?"
    );
  });
});

describe("renderFeature", () => {
  /** A bridge with these editors open, where every render completes. */
  function bridgeWith(sessions: { id: string; featureSlug?: string }[]) {
    return vi.fn(async (method: string, query: Record<string, string> = {}) => {
      if (method === "POST") return { renderId: "render-1", state: "queued" };
      if (!query.renderId) return { sessions };
      return {
        state: "completed",
        file: "exports/a.mp4",
        path: "C:/promo/exports/a.mp4",
        bytes: 1,
      };
    });
  }
  const origin = "http://localhost:5193";

  it("refuses when two editors have the video open", async () => {
    const request = bridgeWith([
      { id: "a", featureSlug: "promo" },
      { id: "b", featureSlug: "promo" },
    ]);
    await expect(
      renderFeature({ request, feature: "promo", origin })
    ).rejects.toThrow(
      "2 editors have promo open. Close all but one, then try again."
    );
  });

  it("says how to open the editor when none has the video", async () => {
    const request = bridgeWith([{ id: "a", featureSlug: "other" }]);
    await expect(
      renderFeature({ request, feature: "promo", origin })
    ).rejects.toThrow(
      "No editor has promo open. Open http://localhost:5193/post?feature=promo, or pass --open."
    );
  });

  it("renders through the editor that has the video open", async () => {
    const request = bridgeWith([{ id: "a", featureSlug: "promo" }]);
    const openEditor = vi.fn();
    await expect(
      renderFeature({
        request,
        feature: "promo",
        name: "a.mp4",
        origin,
        pollMs: 1,
        openEditor,
      })
    ).resolves.toEqual({
      file: "exports/a.mp4",
      path: "C:/promo/exports/a.mp4",
      bytes: 1,
    });
    expect(openEditor).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      "POST",
      {},
      { kind: "render", sessionId: "a", name: "a.mp4" }
    );
  });

  it("with open, opens an editor and closes it after", async () => {
    const request = bridgeWith([]);
    const close = vi.fn(async () => {});
    const openEditor = vi.fn(async () => ({ sessionId: "fresh", close }));
    const lines: string[] = [];
    await renderFeature({
      request,
      feature: "promo",
      open: true,
      origin,
      pollMs: 1,
      openEditor,
      log: (line: string) => lines.push(line),
    });
    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ origin, feature: "promo" })
    );
    expect(request).toHaveBeenCalledWith(
      "POST",
      {},
      { kind: "render", sessionId: "fresh" }
    );
    expect(close).toHaveBeenCalledOnce();
    expect(lines[0]).toBe("opening the editor in a headless Chrome");
  });

  it("closes the editor it opened when the render fails", async () => {
    const close = vi.fn(async () => {});
    const request = vi.fn(
      async (method: string, query: Record<string, string> = {}) => {
        if (method === "POST") return { renderId: "render-1", state: "queued" };
        if (!query.renderId) return { sessions: [] };
        return { state: "failed", message: "There is no room on the disk." };
      }
    );
    await expect(
      renderFeature({
        request,
        feature: "promo",
        open: true,
        origin,
        pollMs: 1,
        openEditor: async () => ({ sessionId: "fresh", close }),
      })
    ).rejects.toThrow("There is no room on the disk.");
    expect(close).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-render.test.ts`
Expected: FAIL, because `scripts/feature-video/render.mjs` does not exist.

- [ ] **Step 3: Write the module**

Create `scripts/feature-video/render.mjs`:

```js
import {
  delay,
  launchHeadlessChrome,
  navigate,
  openTab,
} from "../lib/chrome-cdp.mjs";

/**
 * `post-project.mjs render`: renders a feature video through an editor that
 * has it open, which saves the MP4 in the project's exports/ folder. With
 * `open`, it first opens that editor in a private headless Chrome, never your
 * Chrome and never the agent browser on 9222, and closes it afterwards.
 */

/** How long Chrome may leave one command unanswered, as in capture.mjs. */
const COMMAND_TIMEOUT_MS = 60000;
/** A desktop window, so the editor lays out as it does on a computer. */
const EDITOR_WINDOW = { width: 1600, height: 1000, deviceScaleFactor: 1 };

/**
 * The origin a browser should open. [::1] and 127.0.0.1 are other sites to a
 * browser, and the editor lives at localhost.
 */
export function browserOrigin(url) {
  const origin = new URL(url);
  if (origin.hostname === "[::1]" || origin.hostname === "127.0.0.1")
    origin.hostname = "localhost";
  return origin.origin;
}

/**
 * Opens the feature video's editor in a private headless Chrome and waits for
 * it to join the bridge. Resolves with that editor's session id and a `close`
 * that ends the Chrome.
 */
export async function openFeatureEditor({
  origin,
  feature,
  listSessions,
  launch = launchHeadlessChrome,
  open = openTab,
  go = navigate,
  sleep = delay,
  waitMs = 180000,
  now = Date.now,
}) {
  // An editor that closed a moment ago still counts as open for about 10 s.
  const before = new Set((await listSessions()).map((session) => session.id));
  const chrome = await launch(EDITOR_WINDOW);
  let tab;
  const close = async () => {
    await tab?.close().catch(() => {});
    await chrome.close();
  };
  try {
    tab = await open("about:blank", {
      port: chrome.port,
      commandTimeoutMs: COMMAND_TIMEOUT_MS,
    });
    await go(tab, `${origin}/post?feature=${encodeURIComponent(feature)}`);
    // A render draws on animation frames, which only a page in front gets.
    await tab.send("Page.bringToFront").catch(() => {});
    for (const deadline = now() + waitMs; ; await sleep(500)) {
      const opened = (await listSessions()).find(
        (session) => session.featureSlug === feature && !before.has(session.id)
      );
      if (opened) return { sessionId: opened.id, close };
      if (now() > deadline)
        throw new Error(
          `The editor for ${feature} did not open within ${Math.round(waitMs / 1000)} s.`
        );
    }
  } catch (cause) {
    await close();
    throw cause;
  }
}

/**
 * Queues a render in an open editor and follows it until the editor saves
 * the file. `log` gets a line for each 10% step.
 */
export async function renderInEditor({
  request,
  sessionId,
  name,
  log = () => {},
  pollMs = 1000,
  stallMs = 180000,
  now = Date.now,
  sleep = delay,
}) {
  const { renderId } = await request(
    "POST",
    {},
    { kind: "render", sessionId, ...(name ? { name } : {}) }
  );
  let line = "";
  let last = "";
  let movedAt = now();
  for (;;) {
    await sleep(pollMs);
    const job = await request("GET", { sessionId, renderId });
    if (job.state === "completed")
      return { file: job.file, path: job.path, bytes: job.bytes };
    if (job.state === "failed")
      throw new Error(job.message || "The render failed.");
    // Any change counts as moving, even one the printed line rounds away.
    const progress = `${job.state} ${job.phase} ${job.percent}`;
    if (progress !== last) {
      last = progress;
      movedAt = now();
    } else if (now() - movedAt > stallMs) {
      throw new Error(
        `The render has not moved for ${Math.round(stallMs / 1000)} s (${line}). Is the editor's tab in front?`
      );
    }
    const next =
      job.state === "queued"
        ? "waiting for the editor"
        : `${job.phase ?? "rendering"} ${Math.floor(job.percent / 10) * 10}%`;
    if (next !== line) {
      line = next;
      log(line);
    }
  }
}

/**
 * Renders a feature video through the editor that has it open or, with
 * `open`, through one this call opens and closes again. `request` is
 * post-project.mjs's bridge request.
 */
export async function renderFeature({
  request,
  feature,
  name,
  open = false,
  origin,
  log = () => {},
  pollMs,
  openEditor = openFeatureEditor,
}) {
  const listSessions = async () => (await request("GET")).sessions;
  const holding = (await listSessions()).filter(
    (session) => session.featureSlug === feature
  );
  if (holding.length > 1)
    throw new Error(
      `${holding.length} editors have ${feature} open. Close all but one, then try again.`
    );
  const follow = (sessionId) =>
    renderInEditor({ request, sessionId, name, log, pollMs });
  if (holding[0]) return follow(holding[0].id);
  if (!open)
    throw new Error(
      `No editor has ${feature} open. Open ${origin}/post?feature=${feature}, or pass --open.`
    );
  log("opening the editor in a headless Chrome");
  const editor = await openEditor({ origin, feature, listSessions });
  try {
    return await follow(editor.sessionId);
  } finally {
    await editor.close();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-render.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write scripts/feature-video/render.mjs tests/unit/scripts/feature-video-render.test.ts
git add scripts/feature-video/render.mjs tests/unit/scripts/feature-video-render.test.ts
git commit -m "feat(feature-video): render through an open or headless editor" -- scripts/feature-video/render.mjs tests/unit/scripts/feature-video-render.test.ts
```

---

### Task 11: Stills and contact sheets

`scripts/feature-video/stills.mjs` turns a render into pictures for review: a JPEG at each asked time, and a contact sheet with one frame a second, ten across. Both go to a `stills/` folder beside the render, named after it (`<render>-<t>s.jpg`, `<render>-contact.jpg`). An earlier still of the same render and time is removed first, because ffmpeg can exit without error and write no frame; a missing file then fails the command instead of passing an old picture off as new.

**Files:**
- Create: `scripts/feature-video/stills.mjs`
- Create: `tests/unit/scripts/feature-video-stills.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/feature-video-stills.test.ts`:

```ts
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import {
  contactSheetLayout,
  parseStillTimes,
  writeContactSheet,
  writeStills,
} from "../../../scripts/feature-video/stills.mjs";

const run = promisify(execFile);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe("parseStillTimes", () => {
  it("reads seconds separated by commas", () => {
    expect(parseStillTimes("0, 4,6.5")).toEqual([0, 4, 6.5]);
  });

  it.each(["soon", "", "1,,2", "-1"])("refuses %j", (text) => {
    expect(() => parseStillTimes(text)).toThrow(
      "--at takes seconds separated by commas, like 0,4,6.5."
    );
  });
});

describe("contactSheetLayout", () => {
  it("is one frame a second, ten across", () => {
    expect(contactSheetLayout(7)).toEqual({ frames: 7, columns: 7, rows: 1 });
    expect(contactSheetLayout(60.2)).toEqual({
      frames: 61,
      columns: 10,
      rows: 7,
    });
    expect(contactSheetLayout(0.4)).toEqual({ frames: 1, columns: 1, rows: 1 });
    expect(contactSheetLayout(25, 4)).toEqual({
      frames: 25,
      columns: 4,
      rows: 7,
    });
  });
});

describe.skipIf(!canEncode)("with ffmpeg", () => {
  let folder: string;
  let clip: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "stills-"));
    clip = path.join(folder, "clip.mp4");
    await run(toolPath("ffmpeg"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=180x320:r=30:d=2.5",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      clip,
    ]);
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it("writes a still at each time in stills/", async () => {
    const written = await writeStills(clip, [0, 1.5]);
    expect(written).toEqual([
      path.join(folder, "stills", "clip-0s.jpg"),
      path.join(folder, "stills", "clip-1.5s.jpg"),
    ]);
    for (const file of written)
      expect((await fs.stat(file)).size).toBeGreaterThan(0);
  });

  it("refuses a time past the end", async () => {
    await expect(writeStills(clip, [1, 2.5])).rejects.toThrow(
      "clip.mp4 is 2.50 s long; --at 2.5 is past its end."
    );
  });

  it("writes a contact sheet of one frame a second", async () => {
    const sheet = await writeContactSheet(clip);
    expect(sheet).toEqual({
      file: path.join(folder, "stills", "clip-contact.jpg"),
      frames: 3,
      columns: 3,
      rows: 1,
    });
    const { stdout } = await run(toolPath("ffprobe"), [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width",
      "-of",
      "csv=p=0",
      sheet.file,
    ]);
    // Three frames 240 wide, 4 px between them and 4 px around them.
    expect(Number(stdout.trim())).toBe(736);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-stills.test.ts`
Expected: FAIL, because `scripts/feature-video/stills.mjs` does not exist.

- [ ] **Step 3: Write the module**

Create `scripts/feature-video/stills.mjs`:

```js
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { probeMedia, toolPath } from "./media-import.mjs";

/**
 * Stills and contact sheets of a render, to look at without playing it. Both
 * go to a stills/ folder beside the render, named after it:
 * `<render>-<t>s.jpg` for a still at t seconds and `<render>-contact.jpg` for
 * a sheet of one frame a second.
 */

const execFileAsync = promisify(execFile);

/** --at's seconds, such as "0,4,6.5". */
export function parseStillTimes(text) {
  const parts = String(text ?? "")
    .split(",")
    .map((part) => part.trim());
  const times = parts.map(Number);
  if (
    parts.some((part) => part === "") ||
    times.some((seconds) => !Number.isFinite(seconds) || seconds < 0)
  )
    throw new Error("--at takes seconds separated by commas, like 0,4,6.5.");
  return times;
}

/** One frame a second, in rows of at most `columns`. */
export function contactSheetLayout(seconds, columns = 10) {
  const frames = Math.max(1, Math.ceil(seconds));
  const across = Math.min(columns, frames);
  return { frames, columns: across, rows: Math.ceil(frames / across) };
}

function stillsFolder(file) {
  return path.join(path.dirname(file), "stills");
}

function stem(file) {
  return path.basename(file, path.extname(file));
}

async function ffmpeg(args, what) {
  try {
    await execFileAsync(
      toolPath("ffmpeg"),
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { windowsHide: true }
    );
  } catch (cause) {
    throw new Error(
      `ffmpeg could not make ${what}: ${String(cause?.stderr || cause?.message || cause).trim()}`
    );
  }
}

/** Writes a still at each time and returns their paths. */
export async function writeStills(file, times) {
  const { durationSeconds } = await probeMedia(file);
  const late = times.find((seconds) => seconds >= durationSeconds);
  if (late !== undefined)
    throw new Error(
      `${path.basename(file)} is ${durationSeconds.toFixed(2)} s long; --at ${late} is past its end.`
    );
  const folder = stillsFolder(file);
  await fs.mkdir(folder, { recursive: true });
  const written = [];
  for (const seconds of times) {
    const output = path.join(folder, `${stem(file)}-${seconds}s.jpg`);
    // ffmpeg can finish without writing a frame, so an old still must not
    // pass for a new one.
    await fs.rm(output, { force: true });
    await ffmpeg(
      [
        "-ss",
        String(seconds),
        "-i",
        file,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        output,
      ],
      `a still at ${seconds} s`
    );
    const made = await fs.stat(output).then(
      () => true,
      () => false
    );
    if (!made)
      throw new Error(
        `ffmpeg found no frame at ${seconds} s in ${path.basename(file)}.`
      );
    written.push(output);
  }
  return written;
}

/** Writes the render's contact sheet: one frame a second, 240 px wide each. */
export async function writeContactSheet(file, columns = 10) {
  const { durationSeconds } = await probeMedia(file);
  const layout = contactSheetLayout(durationSeconds, columns);
  const folder = stillsFolder(file);
  await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, `${stem(file)}-contact.jpg`);
  await fs.rm(output, { force: true });
  await ffmpeg(
    [
      "-i",
      file,
      "-vf",
      `fps=1,scale=240:-2,tile=${layout.columns}x${layout.rows}:padding=4:margin=4:color=0x202020`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output,
    ],
    "a contact sheet"
  );
  return { file: output, ...layout };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-stills.test.ts`
Expected: PASS, 9 tests. If ffmpeg is missing, the 3 "with ffmpeg" tests skip; report that.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write scripts/feature-video/stills.mjs tests/unit/scripts/feature-video-stills.test.ts
git add scripts/feature-video/stills.mjs tests/unit/scripts/feature-video-stills.test.ts
git commit -m "feat(feature-video): stills and contact sheets of a render" -- scripts/feature-video/stills.mjs tests/unit/scripts/feature-video-stills.test.ts
```

---

### Task 12: The CLI's `sound`, `add-card`, `render`, `stills` and `contact-sheet`

`scripts/post-project.mjs` gains five commands. `sound` and `add-card` are named edits, so they go to the editor that has the feature video open, or to `project.json` when none does, like every other edit. `render` hands over to `render.mjs` with the CLI's own bridge request, adds `.mp4` to a `--name` without it, and prints progress on stderr. `TKA_RENDER_POLL_MS` shortens its polling for tests. `stills` and `contact-sheet` take a render's path and check their flags before ffmpeg runs. `show` also prints a card's link and whether the takes' sound plays.

**Files:**
- Modify: `scripts/post-project.mjs`
- Create: `tests/unit/media-composition/post-project-cli-render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-composition/post-project-cli-render.test.ts`:

```ts
import { execFile } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/post-project.mjs"
);

let server: http.Server;
let url: string;
/** Whether an editor has the feature video open. */
let editorOpen: boolean;
/** The render statuses the bridge answers, in turn. */
let statuses: Record<string, unknown>[];
let posts: { path: string; body: Record<string, unknown> }[];
/** The project on disk. */
let disk: Record<string, unknown>;

beforeEach(async () => {
  editorOpen = true;
  statuses = [];
  posts = [];
  disk = { audio: "takes", tracks: [] };
  server = http.createServer((request, response) => {
    let text = "";
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => {
      const target = new URL(request.url ?? "/", "http://localhost");
      const query = target.searchParams;
      const send = (status: number, value: unknown) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(value));
      };
      switch (`${request.method} ${target.pathname}`) {
        case "GET /api/dev/post-project":
          if (query.get("renderId"))
            return send(
              200,
              statuses.shift() ?? { state: "failed", message: "No status." }
            );
          if (query.get("commandId"))
            return send(200, {
              commandId: query.get("commandId"),
              status: "completed",
              message: "Applied in editor.",
            });
          return send(200, {
            sessions: editorOpen
              ? [{ id: "editor-1", featureSlug: "promo" }]
              : [],
          });
        case "POST /api/dev/post-project": {
          const body = JSON.parse(text);
          posts.push({ path: target.pathname, body });
          if (body.kind === "render")
            return send(200, { renderId: "render-1", state: "queued" });
          return send(200, { commandId: "command-1", status: "pending" });
        }
        case "GET /api/dev/feature-videos/promo":
          return send(200, {
            file: { project: disk },
            fingerprint: "f",
            folder: "C:/promo",
          });
        case "POST /api/dev/feature-videos/promo/ops":
          posts.push({ path: target.pathname, body: JSON.parse(text) });
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
});

async function cli(...args: string[]) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [CLI, ...args, "--url", url],
      { env: { ...process.env, TKA_RENDER_POLL_MS: "10" } }
    );
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

describe("render", () => {
  it("renders through the open editor and prints the saved file", async () => {
    statuses = [
      { state: "queued", phase: null, percent: 0 },
      { state: "rendering", phase: "rendering", percent: 50 },
      {
        state: "completed",
        phase: "rendering",
        percent: 100,
        file: "exports/check.mp4",
        path: "C:/promo/exports/check.mp4",
        bytes: 2048,
      },
    ];
    const result = await cli("render", "--feature", "promo", "--name", "check");
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      file: "exports/check.mp4",
      path: "C:/promo/exports/check.mp4",
      bytes: 2048,
    });
    expect(result.stderr).toContain("rendering 50%");
    expect(posts).toEqual([
      {
        path: "/api/dev/post-project",
        body: { kind: "render", sessionId: "editor-1", name: "check.mp4" },
      },
    ]);
  });

  it("fails with the editor's reason", async () => {
    statuses = [
      {
        state: "failed",
        phase: null,
        percent: 0,
        message: "The render was cancelled.",
      },
    ];
    const result = await cli("render", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The render was cancelled.");
    expect(posts[0]!.body).toEqual({ kind: "render", sessionId: "editor-1" });
  });

  it("says how to open the editor when none has it", async () => {
    editorOpen = false;
    const result = await cli("render", "--feature", "promo");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `Open http://localhost:${new URL(url).port}/post?feature=promo, or pass --open.`
    );
    expect(posts).toEqual([]);
  });
});

describe("sound and add-card", () => {
  it("send their ops", async () => {
    editorOpen = false;
    expect((await cli("sound", "silent", "--feature", "promo")).code).toBe(0);
    const added = await cli(
      "add-card",
      "--feature",
      "promo",
      "--label",
      "End",
      "--qr-url",
      "https://example.com/end",
      "--fade-in",
      "0.5"
    );
    expect(added.code).toBe(0);
    expect(posts).toEqual([
      {
        path: "/api/dev/feature-videos/promo/ops",
        body: { ops: [{ op: "sound", sound: "silent" }] },
      },
      {
        path: "/api/dev/feature-videos/promo/ops",
        body: {
          ops: [
            {
              op: "add-card",
              label: "End",
              qrUrl: "https://example.com/end",
              fadeIn: 0.5,
            },
          ],
        },
      },
    ]);
  });
});

describe("show", () => {
  it("prints a card's link and the sound", async () => {
    editorOpen = false;
    disk = {
      audio: "silent",
      tracks: [
        {
          items: [
            {
              id: "card-1",
              kind: "card",
              start: 0,
              duration: 5,
              label: "End",
              qrUrl: "https://example.com/end",
            },
          ],
        },
      ],
    };
    const result = await cli("show", "--feature", "promo");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      'track 0  card-1  card  0.00s +5.00s  "End"  QR https://example.com/end\nsound silent\n'
    );
  });
});

describe("stills and contact-sheet", () => {
  it("refuse bad times and column counts before ffmpeg runs", async () => {
    const stills = await cli("stills", "x.mp4", "--at", "soon");
    expect(stills.code).toBe(1);
    expect(stills.stderr).toContain(
      "--at takes seconds separated by commas, like 0,4,6.5."
    );
    const sheet = await cli("contact-sheet", "x.mp4", "--columns", "0");
    expect(sheet.code).toBe(1);
    expect(sheet.stderr).toContain(
      "--columns must be a whole number from 1 to 30."
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli-render.test.ts`
Expected: FAIL, all 6 tests: the CLI does not know these commands yet and answers with its usage text.

- [ ] **Step 3: Add the commands**

Edit `scripts/post-project.mjs`. Apply these seven edits in order.

Find:
```js
import { importMusic } from "./feature-video/music-import.mjs";
import { parseTimeArg } from "./feature-video/time-args.mjs";
```
Replace with:
```js
import { importMusic } from "./feature-video/music-import.mjs";
import { browserOrigin, renderFeature } from "./feature-video/render.mjs";
import {
  parseStillTimes,
  writeContactSheet,
  writeStills,
} from "./feature-video/stills.mjs";
import { parseTimeArg } from "./feature-video/time-args.mjs";
```

Find:
```js
  "remove-music": () => ({ op: "remove-music" }),
```
Replace with:
```js
  "remove-music": () => ({ op: "remove-music" }),
  sound: () => ({ op: "sound", sound: positional(0, "takes or silent") }),
  "add-card": () => ({
    op: "add-card",
    ...text("label"),
    ...(option("qr-url") !== undefined ? { qrUrl: option("qr-url") } : {}),
    ...number("fade-in", "fadeIn"),
  }),
```

Find:
```js
  "--append",
  "--share-media",
];
```
Replace with:
```js
  "--append",
  "--share-media",
  "--open",
];
```

Find:
```js
        `track ${trackIndex}  ${item.id}  ${item.kind}${item.tunnelHook ? " (opening tunnel)" : ""}  ${item.start.toFixed(2)}s +${item.duration.toFixed(2)}s${item.label ? `  "${item.label}"` : ""}`
      );
  });
  return rows.join("\n");
```
Replace with:
```js
        `track ${trackIndex}  ${item.id}  ${item.kind}${item.tunnelHook ? " (opening tunnel)" : ""}  ${item.start.toFixed(2)}s +${item.duration.toFixed(2)}s${item.label ? `  "${item.label}"` : ""}${item.qrUrl ? `  QR ${item.qrUrl}` : ""}`
      );
  });
  // Whether the takes' own sound plays; set it with: sound takes|silent.
  rows.push(`sound ${snapshot.audio ?? "takes"}`);
  return rows.join("\n");
```

Find:
```js
  } else if (command === "duplicate") {
```
Replace with:
```js
  } else if (command === "render") {
    const feature = required("feature");
    const name = option("name");
    result = await renderFeature({
      request,
      feature,
      ...(name ? { name: /\.mp4$/i.test(name) ? name : `${name}.mp4` } : {}),
      open: flag("open"),
      origin: browserOrigin(base),
      log: (line) => process.stderr.write(`${line}\n`),
      pollMs: Number(process.env.TKA_RENDER_POLL_MS) || 1000,
    });
  } else if (command === "stills") {
    result = {
      stills: await writeStills(
        path.resolve(positional(0, "a rendered video")),
        parseStillTimes(required("at"))
      ),
    };
  } else if (command === "contact-sheet") {
    const columns = Number(option("columns") ?? 10);
    if (!Number.isInteger(columns) || columns < 1 || columns > 30)
      throw new Error("--columns must be a whole number from 1 to 30.");
    result = await writeContactSheet(
      path.resolve(positional(0, "a rendered video")),
      columns
    );
  } else if (command === "duplicate") {
```

Find:
```js
  canvas <ratio>   background <dark|blur>
```
Replace with:
```js
  canvas <ratio>   background <dark|blur>
  sound <takes|silent>         whether the takes' own sound plays; the music plays either way
  add-card [--label "End"] [--qr-url https://...] [--fade-in S]   a card at the end; --qr-url is the link its QR code opens
```

Find:
```js
  loudness <render.mp4> [--feature SLUG]   loudness and true peak; with --feature, the music level that reaches -14 LUFS
```
Replace with:
```js
  loudness <render.mp4> [--feature SLUG]   loudness and true peak; with --feature, the music level that reaches -14 LUFS
  render --feature SLUG [--name NAME] [--open]   renders in the editor that has it open, into exports/; --open opens one in a private headless Chrome
  stills <render.mp4> --at 0,4,6.5   a still at each time, in stills/ beside the render
  contact-sheet <render.mp4> [--columns 10]   one frame a second on one sheet, in stills/ beside the render
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli-render.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the other CLI suites**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-project-cli`
Expected: PASS, every file.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write scripts/post-project.mjs tests/unit/media-composition/post-project-cli-render.test.ts
git add scripts/post-project.mjs tests/unit/media-composition/post-project-cli-render.test.ts
git commit -m "feat(feature-video): render, stills, contact-sheet, sound and add-card commands" -- scripts/post-project.mjs tests/unit/media-composition/post-project-cli-render.test.ts
```

---

### Task 13: The render check

`scripts/feature-video/render-check.mjs` proves the whole path on a real dev server and a real headless Chrome. It refuses port 5173, since it writes a project folder; the coordinator runs it on a task server with a scratch `TKA_FEATURE_VIDEO_ROOT`. It makes a scratch feature video through the CLI: a 2 s black clip that flashes white for frames 15 to 17, music that clicks at 0.5 s, the takes' sound off, and a card with a link at the end. It renders that with `render --open`, writes stills at 0.4 s, 0.5 s and 4.5 s (the card) and a contact sheet, then measures the first bright frame and the first loud sample in the MP4. Both must be within one frame (1/30 s) of 0.5 s after the clip's start and of each other. The unit tests cover the arguments, the test media and the two measurements; the check itself needs a server, so only the coordinator runs it.

**Files:**
- Create: `scripts/feature-video/render-check.mjs`
- Create: `tests/unit/scripts/feature-video-render-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scripts/feature-video-render-check.test.ts`:

```ts
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolPath } from "../../../scripts/feature-video/media-import.mjs";
import {
  clickTrack,
  firstBrightSeconds,
  firstLoudSeconds,
  flashClipArgs,
  parseCheckArgs,
} from "../../../scripts/feature-video/render-check.mjs";

const run = promisify(execFile);
const canEncode = (() => {
  try {
    return execFileSync(toolPath("ffmpeg"), ["-hide_banner", "-encoders"], {
      encoding: "utf8",
    }).includes(" libx264 ");
  } catch {
    return false;
  }
})();

describe("parseCheckArgs", () => {
  it("takes a task server's address", () => {
    expect(parseCheckArgs(["--url", "http://localhost:5193/"])).toEqual({
      url: "http://localhost:5193",
    });
  });

  it("needs an address", () => {
    expect(() => parseCheckArgs([])).toThrow(
      "render-check needs --url, a task server such as http://localhost:5193."
    );
  });

  it("runs only on this computer", () => {
    expect(() => parseCheckArgs(["--url", "https://example.com"])).toThrow(
      "--url must be a loopback HTTP(S) address."
    );
  });

  it("never runs against 5173", () => {
    expect(() => parseCheckArgs(["--url", "https://localhost:5173"])).toThrow(
      "never 5173"
    );
  });
});

describe("clickTrack", () => {
  it("is a 48 kHz mono 16-bit WAV with a burst at each click", () => {
    const wav = clickTrack(1, [0.5]);
    expect(wav.length).toBe(44 + 48000 * 2);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(34)).toBe(16);
    const sample = (index: number) => wav.readInt16LE(44 + index * 2);
    expect(sample(23999)).toBe(0);
    expect(Math.abs(sample(24006))).toBeGreaterThan(20000);
  });
});

describe.skipIf(!canEncode)("measuring", () => {
  let folder: string;

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "render-check-"));
  });

  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it("finds the flash at 0.5 s", async () => {
    const clip = path.join(folder, "flash.mp4");
    await run(toolPath("ffmpeg"), flashClipArgs(clip));
    const seconds = await firstBrightSeconds(clip);
    expect(seconds).not.toBeNull();
    expect(Math.abs(seconds! - 0.5)).toBeLessThanOrEqual(1 / 60);
  });

  it("finds the first click at 0.5 s", async () => {
    const wav = path.join(folder, "clicks.wav");
    await fs.writeFile(wav, clickTrack());
    const seconds = await firstLoudSeconds(wav);
    expect(seconds).not.toBeNull();
    expect(Math.abs(seconds! - 0.5)).toBeLessThan(0.001);
  });

  it("finds nothing loud in a quiet file", async () => {
    const wav = path.join(folder, "quiet.wav");
    await fs.writeFile(wav, clickTrack(1, []));
    expect(await firstLoudSeconds(wav)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-render-check.test.ts`
Expected: FAIL, because `scripts/feature-video/render-check.mjs` does not exist.

- [ ] **Step 3: Write the check**

Create `scripts/feature-video/render-check.mjs`:

```js
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { toolPath } from "./media-import.mjs";

/**
 * The render's end-to-end check. On a task server, never 5173, it makes a
 * scratch feature video from a 2 s black clip that flashes white at 0.5 s,
 * under music that clicks at 0.5 s, renders it with `render --open`, and
 * measures where the flash and the click land in the MP4. Each must be within
 * a frame of 0.5 s and of the other. It also writes stills and a contact sheet
 * to look at, and leaves the project in the server's TKA_FEATURE_VIDEO_ROOT.
 *
 *   node scripts/feature-video/render-check.mjs --url http://localhost:5193
 */

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../post-project.mjs", import.meta.url));
const FRAME_SECONDS = 1 / 30;
const SAMPLE_RATE = 48000;
/** White from frame 15 to frame 17: 0.5 s to 0.6 s at 30 fps. */
const FLASH_FILTER =
  "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(n,15,17)'";

export function parseCheckArgs(argv) {
  const index = argv.indexOf("--url");
  const value = index < 0 ? undefined : argv[index + 1];
  if (!value)
    throw new Error(
      "render-check needs --url, a task server such as http://localhost:5193."
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("--url must be a loopback HTTP(S) address.");
  if (url.port === "5173")
    throw new Error(
      "render-check makes and renders a scratch project, so run it against a task server with a scratch TKA_FEATURE_VIDEO_ROOT, never 5173."
    );
  return { url: url.origin };
}

/** ffmpeg arguments for the 2 s, 540 by 960 black clip with its flash. */
export function flashClipArgs(output) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=540x960:r=30:d=2",
    "-vf",
    FLASH_FILTER,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    output,
  ];
}

/**
 * A 48 kHz mono 16-bit WAV, silent but for a 5 ms burst of 1 kHz at each
 * click.
 */
export function clickTrack(seconds = 2, clicks = [0.5, 1, 1.5]) {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // one channel
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples * 2, 40);
  // 240 samples of 1 kHz at 0.9 of full scale.
  const burst = Array.from({ length: 240 }, (_, i) =>
    Math.round(0.9 * 32767 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE))
  );
  for (const click of clicks) {
    const start = Math.round(click * SAMPLE_RATE);
    burst.forEach((level, i) => {
      if (start + i < samples) wav.writeInt16LE(level, 44 + (start + i) * 2);
    });
  }
  return wav;
}

/** Seconds into the file of its first bright frame, to 1/60 s, or null. */
export async function firstBrightSeconds(file) {
  const { stdout } = await execFileAsync(
    toolPath("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      "fps=60,scale=16:16,format=gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 1 << 28, windowsHide: true }
  );
  const size = 16 * 16;
  for (let frame = 0; (frame + 1) * size <= stdout.length; frame += 1) {
    let sum = 0;
    for (let i = frame * size; i < (frame + 1) * size; i += 1) sum += stdout[i];
    if (sum / size > 128) return frame / 60;
  }
  return null;
}

/** Seconds into the file of its first sample louder than 0.3, or null. */
export async function firstLoudSeconds(file) {
  const { stdout } = await execFileAsync(
    toolPath("ffmpeg"),
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "f32le",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 1 << 28, windowsHide: true }
  );
  // readFloatLE, since a Float32Array view needs an aligned offset.
  for (let i = 0; i + 4 <= stdout.length; i += 4)
    if (Math.abs(stdout.readFloatLE(i)) > 0.3) return i / 4 / SAMPLE_RATE;
  return null;
}

/** Runs post-project.mjs on the task server; its messages show as it goes. */
function postProject(url, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args, "--url", url], {
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim() ? JSON.parse(stdout) : undefined);
      else
        reject(
          new Error(
            `post-project.mjs ${args[0]} failed${stdout.trim() ? `: ${stdout.trim()}` : "; its reason is above"}.`
          )
        );
    });
  });
}

export async function runRenderCheck({
  url,
  log = (line) => console.error(line),
}) {
  const feature = `render-check-${Date.now().toString(36)}`;
  const cli = (...args) => postProject(url, args);
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "render-check-"));
  try {
    const clip = path.join(work, "flash.mp4");
    const music = path.join(work, "clicks.wav");
    await execFileAsync(toolPath("ffmpeg"), flashClipArgs(clip), {
      windowsHide: true,
    });
    await fs.writeFile(music, clickTrack());

    log(`Making ${feature}.`);
    await cli(
      "create",
      feature,
      "--sequence",
      "DCKΨ-",
      "--canvas",
      "9:16",
      "--title",
      "Render check"
    );
    await cli("add-take", clip, "--feature", feature, "--append");
    await cli("add-music", music, "--feature", feature);
    const project = await cli("show", "--feature", feature, "--json");
    const flashClip = project.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === "video");
    if (!flashClip) throw new Error(`${feature} has no clip after add-take.`);
    // The music starts with the clip, so the click lands on the flash.
    await cli(
      "music",
      "--feature",
      feature,
      "--start",
      String(flashClip.start)
    );
    await cli("sound", "silent", "--feature", feature);
    await cli(
      "add-card",
      "--feature",
      feature,
      "--label",
      "Render check",
      "--qr-url",
      "https://example.com/render-check"
    );

    log("Rendering in a headless editor.");
    const render = await cli(
      "render",
      "--feature",
      feature,
      "--open",
      "--name",
      "check"
    );
    const { stills } = await cli("stills", render.path, "--at", "0.4,0.5,4.5");
    const sheet = await cli("contact-sheet", render.path);

    const expectedSeconds = flashClip.start + 0.5;
    const flashSeconds = await firstBrightSeconds(render.path);
    const clickSeconds = await firstLoudSeconds(render.path);
    const near = (a, b) =>
      a !== null && b !== null && Math.abs(a - b) <= FRAME_SECONDS;
    return {
      ok:
        near(flashSeconds, expectedSeconds) &&
        near(clickSeconds, expectedSeconds) &&
        near(flashSeconds, clickSeconds),
      feature,
      render,
      expectedSeconds,
      flashSeconds,
      clickSeconds,
      stills,
      contactSheet: sheet.file,
    };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await runRenderCheck(parseCheckArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/scripts/feature-video-render-check.test.ts`
Expected: PASS, 8 tests. If ffmpeg is missing, the 3 "measuring" tests skip; report that.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write scripts/feature-video/render-check.mjs tests/unit/scripts/feature-video-render-check.test.ts
git add scripts/feature-video/render-check.mjs tests/unit/scripts/feature-video-render-check.test.ts
git commit -m "test(feature-video): end-to-end render check" -- scripts/feature-video/render-check.mjs tests/unit/scripts/feature-video-render-check.test.ts
```

---

### Task 14: Documentation

The bridge guide gains an "End card and render" section and the exports route; the capabilities map gains the owners, so the next agent extends them instead of adding a second renderer. Never run prettier on these files.

**Files:**
- Modify: `docs/development/post-studio-manifest-bridge.md`
- Modify: `docs/architecture/canonical-capabilities.md`

- [ ] **Step 1: Add the section and the route to the bridge guide**

Edit `docs/development/post-studio-manifest-bridge.md`. Apply these three edits in order.

Find:
```markdown
### When disk and the editor disagree
```
Replace with:
````markdown
### End card and render

A feature video's card can show a QR code for a link you choose, such as the sequence's short link, and the code opens that link for anyone who scans it, signed in or not. In the editor, select the card and type the link under Scan link. Only a feature video's cards have the field. A link is an `https://` address with no spaces, at most 200 characters; a good one switches the card's info cell to the QR, and clearing the field brings back your account's own code. `add-card` puts a card at the end of the main track, with the link when `--qr-url` gives one.

```powershell
node scripts/post-project.mjs add-card --feature promo-1-0 --label "Get the app" --qr-url https://example.com/end --fade-in 0.5
node scripts/post-project.mjs sound silent --feature promo-1-0
node scripts/post-project.mjs render --feature promo-1-0 --name promo-1-0-v1
node scripts/post-project.mjs render --feature promo-1-0 --open
node scripts/post-project.mjs stills E:\tka-platform-media\feature-videos\promo-1-0\exports\promo-1-0-v1.mp4 --at 0,4,6.5
node scripts/post-project.mjs contact-sheet E:\tka-platform-media\feature-videos\promo-1-0\exports\promo-1-0-v1.mp4
```

`sound` is Export's Sound choice: `takes` plays the takes' own sound and `silent` drops it. The music plays either way.

`render` renders the post the way Export does, in the editor that has the feature video open, and saves the MP4 in the project's `exports/` folder. Without `--name` the file is `<slug>-YYYYMMDD-HHMMSS.mp4`, and `.mp4` is added to a name without it. A name that is taken gets `-2`, `-3` and so on, so no render replaces another. The command prints the file, its whole path and its size, and reports progress on stderr. While a render runs, the editor refuses edits, and a render waits until a pending edit has landed. Keep the editor's tab in front: a render draws on animation frames, which a tab behind others does not get, and the command gives up on a render that has not moved for 3 minutes. With no editor open, the command says how to open one. `--open` opens one itself in a private headless Chrome, signed out, never your Chrome and never the agent browser on 9222, and closes it when the render ends; a render on the usual server opens `https://localhost:5173`. A render from the editor's own Render button lands in `exports/` too, and the panel still offers the download.

The bridge takes a render as `POST /api/dev/post-project {kind: "render", sessionId, name?}` and answers `{renderId, state: "queued"}`; `GET /api/dev/post-project?sessionId=…&renderId=…` reads the job: `state` (queued, rendering, completed or failed), `phase`, `percent`, `message`, and once it completes, `file`, `path` and `bytes`. The editor gets the job in its next heartbeat answer and reports progress in the heartbeats after. A job the editor has not started after 30 s fails, and so does one whose editor has sent nothing for a minute.

`stills` writes a JPEG at each `--at` time, and `contact-sheet` one sheet of a frame a second, ten across unless `--columns` (1 to 30) says otherwise. Both go to `exports/stills/`, named after the render: `<render>-<t>s.jpg` and `<render>-contact.jpg`. They replace earlier stills of the same render and time. A time past the render's end is refused.

`node scripts/feature-video/render-check.mjs --url http://localhost:5193` checks the whole path. It makes a scratch feature video from a 2 s clip that flashes white at 0.5 s and music that clicks at 0.5 s, renders it with `render --open`, and measures where the flash and the click land: each within a frame (1/30 s) of 0.5 s and of the other. It prints the result as JSON, with the stills and the contact sheet, and exits with code 1 when the check fails. It refuses port 5173, since it writes a project folder: run it on a task server started with a scratch `TKA_FEATURE_VIDEO_ROOT`, where the project stays for a look.

### When disk and the editor disagree
````

Find:
```markdown
`GET /<slug>/media/<path>` serves a media file with byte ranges. Like the bridge,
```
Replace with:
```markdown
`GET /<slug>/media/<path>` serves a media file with byte ranges; `POST /<slug>/exports?name=<file>.mp4` saves the MP4 in its body to `exports/` under the first free name and answers 201 with the file it wrote. Like the bridge,
```

Find:
```markdown
opens feature videos on the Post page; `scripts/feature-video/media-import.mjs` probes and converts takes.
```
Replace with:
```markdown
opens feature videos on the Post page; `scripts/feature-video/media-import.mjs` probes and converts takes. `feature-video-export.ts` names renders and `feature-video-exports.ts` saves them; `scripts/feature-video/render.mjs`, `stills.mjs` and `render-check.mjs` serve `render`, `stills`, `contact-sheet` and the render check.
```

- [ ] **Step 2: Add the owners to the capabilities map**

Edit `docs/architecture/canonical-capabilities.md`.

Find:
```markdown
`align-take.mjs`. Do not add a second recorder; extend these.
```
Replace with:
```markdown
`align-take.mjs`. Do not add a second recorder; extend these.

A feature video's end card keeps its scan link as `qrUrl` on the card item
(`domain/post-project.ts`); the canvas hands it to the Choreo Card's own
`qrUrl`, so the code opens that link for anyone, signed in or not. Renders use
the editor's own exporter: `post-project.mjs render` queues a job on the dev
bridge (`server/post-project-dev-bridge.ts`), the editor's
`services/post-project-dev-client.ts` runs it, and
`services/feature-video-client.ts` sends the MP4 to
`server/feature-video-exports.ts`, which saves it in `exports/` under a name
from `domain/feature-video-export.ts`. `scripts/feature-video/render.mjs`
finds or opens the editor, `stills.mjs` writes stills and contact sheets, and
`render-check.mjs` checks a render end to end. Do not add a second renderer or
a server-side encode; extend these. Searches: render, export, exports folder,
end card, QR, scan link, stills, contact sheet.
```

- [ ] **Step 3: Check the references**

Run: `node -e "const fs=require('fs');for(const f of ['scripts/feature-video/render.mjs','scripts/feature-video/stills.mjs','scripts/feature-video/render-check.mjs','src/lib/server/feature-video-exports.ts','src/lib/shared/media-composition/domain/feature-video-export.ts','src/routes/api/dev/feature-videos/[slug]/exports/+server.ts'])if(!fs.existsSync(f))throw new Error(f+' is missing');console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
git commit -m "docs(feature-video): end card links, renders, stills and the render check" -- docs/development/post-studio-manifest-bridge.md docs/architecture/canonical-capabilities.md
```

---

## Self-review

**Spec coverage (piece 4).**

| Spec, piece 4 | Task |
| --- | --- |
| `qrUrl` on the card item, https only, at most 200 characters | 1 |
| Post passes it to the Choreo Card's QR state, so a guest sees the code | 3, and coordinator step 4 |
| The DCKΨ- short code, looked up read-only or made by Austen while signed in | Not a code task: a production step after this plan, with Austen's OK |
| `render [--name]` queues a bridge command; a hook around `renderPost()` streams the MP4 to the `exports` route; the result comes back through the heartbeat and the CLI prints the path | 5 to 10, 12 |
| `render --open` opens the editor, brings its tab to the front, waits for its heartbeat, renders and closes the tab | 10, in a private headless Chrome (see the departures) |
| The editor's own Export button also saves into `exports/` and still offers the download | 9 |
| `stills` and `contact-sheet` | 11, 12 |
| The exports route streams to disk with a 2 GB cap and takes only a clean `.mp4` name | 5 |
| A failed render prints the reason, exits non-zero and writes nothing to `exports/` | 5 (a failed upload removes its part file), 10 and 12 (exit code 1 with the editor's message) |
| The card `qrUrl` test: https only, length cap | 1 |
| The integration check: a two-second clip and a click track render, and the first click lands within a frame of its planned time | 13, and coordinator step 3 |
| Part B's goal that the agent can change what the interface can | 2 and 12 (`add-card`, `sound`), 14 (the guide) |
| `canonical-capabilities.md` entries | 14 |

**Placeholder scan.** No task says "TBD", "add error handling" or "similar to Task N"; every code step shows its code, and every edit names its Find text. The links in examples are `https://example.com/...`, never a real short code.

**Type consistency.** `qrUrl` is the card item's field in Tasks 1 to 4, the `add-card` op's in Task 2, and the CLI's `--qr-url` in Task 12. The render job's `state`, `phase`, `percent`, `message`, `file`, `path` and `bytes` are the same in the bridge (Task 7), the dev client's reports (Task 8) and `renderInEditor` (Task 10). `SavedFeatureExport` (`file`, `path`, `bytes`) is what the route answers (Task 5), what `saveFeatureVideoExport` returns (Task 6) and what `bridgeRender` reports (Task 9). The bridge request body is `{kind: "render", sessionId, name?}` in Tasks 7, 10 and 12, and every export name passes `isFeatureExportName`, which Tasks 5 and 7 both use.
