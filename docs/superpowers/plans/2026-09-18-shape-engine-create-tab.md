# Shape Engine Create Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Shape Engine out of the Toys module into a Create tab labeled "Shape", mounted the way Fuse and Tunnel are.

**Architecture:** A new `features/create/shape-engine/` folder hosts the tab component and a pure localStorage persistence adapter. Navigation gains the `shape-engine` create-tab id in every hand-kept list, the Create front door orders it after Generate, and the Toys module drops its `shape-matrix` tab with a URL redirect for old links. The shared `ShapeMatrixApp` is untouched.

**Tech Stack:** SvelteKit, Svelte 5 runes, Vitest (jsdom for navigation tests), pnpm workspace with `node_modules` junctioned to `E:/tka-platform`.

**Spec:** `docs/superpowers/specs/2026-09-18-shape-engine-create-tab-design.md`

**Worktree:** `E:/worktrees/tka-platform/shape-engine-create-tab`, branch `codex/shape-engine-create-tab`. Run every command from that directory. Commit with explicit pathspecs only (`git commit -m "..." -- path/a path/b`); never `git add -A`, `git add .`, or a bare `git commit`.

---

### Task 1: Persistence adapter with old-key fallback

**Files:**

- Create: `src/lib/features/create/shape-engine/shape-engine-persistence.ts`
- Test: `tests/unit/create/shape-engine-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/create/shape-engine-persistence.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  SHAPE_ENGINE_STORAGE_KEY,
  SHAPE_ENGINE_LEGACY_STORAGE_KEY,
  createShapeEnginePersistence,
} from "$lib/features/create/shape-engine/shape-engine-persistence";

const snapshot = (level: number) =>
  ({ level }) as unknown as Parameters<
    ReturnType<typeof createShapeEnginePersistence>["persist"]
  >[0];

describe("createShapeEnginePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("restores the current key", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 2 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 2 });
  });

  it("falls back to the Toys-era key when the current key is empty", () => {
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 3 });
  });

  it("prefers the current key over the legacy key", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 2 })
    );
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toEqual({ level: 2 });
  });

  it("rejects a snapshot with an unknown level", () => {
    localStorage.setItem(
      SHAPE_ENGINE_STORAGE_KEY,
      JSON.stringify({ level: 9 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("returns null on invalid JSON", () => {
    localStorage.setItem(SHAPE_ENGINE_STORAGE_KEY, "{not json");
    const persistence = createShapeEnginePersistence(localStorage);
    expect(persistence.restore()).toBeNull();
  });

  it("writes the current key and drops the legacy key on persist", () => {
    localStorage.setItem(
      SHAPE_ENGINE_LEGACY_STORAGE_KEY,
      JSON.stringify({ level: 3 })
    );
    const persistence = createShapeEnginePersistence(localStorage);
    persistence.persist(snapshot(4));
    expect(
      JSON.parse(localStorage.getItem(SHAPE_ENGINE_STORAGE_KEY) ?? "")
    ).toEqual({ level: 4 });
    expect(localStorage.getItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("swallows storage failures on persist", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    } as unknown as Storage;
    const persistence = createShapeEnginePersistence(throwing);
    expect(() => persistence.persist(snapshot(1))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/shape-engine-persistence.test.ts`
Expected: FAIL, cannot resolve `$lib/features/create/shape-engine/shape-engine-persistence`.

- [ ] **Step 3: Write the adapter**

