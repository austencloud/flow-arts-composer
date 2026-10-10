import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import { DuetPersister } from "#lib/shared/3d/services/duet-persister.js";

const STORAGE_KEY = "tka-3d-duets";

describe("duet performer terminology migration", () => {
  const records = new Map<string, string>();

  beforeEach(() => {
    records.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createPersister(): DuetPersister {
    return new DuetPersister({} as PublicSequencesLoader);
  }

  it("writes performer sequence fields without the old avatar aliases", async () => {
    await createPersister().saveDuet({
      name: "Counterpoint",
      performer1SequenceId: "sequence-a",
      performer2SequenceId: "sequence-b",
    });

    const [stored] = JSON.parse(records.get(STORAGE_KEY) ?? "[]");
    expect(stored).toMatchObject({
      version: 2,
      performer1SequenceId: "sequence-a",
      performer2SequenceId: "sequence-b",
    });
    expect(stored).not.toHaveProperty("avatar1SequenceId");
    expect(stored).not.toHaveProperty("avatar2SequenceId");
  });

  it("loads legacy saved duets into the performer-based model", async () => {
    records.set(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "legacy-duet",
          name: "Legacy duet",
          avatar1SequenceId: "sequence-a",
          avatar2SequenceId: "sequence-b",
          stepOffset: 0,
          positioning: "side-by-side",
          createdAt: "2026-08-30T00:00:00.000Z",
        },
      ])
    );

    const [duet] = await createPersister().getAllDuets();
    expect(duet).toMatchObject({
      id: "legacy-duet",
      performer1SequenceId: "sequence-a",
      performer2SequenceId: "sequence-b",
    });
    expect(duet).not.toHaveProperty("avatar1SequenceId");
    expect(duet).not.toHaveProperty("avatar2SequenceId");
  });
});
