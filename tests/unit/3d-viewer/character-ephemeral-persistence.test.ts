/**
 * Guards the Task 1 fix from
 * docs/superpowers/plans/2026-08-24-film-director-plane-axes.md: a seeded
 * viewer is documented as "reads its own config and writes NOTHING back",
 * but character instances used to read the user's persisted plane mode at
 * creation and write the tka-3d-planeMode-<id> / tka-3d-rotVariant-<id>
 * localStorage keys on every plane/rotation change regardless of that seed.
 * `CharacterInstanceConfig.persistent`
 * threads the seeded viewer's write-silence down to the character instance.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { Plane } from "@austencloud/scene-3d";

const ID = "eph-persist-test";
const PLANE_MODE_KEY = `tka-3d-planeMode-${ID}`;
const ROT_VARIANT_KEY = `tka-3d-rotVariant-${ID}`;

function makeDeps() {
  return makeStandaloneDeps();
}

afterEach(() => {
  localStorage.removeItem(PLANE_MODE_KEY);
  localStorage.removeItem(ROT_VARIANT_KEY);
  vi.restoreAllMocks();
});

describe("character instance state — persistent: false (ephemeral / seeded viewers)", () => {
  it("does not read a pre-populated persisted plane mode into initial state", () => {
    localStorage.setItem(PLANE_MODE_KEY, "dual-wheel");

    const a = createCharacterInstanceState(
      { id: ID, positionX: 0, persistent: false },
      makeDeps()
    );

    // The raw override stays null (nothing was read from storage), so the
    // effective plane mode resolves from defaults (WALL), never the
    // persisted "dual-wheel" value that was sitting in localStorage.
    expect(a.rawPlaneMode).toBeNull();
    expect(a.planeMode).toBe("wall");
  });

  it("records zero writes to plane-mode/rot-variant keys for setHandPlane + setStepHandPlane", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const a = createCharacterInstanceState(
      { id: ID, positionX: 0, persistent: false },
      makeDeps()
    );

    a.setHandPlane("blue", Plane.WHEEL);
    a.setStepHandPlane(2, "red", Plane.FLOOR);

    const planeWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === PLANE_MODE_KEY
    );
    const rotWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === ROT_VARIANT_KEY
    );
    expect(planeWrites).toHaveLength(0);
    expect(rotWrites).toHaveLength(0);

    // Belt-and-suspenders: the keys themselves were never actually set.
    expect(localStorage.getItem(PLANE_MODE_KEY)).toBeNull();
    expect(localStorage.getItem(ROT_VARIANT_KEY)).toBeNull();
  });

  it("records zero writes for cycleRotationVariant", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const a = createCharacterInstanceState(
      { id: ID, positionX: 0, persistent: false },
      makeDeps()
    );

    a.cycleRotationVariant();

    const rotWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === ROT_VARIANT_KEY
    );
    expect(rotWrites).toHaveLength(0);
    expect(localStorage.getItem(ROT_VARIANT_KEY)).toBeNull();
  });

  it("default (persistent omitted) still persists — the real viewer is unchanged", () => {
    const a = createCharacterInstanceState({ id: ID, positionX: 0 }, makeDeps());

    a.setHandPlane("blue", Plane.WHEEL);

    expect(localStorage.getItem(PLANE_MODE_KEY)).not.toBeNull();
  });

  it("default (persistent omitted) still reads a pre-populated persisted plane mode", () => {
    localStorage.setItem(PLANE_MODE_KEY, "dual-wheel");

    const a = createCharacterInstanceState({ id: ID, positionX: 0 }, makeDeps());

    expect(a.rawPlaneMode).toBe("dual-wheel");
  });
});
