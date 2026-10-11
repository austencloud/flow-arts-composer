import { describe, expect, it } from "vitest";

import { resolveStageDeleteCommand } from "#lib/features/stage/domain/stage-delete-command.js";
import type { StageSelection } from "#lib/features/stage/state/stage-edit-mode.svelte.js";

describe("Stage Delete command", () => {
  const cases: Array<[StageSelection, object]> = [
    [{ kind: "none" }, { kind: "none" }],
    [
      { kind: "performers", performerIds: ["a", "c"], anchorId: "c" },
      { kind: "remove-performers", performerIds: ["a", "c"] },
    ],
    [
      { kind: "formation", formationId: "set-2" },
      { kind: "remove-formation", formationId: "set-2" },
    ],
    [
      { kind: "clip", performerId: "a", clipId: "clip-1" },
      { kind: "remove-clip", performerId: "a", clipId: "clip-1" },
    ],
    [
      { kind: "travel", formationId: "set-2", performerId: "b" },
      { kind: "reset-travel", formationId: "set-2", performerId: "b" },
    ],
    [
      { kind: "spot", formationId: "set-2", performerId: "b" },
      {
        kind: "explain-required-spot",
        formationId: "set-2",
        performerId: "b",
      },
    ],
  ];

  it.each(cases)(
    "maps %o without consulting the playhead",
    (selection, command) => {
      expect(resolveStageDeleteCommand(selection)).toEqual(command);
    }
  );
});
