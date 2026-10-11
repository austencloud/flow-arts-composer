import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const persister = vi.hoisted(() => ({
  loadPropPreferences: vi.fn(),
  savePropPreferences: vi.fn(),
}));

vi.mock(
  "#lib/shared/community/services/prop-preference-persister.js",
  () => persister
);

import {
  createPropPreferenceState,
  loadAndRememberPropPreferences,
} from "#lib/shared/community/state/prop-preference-state.svelte.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("prop preference state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persister.loadPropPreferences.mockResolvedValue({
      propsISpinWith: [PropType.STAFF],
      favoriteProp: PropType.STAFF,
      favoriteCatdog: null,
    });
    persister.savePropPreferences.mockResolvedValue(undefined);
  });

  it("applies a complete profile selection optimistically and rolls back a failed write", async () => {
    const write = deferred();
    persister.savePropPreferences.mockReturnValueOnce(write.promise);
    const state = createPropPreferenceState("user-1");
    await state.reload();

    const save = state.saveProfileSelection(
      [PropType.STAFF, PropType.TORCH],
      PropType.TORCH
    );

    expect(state.propsISpinWith).toEqual([PropType.STAFF, PropType.TORCH]);
    expect(state.favoriteProp).toBe(PropType.TORCH);
    expect(state.saving).toBe(true);

    write.reject(new Error("offline"));
    await expect(save).rejects.toThrow("offline");

    expect(state.propsISpinWith).toEqual([PropType.STAFF]);
    expect(state.favoriteProp).toBe(PropType.STAFF);
    expect(state.saving).toBe(false);
    expect(state.error).toContain("editor kept your choices");
  });

  it("serializes rapid snapshots while keeping the newest choice visible", async () => {
    const firstWrite = deferred();
    const secondWrite = deferred();
    persister.savePropPreferences
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const state = createPropPreferenceState("user-1");
    await state.reload();

    const first = state.saveProfileSelection(
      [PropType.STAFF, PropType.CLUB],
      null
    );
    const second = state.saveProfileSelection(
      [PropType.STAFF, PropType.CLUB, PropType.TORCH],
      PropType.TORCH
    );

    expect(state.propsISpinWith).toEqual([
      PropType.STAFF,
      PropType.CLUB,
      PropType.TORCH,
    ]);
    expect(state.favoriteProp).toBe(PropType.TORCH);
    await vi.waitFor(() => {
      expect(persister.savePropPreferences).toHaveBeenCalledTimes(1);
    });

    firstWrite.resolve();
    await first;
    await vi.waitFor(() => {
      expect(persister.savePropPreferences).toHaveBeenCalledTimes(2);
    });
    secondWrite.resolve();
    await second;

    expect(state.propsISpinWith).toEqual([
      PropType.STAFF,
      PropType.CLUB,
      PropType.TORCH,
    ]);
    expect(state.favoriteProp).toBe(PropType.TORCH);
    expect(state.saving).toBe(false);
  });

  it("does not let an older failed write erase a newer queued choice", async () => {
    const firstWrite = deferred();
    persister.savePropPreferences
      .mockReturnValueOnce(firstWrite.promise)
      .mockResolvedValueOnce(undefined);
    const state = createPropPreferenceState("user-1");
    await state.reload();

    const first = state.saveProfileSelection(
      [PropType.STAFF, PropType.CLUB],
      null
    );
    const firstResult = expect(first).rejects.toThrow("first failed");
    const second = state.saveProfileSelection(
      [PropType.STAFF, PropType.TORCH],
      PropType.TORCH
    );
    await vi.waitFor(() => {
      expect(persister.savePropPreferences).toHaveBeenCalledTimes(1);
    });
    firstWrite.reject(new Error("first failed"));

    await firstResult;
    await second;

    expect(state.propsISpinWith).toEqual([PropType.STAFF, PropType.TORCH]);
    expect(state.favoriteProp).toBe(PropType.TORCH);
    expect(state.error).toBeNull();
  });

  it("supports No preference without changing the selected prop list", async () => {
    const state = createPropPreferenceState("user-1");
    await state.reload();

    await state.setFavorite(null);

    expect(state.propsISpinWith).toEqual([PropType.STAFF]);
    expect(state.favoriteProp).toBeNull();
    expect(persister.savePropPreferences).toHaveBeenCalledWith("user-1", {
      propsISpinWith: [PropType.STAFF],
      favoriteProp: null,
      favoriteCatdog: null,
    });
  });

  it("draws an account's last loaded preferences at once on a new mount", async () => {
    persister.loadPropPreferences.mockResolvedValue({
      propsISpinWith: [PropType.CLUB, PropType.TRIAD],
      favoriteProp: PropType.CLUB,
      favoriteCatdog: null,
    });
    await createPropPreferenceState("returning-user").reload();

    persister.loadPropPreferences.mockReturnValueOnce(new Promise(() => {}));
    const remounted = createPropPreferenceState("returning-user");

    expect(remounted.loading).toBe(false);
    expect(remounted.propsISpinWith).toEqual([PropType.CLUB, PropType.TRIAD]);
    expect(remounted.favoriteProp).toBe(PropType.CLUB);
  });

  it("still shows loading for an account it has not loaded yet", () => {
    persister.loadPropPreferences.mockReturnValueOnce(new Promise(() => {}));
    const state = createPropPreferenceState("first-visit-user");

    expect(state.loading).toBe(true);
    expect(state.propsISpinWith).toEqual([]);
  });

  it("draws preferences the app loaded at sign-in on the first mount", async () => {
    persister.loadPropPreferences.mockResolvedValueOnce({
      propsISpinWith: [PropType.FAN],
      favoriteProp: null,
      favoriteCatdog: null,
    });
    await loadAndRememberPropPreferences("signed-in-user");

    persister.loadPropPreferences.mockReturnValueOnce(new Promise(() => {}));
    const state = createPropPreferenceState("signed-in-user");

    expect(state.loading).toBe(false);
    expect(state.propsISpinWith).toEqual([PropType.FAN]);
  });
});
