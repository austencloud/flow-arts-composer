import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ActiveCreateModule } from "#lib/shared/foundation/ui/ui-types.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { db } from "#lib/shared/persistence/database/tka-database.js";
import { SequencePersister } from "../../services/sequence-persister.js";
import { createSequencePersistenceCoordinator } from "./sequence-persistence-coordinator.svelte.js";

const tabs = ["construct", "generate", "assemble"] as const;

async function saveWorkspaces(persister: SequencePersister): Promise<void> {
  for (const tab of tabs) {
    await persister.saveCurrentState({
      currentSequence: createSequenceData({
        id: `sequence-${tab}`,
        name: `${tab} draft`,
      }),
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: tab,
    });
  }
}

async function expectOnlyCleared(
  clearedTab: ActiveCreateModule
): Promise<void> {
  const reloadedPersister = new SequencePersister();
  for (const tab of tabs) {
    const reloaded = await reloadedPersister.loadCurrentState(tab);
    if (tab === clearedTab) {
      expect(reloaded).toBeNull();
    } else {
      expect(reloaded?.activeBuildSection).toBe(tab);
      expect(reloaded?.currentSequence?.id).toBe(`sequence-${tab}`);
      expect(reloaded?.currentSequence?.name).toBe(`${tab} draft`);
    }
  }
}

describe("Create workspace persistence isolation", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.userWork.clear();
  });
  afterEach(() => localStorage.clear());

  it.each(tabs)("clears only the %s workspace", async (tab) => {
    const persister = new SequencePersister();
    await saveWorkspaces(persister);

    const coordinator = createSequencePersistenceCoordinator(
      persister,
      undefined,
      tab
    );
    await coordinator.clearState();

    await expectOnlyCleared(tab);
  });

  it("uses the cached tab when no fixed tab was provided", async () => {
    const persister = new SequencePersister();
    await saveWorkspaces(persister);

    const coordinator = createSequencePersistenceCoordinator(persister);
    coordinator.updateCachedActiveTab("generate");
    await coordinator.clearState();

    await expectOnlyCleared("generate");
  });

  it("keeps the fixed tab as the clear target after navigation cache changes", async () => {
    const persister = new SequencePersister();
    await saveWorkspaces(persister);

    const coordinator = createSequencePersistenceCoordinator(
      persister,
      undefined,
      "construct"
    );
    coordinator.updateCachedActiveTab("generate");
    await coordinator.clearState();

    await expectOnlyCleared("construct");
  });

  it("defaults to Construct when no tab has been selected", async () => {
    const persister = new SequencePersister();
    await saveWorkspaces(persister);

    const coordinator = createSequencePersistenceCoordinator(persister);
    await coordinator.clearState();

    await expectOnlyCleared("construct");
  });

  it("saves to its fixed tab even when navigation supplies another mode", async () => {
    const persister = new SequencePersister();
    const coordinator = createSequencePersistenceCoordinator(
      persister,
      undefined,
      "generate"
    );
    coordinator.updateCachedActiveTab("construct");
    await coordinator.saveState({
      currentSequence: createSequenceData({ id: "generate-work" }),
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    });

    expect(
      (await persister.loadCurrentState("generate"))?.currentSequence?.id
    ).toBe("generate-work");
    expect(await persister.loadCurrentState("construct")).toBeNull();
  });

  it("skips loading the old workspace for an explicit import", async () => {
    const persister = new SequencePersister();
    await persister.saveCurrentState({
      currentSequence: createSequenceData({ id: "older-draft" }),
      selectedStartPlacement: null,
      hasStartPlacement: false,
      activeBuildSection: "construct",
    });

    const coordinator = createSequencePersistenceCoordinator(
      persister,
      undefined,
      "construct"
    );
    expect(await coordinator.initialize(true)).toBeNull();
    expect(coordinator.isInitialized).toBe(true);
    expect(
      (await persister.loadCurrentState("construct"))?.currentSequence?.id
    ).toBe("older-draft");
  });
});