```ts
// src/lib/features/create/shape-engine/shape-engine-persistence.ts
/**
 * localStorage adapter for the Shape tab. Module tabs do not own the URL, so
 * the tab remembers its matrix settings here; the standalone /shape-engine
 * route persists to the query string instead.
 *
 * Shape Engine lived in the Toys module until 2026-09-18. The legacy key is
 * read once so nobody loses their settings, then dropped on the next persist.
 */
import type { ShapeMatrixAppSnapshot } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";

export const SHAPE_ENGINE_STORAGE_KEY = "create-shape-engine-state-v1";
export const SHAPE_ENGINE_LEGACY_STORAGE_KEY = "toys-shape-matrix-state-v1";

const VALID_LEVELS = [1, 2, 3, 4];

function parseSnapshot(raw: string | null): ShapeMatrixAppSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShapeMatrixAppSnapshot;
    return parsed && VALID_LEVELS.includes(parsed.level) ? parsed : null;
  } catch {
    return null;
  }
}

export function createShapeEnginePersistence(storage: Storage) {
  return {
    restore: (): ShapeMatrixAppSnapshot | null => {
      try {
        return (
          parseSnapshot(storage.getItem(SHAPE_ENGINE_STORAGE_KEY)) ??
          parseSnapshot(storage.getItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY))
        );
      } catch {
        return null;
      }
    },
    persist: (snapshot: ShapeMatrixAppSnapshot): void => {
      try {
        storage.setItem(SHAPE_ENGINE_STORAGE_KEY, JSON.stringify(snapshot));
        storage.removeItem(SHAPE_ENGINE_LEGACY_STORAGE_KEY);
      } catch {
        /* storage unavailable: the tab just starts fresh next visit */
      }
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/create/shape-engine-persistence.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/create/shape-engine/shape-engine-persistence.ts tests/unit/create/shape-engine-persistence.test.ts
git commit -m "feat(create): Shape tab persistence adapter with Toys-era fallback" -- src/lib/features/create/shape-engine/shape-engine-persistence.ts tests/unit/create/shape-engine-persistence.test.ts
```

---

### Task 2: Register the `shape-engine` create tab

**Files:**

- Modify: `src/lib/shared/foundation/ui/ui-types.ts:16-24`
- Modify: `src/lib/shared/navigation/config/tab-definitions.ts:42-54` (after the `generate` entry)
- Modify: `src/lib/features/create/shared/components/CreateFrontDoor.svelte:12-18`
- Modify: `src/lib/features/create/shared/state/create-module-state.svelte.ts:148-154`
- Modify: `src/lib/features/create/shared/state/create-module/navigation-controller.svelte.ts:34-41`
- Modify: `src/lib/features/create/shared/services/navigation-syncer.ts:59-66`
- Modify: `src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts:424-432`
- Modify: `src/lib/shared/auth/domain/guest-access-config.ts:18`
- Test: `tests/unit/navigation/shape-engine-create-tab.test.ts` (new)
- Test: `tests/unit/auth/guest-access-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/navigation/shape-engine-create-tab.test.ts`:

```ts
// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";

vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("$lib/shared/hmr-helper", () => ({
  hasMimeErrorOccurred: () => false,
  verifyTabSwitch: vi.fn(),
}));

async function createStateAt(pathname: string) {
  history.replaceState({}, "", pathname);
  vi.resetModules();
  const { createNavigationState } =
    await import("$lib/shared/navigation/state/navigation-state.svelte");
  return createNavigationState();
}

describe("Shape Engine as a Create tab", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("registers Shape as a creation method right after Generate", () => {
    const ids = CREATE_TABS.map((tab) => tab.id);
    expect(ids.indexOf("shape-engine")).toBe(ids.indexOf("generate") + 1);
    expect(CREATE_TABS.find((tab) => tab.id === "shape-engine")).toMatchObject({
      label: "Shape",
      labelKey: "tab_create_shape_engine",
      descKey: "tab_desc_create_shape_engine",
      metadata: { isCreationMethod: true },
    });
  });

  it("lets /create/shape-engine open the tab directly", async () => {
    const state = await createStateAt("/create/shape-engine");

    expect(state.currentModule).toBe("create");
    expect(state.activeTab).toBe("shape-engine");
    expect(state.isCreateFrontDoorOpen).toBe(false);
  });
});
```

Append to `tests/unit/auth/guest-access-config.test.ts` inside the `describe("isTabAccessible", ...)` block, after the construct case:

```ts
it("allows the shape-engine tab in create for guests", () => {
  expect(isTabAccessible("create", "shape-engine", "guest")).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/auth/guest-access-config.test.ts`
