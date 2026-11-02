/**
 * published-look-restamp — the Settings action that copies the current look
 * onto every public sequence. The silent failures guarded here: the prop pair
 * being overwritten along with the look, undo turning an absent presentation
 * into an explicit null (which changes what the next publish stamps), and one
 * failed write stopping the rest of the batch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/shared/library/get-library-repository.js", () => ({
  getLibraryRepository: vi.fn(),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { isFullAccount: false, effectiveUserId: null },
}));
vi.mock("#lib/shared/library/services/settings-presentation.js", () => ({
  captureSettingsPresentation: vi.fn(),
}));

import {
  restampPublishedLook,
  restorePublishedLook,
  type PublishedLookDeps,
} from "../published-look-restamp";
import type { CreatorIntent } from "#lib/shared/foundation/domain/models/creator-intent.js";
import type { PresentationIntent } from "#lib/shared/foundation/domain/models/presentation-intent.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const OWNER = "owner-1";

const PROP_PAIR = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.FAN,
  catDogMode: true,
};

const OLD_LOOK = {
  primaryPropColors: { left: "#111111", right: "#222222" },
  trail: { mode: "off" },
  effects: { version: 1, tipEffectMap: {} },
} as unknown as PresentationIntent;

const NEW_LOOK = {
  primaryPropColors: { left: "#00aaff", right: "#ff3300" },
  trail: { mode: "fade", tailLength: undefined },
  effects: { version: 1, tipEffectMap: {} },
} as unknown as PresentationIntent;

function sequence(
  id: string,
  creatorIntent?: CreatorIntent | null
): LibrarySequence {
  return {
    id,
    visibility: "public",
    ...(creatorIntent !== undefined && { creatorIntent }),
  } as unknown as LibrarySequence;
}

/** An in-memory owner library: updateSequence writes through to `store`. */
function fakeLibrary(
  initial: LibrarySequence[],
  failingIds: ReadonlySet<string> = new Set()
) {
  const store = new Map(initial.map((s) => [s.id, s]));
  const updateSequence = vi.fn(
    async (id: string, updates: Partial<LibrarySequence>, ownerId?: string) => {
      expect(ownerId).toBe(OWNER);
      if (failingIds.has(id)) throw new Error(`write refused for ${id}`);
      const next = { ...store.get(id)!, ...updates } as LibrarySequence;
      store.set(id, next);
      return next;
    }
  );
  const deps: PublishedLookDeps = {
    ownerId: OWNER,
    capture: () => NEW_LOOK,
    repository: {
      getUserSequences: vi.fn(async () => [...store.values()]),
      getSequence: vi.fn(async (id: string) => store.get(id) ?? null),
      updateSequence,
    } as unknown as PublishedLookDeps["repository"],
  };
  return { store, deps, updateSequence };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("restampPublishedLook", () => {
  it("queries only the owner's public sequences", async () => {
    const { deps } = fakeLibrary([]);
    await restampPublishedLook(deps);
    expect(deps.repository.getUserSequences).toHaveBeenCalledWith(OWNER, {
      visibility: "public",
    });
  });

  it("stamps every public sequence and leaves the prop pair alone", async () => {
    const { store, deps } = fakeLibrary([
      sequence("recorded", { propConfig: PROP_PAIR, presentation: OLD_LOOK }),
      sequence("default-look", { presentation: null }),
      sequence("never-recorded"),
    ]);

    const result = await restampPublishedLook(deps);

    expect(result).toMatchObject({ updated: 3, failed: 0 });
    for (const id of ["recorded", "default-look", "never-recorded"]) {
      const intent = store.get(id)!.creatorIntent!;
      expect(intent.presentation?.primaryPropColors).toEqual(
        NEW_LOOK.primaryPropColors
      );
    }
    expect(store.get("recorded")!.creatorIntent!.propConfig).toEqual(
      PROP_PAIR
    );
    expect("propConfig" in store.get("never-recorded")!.creatorIntent!).toBe(
      false
    );
  });

  it("writes no undefined values (Firestore rejects them)", async () => {
    const { deps, updateSequence } = fakeLibrary([sequence("a")]);
    await restampPublishedLook(deps);
    const written = updateSequence.mock.calls[0]![1].creatorIntent!;
    expect("tailLength" in (written.presentation!.trail as object)).toBe(false);
  });

  it("records each previous presentation, keeping absent apart from null", async () => {
    const { deps } = fakeLibrary([
      sequence("recorded", { presentation: OLD_LOOK }),
      sequence("default-look", { presentation: null }),
      sequence("never-recorded"),
    ]);

    const { previous } = await restampPublishedLook(deps);

    expect(previous.get("recorded")).toEqual(OLD_LOOK);
    expect(previous.get("default-look")).toBeNull();
    expect(previous.has("never-recorded")).toBe(true);
    expect(previous.get("never-recorded")).toBeUndefined();
  });

  it("counts a failed write without stopping the rest", async () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const { store, deps } = fakeLibrary(
      ids.map((id) => sequence(id)),
      new Set(["b"])
    );

    const result = await restampPublishedLook(deps);

    expect(result).toMatchObject({ updated: 5, failed: 1 });
    for (const id of ids.filter((id) => id !== "b")) {
      expect(store.get(id)!.creatorIntent?.presentation).toBeDefined();
    }
  });

  it("skips soft-deleted sequences", async () => {
    const deleted = {
      ...sequence("gone"),
      isDeleted: true,
    } as unknown as LibrarySequence;
    const { deps, updateSequence } = fakeLibrary([deleted, sequence("live")]);

    const result = await restampPublishedLook(deps);

    expect(result.updated).toBe(1);
    expect(updateSequence).toHaveBeenCalledTimes(1);
    expect(updateSequence.mock.calls[0]![0]).toBe("live");
  });

  it("refuses without a full account", async () => {
    const { deps } = fakeLibrary([sequence("a")]);
    await expect(
      restampPublishedLook({ ...deps, ownerId: null })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("restorePublishedLook", () => {
  it("puts each look back: removes an absent key, writes null where it was null", async () => {
    const { store, deps } = fakeLibrary([
      sequence("recorded", { propConfig: PROP_PAIR, presentation: OLD_LOOK }),
      sequence("default-look", { presentation: null }),
      sequence("never-recorded"),
    ]);
    const { previous } = await restampPublishedLook(deps);

    const result = await restorePublishedLook(previous, deps);

    expect(result).toEqual({ restored: 3, failed: 0 });
    expect(store.get("recorded")!.creatorIntent).toEqual({
      propConfig: PROP_PAIR,
      presentation: OLD_LOOK,
    });
    expect(store.get("default-look")!.creatorIntent).toEqual({
      presentation: null,
    });
    const neverRecorded = store.get("never-recorded")!.creatorIntent!;
    expect("presentation" in neverRecorded).toBe(false);
  });

  it("keeps a prop pair changed after the restamp", async () => {
    const { store, deps } = fakeLibrary([
      sequence("a", { presentation: OLD_LOOK }),
    ]);
    const { previous } = await restampPublishedLook(deps);
    store.set("a", {
      ...store.get("a")!,
      creatorIntent: {
        ...store.get("a")!.creatorIntent,
        propConfig: PROP_PAIR,
      },
    } as LibrarySequence);

    await restorePublishedLook(previous, deps);

    expect(store.get("a")!.creatorIntent).toEqual({
      propConfig: PROP_PAIR,
      presentation: OLD_LOOK,
    });
  });

  it("counts a sequence that is gone or refuses the write, and restores the rest", async () => {
    const { store, deps } = fakeLibrary([
      sequence("a", { presentation: OLD_LOOK }),
      sequence("b", { presentation: OLD_LOOK }),
      sequence("c", { presentation: OLD_LOOK }),
    ]);
    const { previous } = await restampPublishedLook(deps);
    store.delete("b");

    const result = await restorePublishedLook(previous, deps);

    expect(result).toEqual({ restored: 2, failed: 1 });
    expect(store.get("a")!.creatorIntent!.presentation).toEqual(OLD_LOOK);
    expect(store.get("c")!.creatorIntent!.presentation).toEqual(OLD_LOOK);
  });
});
