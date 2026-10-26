import { describe, expect, it } from "vitest";
import {
  findMentions,
  mentionForms,
  selectTests,
} from "../../../scripts/lib/test-changed-select.mjs";

// scripts/lib/test-changed-select.mjs decides what `npm run test:changed` and
// the wt:finish gate run. A wrong rule here does not fail loudly: it quietly
// skips the tests a change touches, so each rule is pinned below.

const INDEX = [
  "tests/unit/3d/foot-contact.test.ts",
  "tests/unit/3d/state/rig.test.ts",
  "tests/unit/shared/auth/session.test.ts",
  "tests/unit/create/draft.test.ts",
  "tests/unit/loose-contract.test.ts",
  "src/lib/shared/3d/state/governor.test.ts",
];

describe("selectTests", () => {
  it("selects a changed test as itself, not as a mention of itself", () => {
    const selection = selectTests({
      changed: ["tests/unit/loose-contract.test.ts"],
      index: INDEX,
      mentions: {
        "tests/unit/loose-contract.test.ts": [
          "tests/unit/loose-contract.test.ts",
        ],
      },
    });
    expect(selection.byReason).toEqual({
      "changed-test": ["tests/unit/loose-contract.test.ts"],
    });
    expect(selection.relatedSources).toEqual([]);
  });

  it("keeps mentions that point at index tests and ignores the rest", () => {
    const selection = selectTests({
      changed: ["src/lib/features/create/draft-store.ts"],
      index: INDEX,
      mentions: new Map([
        [
          "tests/unit/loose-contract.test.ts",
          ["src/lib/features/create/draft-store.ts"],
        ],
        [
          "tests/e2e/not-in-index.test.ts",
          ["src/lib/features/create/draft-store.ts"],
        ],
      ]),
    });
    expect(selection.byReason.mentions).toEqual([
      "tests/unit/loose-contract.test.ts",
    ]);
    expect([
      ...selection.reasons
        .get("tests/unit/loose-contract.test.ts")!
        .get("mentions")!,
    ]).toEqual(["src/lib/features/create/draft-store.ts"]);
  });

  it("maps features, shared and routes paths onto their tests/unit domain dirs", () => {
    const shared = selectTests({
      changed: ["src/lib/shared/3d/state/governor.svelte.ts"],
      index: INDEX,
    });
    expect(shared.byReason.domain).toEqual([
      "tests/unit/3d/foot-contact.test.ts",
      "tests/unit/3d/state/rig.test.ts",
    ]);
    expect(shared.relatedSources).toEqual([
      "src/lib/shared/3d/state/governor.svelte.ts",
    ]);

    const nested = selectTests({
      changed: ["src/lib/shared/auth/sign-in.ts"],
      index: INDEX,
    });
    expect(nested.byReason.domain).toEqual([
      "tests/unit/shared/auth/session.test.ts",
    ]);

    const route = selectTests({
      changed: ["src/routes/(public)/create/+page.svelte"],
      index: INDEX,
    });
    expect(route.byReason.domain).toEqual(["tests/unit/create/draft.test.ts"]);

    const rootRoute = selectTests({
      changed: ["src/routes/+page.svelte"],
      index: INDEX,
    });
    expect(rootRoute.byReason.domain).toBeUndefined();
  });

  it("runs a changed package's own tests and names packages without a test script", () => {
    const selection = selectTests({
      changed: [
        "packages/render-core/src/draw.ts",
        "packages/domain/src/letter.ts",
        "packages/render-core/README.md",
      ],
      index: INDEX,
      packages: {
        "render-core": { hasTest: true },
        domain: { hasTest: false },
      },
    });
    expect(selection.packages).toEqual(["render-core"]);
    expect(selection.packagesWithoutTests).toEqual(["domain"]);
    // Package sources still go to Vitest: app tests import them by alias.
    expect(selection.relatedSources).toEqual([
      "packages/domain/src/letter.ts",
      "packages/render-core/src/draw.ts",
    ]);
  });

  it.each([
    "tests/config/vitest.config.ts",
    "tests/setup/vitest-setup.ts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.check-full.json",
    "vite.config.ts",
    "svelte.config.js",
    "vitest.workspace.config.ts",
  ])("selects the full suite when %s changes", (path) => {
    const selection = selectTests({ changed: [path], index: INDEX });
    expect(selection.fullSuite).toHaveLength(1);
    expect(selection.fullSuite[0].path).toBe(path);
  });

  it("does not treat a scripts-only package.json edit or a nested config as a trigger", () => {
    expect(
      selectTests({
        changed: ["package.json"],
        index: INDEX,
        packageJsonScriptsOnly: true,
      }).fullSuite
    ).toEqual([]);
    expect(
      selectTests({
        changed: ["packages/render-core/package.json", "apps/x/vite.config.ts"],
        index: INDEX,
      }).fullSuite
    ).toEqual([]);
  });

  it("lists co-located component tests without running them", () => {
    const selection = selectTests({
      changed: [
        "src/lib/shared/ui/Picker.svelte",
        "src/lib/shared/ui/sheet.svelte.ts",
      ],
      index: INDEX,
      componentTests: [
        "src/lib/shared/ui/Picker.svelte.test.ts",
        "src/lib/shared/ui/sheet.svelte.test.ts",
        "src/lib/shared/ui/Other.svelte.test.ts",
      ],
    });
    expect(selection.componentTests).toEqual([
      "src/lib/shared/ui/Picker.svelte.test.ts",
      "src/lib/shared/ui/sheet.svelte.test.ts",
    ]);
    expect(selection.tests).toEqual([]);
  });

  it("returns an empty selection for changes no rule ties to a test", () => {
    const selection = selectTests({
      changed: ["docs/notes/plan.md", "static/images/logo.png"],
      index: INDEX,
    });
    expect(selection.tests).toEqual([]);
    expect(selection.fullSuite).toEqual([]);
    expect(selection.packages).toEqual([]);
    expect(selection.relatedSources).toEqual([]);
  });
});