Expected: 3 failures (order, direct route, guest access).

- [ ] **Step 3: Add the id to `BuildModeId`**

In `src/lib/shared/foundation/ui/ui-types.ts`, the union becomes:

```ts
export type BuildModeId =
  | "assemble" // Click grid points to build sequences visually
  | "construct" // Manual builder (one pictograph at a time)
  | "generate" // Automatic sequence generation
  | "shape-engine" // Pick a shape pairing, get the sequence that draws it
  | "fuse" // Combine two sequences into one
  | "tunnel" // Compose complete sequences into a multi-performer tunnel
  | "one-handed"
  | "guided" // Guided mode
  | "spell"; // Word-to-sequence generator
```

- [ ] **Step 4: Add the tab definition**

In `src/lib/shared/navigation/config/tab-definitions.ts`, insert between the `generate` and `fuse` entries of `CREATE_TABS`:

```ts
  {
    id: "shape-engine",
    labelKey: "tab_create_shape_engine",
    descKey: "tab_desc_create_shape_engine",
    label: "Shape",
    icon: '<i class="fas fa-border-all" aria-hidden="true"></i>',
    description:
      "Pick a shape pairing and get the sequence that draws it. Powered by Shape Engine.",
    color: "#2dd4bf",
    gradient: "linear-gradient(135deg, #5eead4 0%, #2dd4bf 100%)",
    metadata: { isCreationMethod: true },
  },
```

- [ ] **Step 5: Order the front door**

In `src/lib/features/create/shared/components/CreateFrontDoor.svelte`:

```ts
const METHOD_ORDER = new Map([
  ["construct", 0],
  ["generate", 1],
  ["shape-engine", 2],
  ["fuse", 3],
  ["tunnel", 4],
  ["assemble", 5],
]);
```

- [ ] **Step 6: Add the id to the four create-tab lists**

`src/lib/features/create/shared/state/create-module-state.svelte.ts`:

```ts
const VALID_CREATE_TABS: BuildModeId[] = [
  "construct",
  "assemble",
  "generate",
  "shape-engine",
  "fuse",
  "tunnel",
];
```

`src/lib/features/create/shared/state/create-module/navigation-controller.svelte.ts`:

```ts
const CREATION_MODES: BuildModeId[] = [
  "construct",
  "assemble",
  "generate",
  "shape-engine",
  "fuse",
  "tunnel",
  // REMOVED: "spell" - unified into Generate tab (Feb 2026)
] as const;
```

`src/lib/features/create/shared/services/navigation-syncer.ts`:

```ts
const validCreateTabs = [
  "construct",
  "generate",
  "shape-engine",
  "spell",
  "assemble",
  "fuse",
  "tunnel",
];
```

`src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts`:

```ts
  create: [
    "assemble",
    "construct",
    "generate",
    "shape-engine",
    "fuse",
    "spell",
    "editor",
    "export",
  ],
```

- [ ] **Step 7: Open it to guests**

`src/lib/shared/auth/domain/guest-access-config.ts`:

