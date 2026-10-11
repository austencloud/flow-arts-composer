/**
 * The join is part of the sequence, so every copy and save keeps it, and
 * removing it sticks: Copy for Claude, Copy sequence data, the library merge,
 * the cloud draft write, and the Create "already loaded" check.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeCodeCopier } from "#lib/shared/browse/services/claude-code-copier.js";
import type { SequenceDetailLoader } from "#lib/shared/browse/services/sequence-detail-loader.js";
import { toMinimalJson } from "#lib/features/create/shared/services/sequence-json-exporter.js";
import { mergeSavedOverStored } from "#lib/shared/library/services/library-sequence-merge.js";
import { areSequencesEqual } from "#lib/features/create/shared/utils/sequence-comparison.js";
import { checkTransfer } from "#lib/features/create/shared/services/sequence-transfer-handler.js";
import {
  buildJoinFixture,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
} from "./grid-join-fixtures";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  setDoc: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(1),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(() => "draft-ref"),
  getDoc: vi.fn(),
  setDoc: mocks.setDoc,
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => "__deleteField__"),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(() => "__timestamp__"),
}));

vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
  getAuthSync: vi.fn(() => mocks.auth),
}));

vi.mock("#lib/shared/offline/state/sync-status-state.svelte.js", () => ({
  trackWrite: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

vi.mock("#lib/shared/persistence/database/tka-database.js", () => ({
  db: {
    userWork: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ delete: vi.fn().mockResolvedValue(undefined) })),
      })),
      add: mocks.add,
    },
  },
}));

import { Autosaver } from "#lib/features/create/shared/services/autosaver.js";

const loaded = {
  needsFullLoad: () => false,
  loadFullSequence: async (sequence: unknown) => sequence,
} as unknown as SequenceDetailLoader;

describe("Copy for Claude", () => {
  it("describes a joined sequence's join right after the grid line", async () => {
    const copier = new ClaudeCodeCopier(loaded);
    const prompt = await copier.generatePrompt(
      buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE })
    );
    const lines = prompt.split("\n");
    const gridAt = lines.findIndex((line) => line.includes("grid: "));

    expect(lines[gridAt + 1]).toBe(
      "join: red's grid 1 point east of blue's (toward e, steps 1)"
    );
  });

  it("uses the plural for two points", async () => {
    const copier = new ClaudeCodeCopier(loaded);
    const prompt = await copier.generatePrompt(
      buildJoinFixture({ sequenceJoin: JOIN_NORTHEAST_TWO })
    );

    expect(prompt).toContain(
      "join: red's grid 2 points northeast of blue's (toward ne, steps 2)"
    );
  });

  it("leaves an unjoined prompt without a join line", async () => {
    const copier = new ClaudeCodeCopier(loaded);
    const prompt = await copier.generatePrompt(buildJoinFixture());

    expect(prompt).not.toContain("join:");
  });
});

describe("Copy sequence data", () => {
  it("includes the join when the sequence has one", () => {
    const json = toMinimalJson(
      buildJoinFixture({ sequenceJoin: JOIN_NORTHEAST_TWO })
    );

    expect(json.conjoined).toEqual({ toward: "ne", steps: 2 });
  });

  it("omits the key when the sequence has none or a malformed one", () => {
    expect("conjoined" in toMinimalJson(buildJoinFixture())).toBe(false);
    const malformed = {
      ...buildJoinFixture(),
      conjoined: { toward: "up", steps: 9 },
    };
    expect("conjoined" in toMinimalJson(malformed as never)).toBe(false);
  });
});

describe("library save merge", () => {
  const stored = { id: "a", word: "ABC", conjoined: JOIN_EAST_ONE };

  it("drops the stored join when the edited sequence has none", () => {
    const merged = mergeSavedOverStored(stored, { id: "a", word: "ABC" });

    expect("conjoined" in merged).toBe(false);
  });

  it("drops it when the edited sequence carries an undefined or malformed join", () => {
    expect(
      "conjoined" in mergeSavedOverStored(stored, { conjoined: undefined })
    ).toBe(false);
    expect(
      "conjoined" in mergeSavedOverStored(stored, { conjoined: { toward: "x" } })
    ).toBe(false);
  });

  it("takes the edited sequence's join over the stored one", () => {
    const merged = mergeSavedOverStored(stored, {
      conjoined: JOIN_NORTHEAST_TWO,
    });

    expect(merged.conjoined).toEqual(JOIN_NORTHEAST_TWO);
  });

  it("still lets the edit override other stored fields", () => {
    const merged = mergeSavedOverStored(
      { ...stored, notes: "old" },
      { notes: "new" }
    );

    expect(merged.notes).toBe("new");
  });
});

describe("cloud draft write", () => {
  beforeEach(() => {
    mocks.auth.currentUser = { uid: "user-1" };
    mocks.setDoc.mockClear();
  });

  async function savedDraft(sequence: ReturnType<typeof buildJoinFixture>) {
    const autosaver = new Autosaver();
    await autosaver.saveDraft("session-1", sequence);
    await vi.waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
    const [, data, options] = mocks.setDoc.mock.calls[0]!;
    return { data, options };
  }

  it("deletes the stored join when the draft has none", async () => {
    const { data, options } = await savedDraft(buildJoinFixture());

    expect(options).toEqual({ merge: true });
    expect(data.sequenceData.conjoined).toBe("__deleteField__");
  });

  it("writes the join when the draft has one", async () => {
    const { data } = await savedDraft(
      buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE })
    );

    expect(data.sequenceData.conjoined).toEqual(JOIN_EAST_ONE);
  });
});

describe("Create already-loaded check", () => {
  const plain = buildJoinFixture();
  const joined = buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE });

  it("treats the same steps with different joins as different", () => {
    expect(areSequencesEqual(plain, joined)).toBe(false);
    expect(
      areSequencesEqual(
        joined,
        buildJoinFixture({ sequenceJoin: JOIN_NORTHEAST_TWO })
      )
    ).toBe(false);
  });

  it("treats the same join, or no join on both, as equal", () => {
    expect(
      areSequencesEqual(
        joined,
        buildJoinFixture({ sequenceJoin: { ...JOIN_EAST_ONE } })
      )
    ).toBe(true);
    expect(areSequencesEqual(plain, buildJoinFixture())).toBe(true);
  });

  it("sends a joined copy through the replace path when the unjoined one is loaded", () => {
    expect(checkTransfer(joined, plain, true).action).toBe("confirm-needed");
    expect(checkTransfer(joined, joined, true).action).toBe("already-loaded");
  });
});