describe("findMentions", () => {
  const governor = "src/lib/shared/3d/state/adaptive-quality-state.svelte.ts";

  it("finds a test that reads the file by its repo path", () => {
    const text = `readFileSync("src/lib/shared/3d/state/adaptive-quality-state.svelte.ts")`;
    expect(findMentions(text, [governor])).toEqual([governor]);
  });

  it.each([
    `import { x } from "$lib/shared/3d/state/adaptive-quality-state.svelte";`,
    `import { x } from "#lib/shared/3d/state/adaptive-quality-state.svelte.js";`,
    `import { x } from "$shared/3d/state/adaptive-quality-state.svelte";`,
    `const source = "../state/adaptive-quality-state.svelte";`,
  ])("finds an alias or bare-name spelling: %s", (text) => {
    expect(findMentions(text, [governor])).toEqual([governor]);
  });

  it("does not match a longer name that starts or ends with the file's name", () => {
    const store = "src/lib/features/create/draft-store.ts";
    expect(
      findMentions(`"src/lib/features/create/draft-store-v2.ts"`, [store])
    ).toEqual([]);
    expect(findMentions(`import "./legacy-draft-store";`, [store])).toEqual([]);
    expect(findMentions(`import "./draft-store.js";`, [store])).toEqual([
      store,
    ]);
  });

  it("does not match generic bare names, only their full paths", () => {
    const index = "src/lib/shared/keyboard/index.ts";
    const types = "src/lib/features/create/types.ts";
    expect(mentionForms(index).some((form) => form.bare)).toBe(false);
    expect(findMentions(`import { a } from "./index";`, [index])).toEqual([]);
    expect(findMentions(`import type { T } from "./types";`, [types])).toEqual(
      []
    );
    expect(findMentions(`"src/lib/shared/keyboard/index.ts"`, [index])).toEqual(
      [index]
    );
    expect(findMentions(`"$lib/features/create/types"`, [types])).toEqual([
      types,
    ]);
  });

  it("does not match SvelteKit route file names on their own", () => {
    const page = "src/routes/create/+page.svelte";
    expect(findMentions(`"./+page.svelte"`, [page])).toEqual([]);
    expect(findMentions(`"src/routes/create/+page.svelte"`, [page])).toEqual([
      page,
    ]);
  });

  it("ignores root manifests and bounds other root files on both sides", () => {
    expect(mentionForms("package.json")).toEqual([]);
    expect(
      findMentions(`readFileSync("package.json")`, ["package.json"])
    ).toEqual([]);
    expect(
      findMentions(`readFileSync("myvite.config.ts")`, ["vite.config.ts"])
    ).toEqual([]);
    expect(
      findMentions(`readFileSync("vite.config.ts")`, ["vite.config.ts"])
    ).toEqual(["vite.config.ts"]);
  });
});
