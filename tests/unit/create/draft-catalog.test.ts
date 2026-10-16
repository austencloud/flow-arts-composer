import { describe, expect, it } from "vitest";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  draftResumePath,
  groupDeviceDrafts,
} from "#lib/features/create/shared/services/draft-catalog.js";
import type { DraftVersion } from "#lib/features/create/shared/services/draft-types.js";

function version(
  id: string,
  sessionId: string,
  savedAt: number,
  mode: DraftVersion["mode"] = "construct"
): DraftVersion {
  return {
    id,
    sessionId,
    savedAt,
    mode,
    workspace: {
      currentSequence: createSequenceData({ id: "same-sequence", name: "ABC" }),
      selectedStartPlacement: null,
      hasStartPlacement: true,
      activeBuildSection: mode,
    },
  };
}

describe("You draft catalog", () => {
  it("groups versions by session and mode, with newest drafts and versions first", () => {
    const older = version("old", "one", 10);
    const latest = version("new", "one", 30);
    const other = version("other", "two", 20);
    const assemble = version("assembly", "one", 40, "assemble");
    const input = [older, other, latest, assemble, latest];
    const drafts = groupDeviceDrafts(input);
    expect(drafts.map((draft) => draft.latest.id)).toEqual([
      "assembly",
      "new",
      "other",
    ]);
    expect(drafts[1].versions.map((draft) => draft.id)).toEqual(["new", "old"]);
    expect(input[0]).toBe(older);
  });

  it("omits empty workspaces but retains a chosen start placement", () => {
    const empty = version("empty", "empty", 30);
    empty.workspace.hasStartPlacement = false;
    expect(
      groupDeviceDrafts([empty, version("start", "started", 10)]).map(
        (draft) => draft.latest.id
      )
    ).toEqual(["start"]);
  });

  it("encodes the selected version and preserves its editor mode", () => {
    expect(draftResumePath(version("version/a?b", "one", 1, "assemble"))).toBe(
      "/create/assemble?draft=version%2Fa%3Fb"
    );
  });
});
