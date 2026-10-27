import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import {
  SequencePersister,
  type WorkspaceDraftState,
} from "#lib/features/create/shared/services/sequence-persister.js";

// Holds one load at the point where it reads the primary copy, so a save can
// land in the middle of it the way the debounced autosave did in the field.
const loadGate = vi.hoisted(() => ({
  held: null as Promise<void> | null,
  entered: () => {},
}));
vi.mock(
  "#lib/shared/persistence/services/dexie-persistence-service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("#lib/shared/persistence/services/dexie-persistence-service.js")
      >();
    return {
      ...actual,
      loadCurrentSequenceState: async (
        ...args: Parameters<typeof actual.loadCurrentSequenceState>
      ) => {
        const held = loadGate.held;
        if (held) {
          loadGate.held = null;
          loadGate.entered();
          await held;
        }
        return actual.loadCurrentSequenceState(...args);
      },
    };
  }
);

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const workspace = (name: string): WorkspaceDraftState => ({
  currentSequence: createSequenceData({ id: name, name }),
  selectedStartPlacement: null,
  hasStartPlacement: false,
  activeBuildSection: "construct",
});

// Field reports: one tab, a draft already stored, and "Another tab changed
// this draft." seconds after a reload. The other "tab" was this same editor.
describe("one editor never conflicts with itself", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.userWork.clear();
  });

  it("does not let a save land in the middle of a load", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("first"));

    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      loadGate.entered = resolve;
    });
    loadGate.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = persister.loadCurrentState("construct");
    await entered;
    // The autosave fires while the load is still reading storage.
    const save = persister.saveCurrentState(workspace("second"));
    await Promise.race([save.catch(() => undefined), settle()]);
    release();
    const [loaded] = await Promise.all([load, save]);

    // Without the queue the load saw the save's revision against the head it
    // had already read, and flagged "Another tab changed this draft."
    expect(persister.getDraftStatus("construct").status).toBe("saved");
    expect(loaded?.currentSequence?.name).toBe("first");
    // The load left the right revision behind: the next save is accepted.
    await persister.saveCurrentState(workspace("third"));
    expect(persister.getDraftStatus("construct").status).toBe("saved");
    expect(
      (await new SequencePersister().loadCurrentState("construct"))
        ?.currentSequence?.name
    ).toBe("third");
  });

  it("adopts a newer head written by its own session", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("before reload"));
    // Another editor instance on the same session (the page before a crash,
    // or a remounted editor) moves the head past this persister's revision.
    const sameSession = new SequencePersister();
    await sameSession.loadCurrentState("construct");
    expect(sameSession.getSessionId("construct")).toBe(
      persister.getSessionId("construct")
    );
    await sameSession.saveCurrentState(workspace("own newer save"));

    const loaded = await persister.loadCurrentState("construct");
    expect(persister.getDraftStatus("construct").status).toBe("saved");
    expect(loaded?.currentSequence?.name).toBe("own newer save");
    await persister.saveCurrentState(workspace("edit on"));
    expect(persister.getDraftStatus("construct").status).toBe("saved");
  });

  // Production 2026-10-24 to 10-27: a reload onto the Create front door, then
  // a pick of Generate. Switching modes saves the mode being left, which this
  // page never opened, so its editor was empty and had never read the head.
  it("leaves a stored draft alone when a mode it never opened saves empty", async () => {
    await new SequencePersister().saveCurrentState(workspace("before reload"));

    const afterReload = new SequencePersister();
    await expect(
      afterReload.saveCurrentState({
        currentSequence: null,
        selectedStartPlacement: null,
        hasStartPlacement: false,
        activeBuildSection: "construct",
      })
    ).resolves.toBeUndefined();
    expect(afterReload.getDraftStatus("construct").status).not.toBe("conflict");

    // The stored draft survives, and opening the mode later restores it.
    const loaded = await afterReload.loadCurrentState("construct");
    expect(loaded?.currentSequence?.name).toBe("before reload");
    expect(afterReload.getDraftStatus("construct").status).toBe("saved");
  });

  it("still flags a head written by a different session", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState(workspace("mine"));
    const other = new SequencePersister();
    await other.beginNewSession("construct");
    await other.saveCurrentState(workspace("theirs"));

    expect(await persister.loadCurrentState("construct")).toBeNull();
    expect(persister.getDraftStatus("construct").status).toBe("conflict");
  });
});