```ts
const GUEST_MODULE_ACCESS: Record<string, string[]> = {
  // shape-engine is public at /shape-engine already, so the tab is too.
  create: ["assemble", "construct", "generate", "shape-engine"],
  browse: ["explore", "you"],
  creators: [],
};
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/auth/guest-access-config.test.ts tests/unit/create/create-front-door-navigation.test.ts`
Expected: all passed.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shared/foundation/ui/ui-types.ts src/lib/shared/navigation/config/tab-definitions.ts src/lib/features/create/shared/components/CreateFrontDoor.svelte src/lib/features/create/shared/state/create-module-state.svelte.ts src/lib/features/create/shared/state/create-module/navigation-controller.svelte.ts src/lib/features/create/shared/services/navigation-syncer.ts src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts src/lib/shared/auth/domain/guest-access-config.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/auth/guest-access-config.test.ts
git commit -m "feat(create): register the shape-engine tab after Generate" -- src/lib/shared/foundation/ui/ui-types.ts src/lib/shared/navigation/config/tab-definitions.ts src/lib/features/create/shared/components/CreateFrontDoor.svelte src/lib/features/create/shared/state/create-module-state.svelte.ts src/lib/features/create/shared/state/create-module/navigation-controller.svelte.ts src/lib/features/create/shared/services/navigation-syncer.ts src/lib/shared/navigation-coordinator/navigation-coordinator.svelte.ts src/lib/shared/auth/domain/guest-access-config.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/auth/guest-access-config.test.ts
```

---

### Task 3: Tab strings in every shipped locale

**Files:**

- Modify: `messages/en.json`, `messages/de.json`, `messages/es.json`, `messages/fr.json`, `messages/it.json`, `messages/ja.json`, `messages/pt.json`, `messages/ru.json`
- Test: `tests/unit/navigation/shape-engine-create-tab.test.ts`

`TranslationKey` is `keyof typeof enMessages`, so adding the keys to `en.json` is the whole type story. Do not run `npm run i18n:types`; it only rewrites a header comment.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/navigation/shape-engine-create-tab.test.ts`. New imports at the top:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

New constant under the imports:

```ts
const MESSAGE_LOCALES = ["de", "en", "es", "fr", "it", "ja", "pt", "ru"];
```

New case inside the describe block:

```ts
it("ships the tab strings in every locale that has the Fuse strings", () => {
  for (const locale of MESSAGE_LOCALES) {
    const messages = JSON.parse(
      readFileSync(resolve(process.cwd(), `messages/${locale}.json`), "utf8")
    ) as Record<string, string>;
    expect(messages.tab_create_shape_engine, locale).toBeTruthy();
    expect(messages.tab_desc_create_shape_engine, locale).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts`
Expected: the locale case fails on `de`.

- [ ] **Step 3: Add the strings**

Insert each pair directly after that locale's `tab_create_generate` and `tab_desc_create_generate` lines so the keys stay grouped. Values:

| locale | `tab_create_shape_engine` | `tab_desc_create_shape_engine`                                                                |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| en     | Shape                     | Pick a shape pairing and get the sequence that draws it. Powered by Shape Engine.             |
| de     | Formen                    | Wähle ein Formenpaar und erhalte die Sequenz, die es zeichnet. Angetrieben von Shape Engine.  |
| es     | Formar                    | Elige un par de formas y obtén la secuencia que lo dibuja. Impulsado por Shape Engine.        |
| fr     | Façonner                  | Choisis une paire de formes et obtiens la séquence qui la trace. Propulsé par Shape Engine.   |
| it     | Modellare                 | Scegli una coppia di forme e ottieni la sequenza che la disegna. Basato su Shape Engine.      |
| ja     | 造形                      | 形のペアを選ぶと、それを描くシーケンスが得られます。Shape Engine 搭載。                       |
| pt     | Moldar                    | Escolha um par de formas e receba a sequência que o desenha. Com tecnologia Shape Engine.     |
| ru     | Форма                     | Выберите пару фигур и получите последовательность, которая её рисует. На основе Shape Engine. |

Example for `messages/en.json` (the other locales follow the same shape at their own line numbers):

```json
  "tab_create_generate": "Generate",
  "tab_create_shape_engine": "Shape",
```

```json
  "tab_desc_create_generate": "Auto-create sequences",
  "tab_desc_create_shape_engine": "Pick a shape pairing and get the sequence that draws it. Powered by Shape Engine.",
```

- [ ] **Step 4: Run the test and prettier**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts`
Expected: all passed.

Run: `npx prettier --check messages/en.json messages/de.json messages/es.json messages/fr.json messages/it.json messages/ja.json messages/pt.json messages/ru.json`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/de.json messages/es.json messages/fr.json messages/it.json messages/ja.json messages/pt.json messages/ru.json tests/unit/navigation/shape-engine-create-tab.test.ts
git commit -m "i18n: Shape tab label and description" -- messages/en.json messages/de.json messages/es.json messages/fr.json messages/it.json messages/ja.json messages/pt.json messages/ru.json tests/unit/navigation/shape-engine-create-tab.test.ts
```

