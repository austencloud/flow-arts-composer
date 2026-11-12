// `sequence_kept` is the one event that means "a person kept something". Its
// whole value is that autosave never fires it: autosave runs on every beat
// edit, and counting it would turn anyone who tapped twice into a keeper.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureEvent: vi.fn(),
  captureWhenReady: vi.fn(),
}));

import {
  captureEvent,
  captureWhenReady,
} from "#lib/shared/analytics/services/posthog.js";
import { logShareAction } from "#lib/shared/analytics/services/posthog-activity-logger.js";
import { createSequencePersistenceCoordinator } from "#lib/features/create/shared/state/persistence/sequence-persistence-coordinator.svelte.js";
import type { SequencePersister } from "#lib/features/create/shared/services/sequence-persister.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function eventNames(): string[] {
  return [
    ...vi.mocked(captureEvent).mock.calls,
    ...vi.mocked(captureWhenReady).mock.calls,
  ].map(([name]) => name);
}

describe("sequence_kept", () => {
  beforeEach(() => {
    vi.mocked(captureEvent).mockClear();
    vi.mocked(captureWhenReady).mockClear();
  });

  it("is not sent by autosave", async () => {
    const persister = {
      saveCurrentState: vi.fn().mockResolvedValue(undefined),
    } as unknown as SequencePersister;
    const coordinator = createSequencePersistenceCoordinator(persister);
    const sequence = {
      id: "seq-1",
      word: "AB",
      steps: [{}, {}],
    } as unknown as SequenceData;

    await coordinator.saveSequenceOnly(sequence, null, true);

    expect(eventNames()).toContain("sequence_autosaved");
    expect(eventNames()).not.toContain("sequence_kept");
  });

  it("is sent beside the old event when a link is copied or a file exported", async () => {
    await logShareAction("link_copy", { sequenceId: "seq-1" });
    await logShareAction("sequence_export", {
      sequenceId: "seq-1",
      exportFormat: "png",
    });

    expect(eventNames()).toEqual([
      "link_copy",
      "sequence_kept",
      "sequence_export",
      "sequence_kept",
    ]);
    const kept = vi
      .mocked(captureWhenReady)
      .mock.calls.filter(([name]) => name === "sequence_kept")
      .map(([, properties]) => properties);
    expect(kept).toEqual([
      expect.objectContaining({ kind: "share", sequence_id: "seq-1" }),
      expect.objectContaining({ kind: "export", export_format: "png" }),
    ]);
  });
});