---

### Task 4: Mount the tab inside Create

**Files:**

- Create: `src/lib/features/create/shape-engine/ShapeEngineTab.svelte`
- Modify: `src/lib/features/create/shared/components/CreationToolPanelSlot.svelte:21-24,291-300`
- Modify: `src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte:122-126`

No unit test: this is composition, proven in the browser in Task 7.

- [ ] **Step 1: Create the tab component**

```svelte
<!--
  ShapeEngineTab.svelte - Shape Engine mounted as the Create module's Shape
  tab. The shared app owns everything; this host only supplies persistence
  and a sized box. The standalone /shape-engine route persists to the URL
  for deep-linking; inside the app the tab remembers its state locally,
  because module tabs do not own the URL.
-->
<script lang="ts">
  import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
  import { createShapeEnginePersistence } from "./shape-engine-persistence";

  const persistence = createShapeEnginePersistence(localStorage);
</script>

<div class="shape-engine-tab">
  <ShapeMatrixApp {persistence} variant="embedded" />
</div>

<style>
  .shape-engine-tab {
    flex: 1;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
```

- [ ] **Step 2: Add the tool-panel branch**

In `src/lib/features/create/shared/components/CreationToolPanelSlot.svelte`, update the deferral comment:

```ts
// GeneratePanel (136-file subtree), AssembleToolPanel (21), FuseTab (235!)
// and ShapeEngineTab are deferred via LazyMount — only the active build-mode
// tab's chunk loads. Construct is the default tab so ConstructTabContent
// stays eager. This keeps ~400 files out of the Create module's first-paint
// graph (see scripts/trace-create-three.cjs).
```

and add a branch after the `tunnel` one:

```svelte
          {:else if activeToolPanel === "tunnel"}
            <LazyMount
              loader={() => import("../../tunnel/TunnelTab.svelte")}
              active
            />
          {:else if activeToolPanel === "shape-engine"}
            <!-- Shape - pick a shape pairing, get the sequence (deferred chunk) -->
            <LazyMount
              loader={() => import("../../shape-engine/ShapeEngineTab.svelte")}
              active
            />
          {/if}
```

- [ ] **Step 3: Give it the full workspace**

In `src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte`:

```ts
// Fuse, Tunnel and Shape own complete workspaces inside their tool-panel surface.
const ownsFullWorkspace = $derived(
  navigationState.activeTab === "fuse" ||
    navigationState.activeTab === "tunnel" ||
    navigationState.activeTab === "shape-engine"
);
```

- [ ] **Step 4: Type-check the touched files**

Run: `npm run check:tsc`
Expected: exit 0, no diagnostics under `src/` or `tests/`.

Run: `npx prettier --check src/lib/features/create/shape-engine/ShapeEngineTab.svelte src/lib/features/create/shared/components/CreationToolPanelSlot.svelte src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte`
Expected: clean.

- [ ] **Step 5: Confirm Create's eager graph did not grow**

Run `node scripts/trace-create-three.cjs` in the worktree and in `E:/tka-platform`, and compare the eager-file totals the script prints. They must match. If the worktree total is larger, the new import is not lazy; fix it before moving on. Do not stash anything.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/create/shape-engine/ShapeEngineTab.svelte src/lib/features/create/shared/components/CreationToolPanelSlot.svelte src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte
git commit -m "feat(create): mount Shape Engine as the Shape tab" -- src/lib/features/create/shape-engine/ShapeEngineTab.svelte src/lib/features/create/shared/components/CreationToolPanelSlot.svelte src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte
```

---

### Task 5: Leave Toys, redirect old links

**Files:**

- Modify: `src/lib/shared/navigation/config/tab-definitions.ts:831-846` (TOYS_TABS)
- Modify: `src/lib/features/toys/ToysModule.svelte:9-17`
- Delete: `src/lib/features/toys/tabs/shape-matrix/ShapeMatrixToy.svelte`
- Modify: `src/lib/shared/navigation/state/navigation-state.svelte.ts:215-222`
- Modify: `src/lib/shared/shape-matrix/README.md:3-10`
- Modify: `messages/en.json` (remove `tab_toys_shape_matrix`, `tab_desc_toys_shape_matrix`)
- Test: `tests/unit/navigation/shape-engine-create-tab.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/navigation/shape-engine-create-tab.test.ts`. Extend the tab-definitions import:

```ts
import {
  CREATE_TABS,
  TOYS_TABS,
} from "$lib/shared/navigation/config/tab-definitions";
```

New cases inside the describe block:

```ts
it("no longer lists Shape Matrix under Toys", () => {
  expect(TOYS_TABS.map((tab) => tab.id)).toEqual([
    "third-order",
    "hand-tunnel",
  ]);
  const en = JSON.parse(
    readFileSync(resolve(process.cwd(), "messages/en.json"), "utf8")
  ) as Record<string, string>;
  expect(en.tab_toys_shape_matrix).toBeUndefined();
  expect(en.tab_desc_toys_shape_matrix).toBeUndefined();
});

it("sends the old /toys/shape-matrix link to the Shape tab", async () => {
  const state = await createStateAt("/toys/shape-matrix");

  expect(state.currentModule).toBe("create");
  expect(state.activeTab).toBe("shape-engine");
  expect(state.isCreateFrontDoorOpen).toBe(false);
});

it("leaves other Toys links alone", async () => {
  const state = await createStateAt("/toys/hand-tunnel");

  expect(state.currentModule).toBe("toys");
  expect(state.activeTab).toBe("hand-tunnel");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts`
Expected: the Toys listing and redirect cases fail; the hand-tunnel case passes.

- [ ] **Step 3: Remove the toy**

Delete the file:

```bash
git rm src/lib/features/toys/tabs/shape-matrix/ShapeMatrixToy.svelte
```

In `src/lib/features/toys/ToysModule.svelte`:

```ts
const tabComponents: Record<string, () => Promise<{ default: any }>> = {
  "third-order": () => import("./tabs/third-order/ThirdOrderToy.svelte"),
  "hand-tunnel": () => import("./tabs/hand-tunnel/HandTunnelToy.svelte"),
};

const activeTab = $derived(
  navigationState.activeTab || TOYS_TABS[0]?.id || "third-order"
);
```

In `src/lib/shared/navigation/config/tab-definitions.ts`, replace the `TOYS_TABS` comment and drop the `shape-matrix` entry:

```ts
// Toys module tabs - user-facing interactive toys, added one at a time on
// Austen's explicit request (the successor to the dissolved Playground module,
// whose galleries now live in the Library's Art shelf). Shape Matrix was the
// first toy; it graduated to the Create module's Shape tab on 2026-09-18.
export const TOYS_TABS: Section[] = [
  {
    id: "third-order",
```

In `messages/en.json`, delete these two lines:

```json
  "tab_desc_toys_shape_matrix": "Explore shape pairings in an interactive matrix and watch each path traced live",
```

```json
  "tab_toys_shape_matrix": "Shape Matrix",
```

- [ ] **Step 4: Redirect the old URL**

In `src/lib/shared/navigation/state/navigation-state.svelte.ts`, replace

```ts
const normalizedModule = normalizeModuleId(rawUrlModule);
if (normalizedModule) {
  urlTab = normalizeSectionId(normalizedModule, urlTab);
}
```

with

```ts
let normalizedModule = normalizeModuleId(rawUrlModule);
if (normalizedModule) {
  urlTab = normalizeSectionId(normalizedModule, urlTab);
}

// Shape Engine graduated from Toys to the Create module's Shape tab
// (2026-09-18): the old /toys/shape-matrix link opens what it became.
if (normalizedModule === "toys" && urlTab === "shape-matrix") {
  normalizedModule = "create";
  urlTab = "shape-engine";
}
```

- [ ] **Step 5: Update the README consumer list**

In `src/lib/shared/shape-matrix/README.md`, replace

```md
The implementation is consumed by the `/shape-engine` public
destination, the history archive, and the lab dev harness
```

with

```md
The implementation is consumed by the `/shape-engine` public
destination, the Create module's Shape tab
(`src/lib/features/create/shape-engine/`), the history archive, and the lab
dev harness
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/create/create-front-door-navigation.test.ts tests/unit/navigation/scan-atlas-route-migration.test.ts tests/unit/navigation/module-restore-intent.test.ts`
Expected: all passed.

Run: `grep -rn "shape-matrix" src/lib/features/toys src/lib/features/create/shared --include="*.svelte" --include="*.ts"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/navigation/config/tab-definitions.ts src/lib/features/toys/ToysModule.svelte src/lib/shared/navigation/state/navigation-state.svelte.ts src/lib/shared/shape-matrix/README.md messages/en.json tests/unit/navigation/shape-engine-create-tab.test.ts
git commit -m "feat(create): Shape Engine leaves Toys; old link redirects" -- src/lib/shared/navigation/config/tab-definitions.ts src/lib/features/toys/ToysModule.svelte src/lib/features/toys/tabs/shape-matrix/ShapeMatrixToy.svelte src/lib/shared/navigation/state/navigation-state.svelte.ts src/lib/shared/shape-matrix/README.md messages/en.json tests/unit/navigation/shape-engine-create-tab.test.ts
```

---

### Task 6: Project gates

**Files:** none new.

- [ ] **Step 1: Type gate**

Run: `npm run check:tsc`
Expected: exit 0.

- [ ] **Step 2: Lint the touched files**

Run:

```bash
npx eslint src/lib/features/create/shape-engine src/lib/features/create/shared/components/CreationToolPanelSlot.svelte src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte src/lib/features/create/shared/components/CreateFrontDoor.svelte src/lib/features/toys/ToysModule.svelte src/lib/shared/navigation/state/navigation-state.svelte.ts src/lib/shared/navigation/config/tab-definitions.ts tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/create/shape-engine-persistence.test.ts
npx prettier --check src/lib/features/create/shape-engine src/lib/features/create/shared/components/CreationToolPanelSlot.svelte src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte src/lib/features/create/shared/components/CreateFrontDoor.svelte src/lib/features/toys/ToysModule.svelte src/lib/shared/navigation/state/navigation-state.svelte.ts src/lib/shared/navigation/config/tab-definitions.ts src/lib/shared/shape-matrix/README.md tests/unit/navigation/shape-engine-create-tab.test.ts tests/unit/create/shape-engine-persistence.test.ts
```

Expected: both clean. Fix formatting with `npx prettier --write <file>` and re-commit the affected file with a pathspec if needed.

- [ ] **Step 3: Unit suite**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation tests/unit/create tests/unit/auth`
Expected: all passed.

---

### Task 7: Browser verification and integration

Owned by the main session (visual judgment stays with the agent that can inspect the surface). Not delegated.

- [ ] **Step 1: Task-owned dev server** on a free port from the worktree, never 5173.
- [ ] **Step 2: `/create`** front door: Shape card is third, after Generate, teal, with the "Pick a shape pairing..." line.
- [ ] **Step 3: `/create/shape-engine`**: engine fills the pane at 375x667, 960x412, 1440x900, 3840x2160 (the last one at 100% for the 4K monitor). No sequence workspace, no clipped controls.
- [ ] **Step 4: Persistence**: change level, reload, level survives; `localStorage["create-shape-engine-state-v1"]` is set.
- [ ] **Step 5: `/toys/shape-matrix`** lands on the Shape tab; `/toys` shows Third Order and Hand Tunnel only.
- [ ] **Step 6: Guest**: in a fresh profile without sign-in, the Shape card and tab are present.
- [ ] **Step 7: Integrate** from `E:/tka-platform` (PowerShell, so the route is not path-converted):

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/shape-engine-create-tab --route /create/shape-engine
```

Stop and report if any gate fails; leave the branch and worktree intact.
