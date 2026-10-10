import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  applySequenceActions,
  pressSequenceAction,
  resetSequenceActions,
  withSequenceAction,
  type PostSequenceTransforms,
} from "#lib/shared/media-composition/domain/post-sequence-actions.js";
import {
  PostProjectSchema,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { project as fixture } from "./post-project-fixtures";

function project(extra: Partial<PostProject> = {}): PostProject {
  return PostProjectSchema.parse({ ...fixture([]), ...extra });
}

describe("post sequence actions", () => {
  it("drops a press that undoes the one before it", () => {
    expect(withSequenceAction(["mirror"], "mirror")).toEqual([]);
    expect(withSequenceAction(["swap", "flip"], "flip")).toEqual(["swap"]);
    expect(withSequenceAction(["rotate-right"], "rotate-left")).toEqual([]);
    expect(withSequenceAction(["mirror"], "swap")).toEqual(["mirror", "swap"]);
  });

  it("cancels four quarter turns the same way", () => {
    let actions = withSequenceAction([], "rotate-right");
    actions = withSequenceAction(actions, "rotate-right");
    actions = withSequenceAction(actions, "rotate-right");
    expect(actions).toHaveLength(3);
    expect(withSequenceAction(["swap", ...actions], "rotate-right")).toEqual([
      "swap",
    ]);
  });

  it("stamps each press as an edit and removes the list when it empties", () => {
    const mirrored = pressSequenceAction(project(), "mirror", { now: 5 });
    expect(mirrored.sequenceActions).toEqual(["mirror"]);
    expect(mirrored.updatedAt).toBe(5);
    const undone = pressSequenceAction(mirrored, "mirror", { now: 6 });
    expect("sequenceActions" in undone).toBe(false);
    const reset = resetSequenceActions(
      project({ sequenceActions: ["flip", "swap"] }),
      { now: 7 }
    );
    expect("sequenceActions" in reset).toBe(false);
    expect(reset.updatedAt).toBe(7);
  });

  it("saves and reloads the list, and refuses unknown actions", () => {
    const saved = project({ sequenceActions: ["mirror", "rotate-left"] });
    expect(PostProjectSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(
      saved
    );
    expect(() => project({ sequenceActions: ["invert"] as never })).toThrow();
  });

  it("applies the presses in order with the matching transforms", async () => {
    const seen: string[] = [];
    const step = (name: string) => async (sequence: SequenceData) => {
      seen.push(name);
      return { ...sequence, name: `${sequence.name}>${name}` };
    };
    const transforms: PostSequenceTransforms = {
      mirror: step("mirror"),
      flip: step("flip"),
      rotate: async (sequence, quarterTurns) => {
        seen.push(`rotate${quarterTurns}`);
        return { ...sequence, name: `${sequence.name}>r${quarterTurns}` };
      },
      swap: (sequence) => {
        seen.push("swap");
        return { ...sequence, name: `${sequence.name}>swap` };
      },
    };
    const source = { name: "s", steps: [] } as unknown as SequenceData;
    const result = await applySequenceActions(
      source,
      ["flip", "rotate-left", "swap", "rotate-right", "mirror"],
      transforms
    );
    expect(seen).toEqual(["flip", "rotate-1", "swap", "rotate1", "mirror"]);
    expect(result.name).toBe("s>flip>r-1>swap>r1>mirror");
    expect(await applySequenceActions(source, [], transforms)).toBe(source);
  });
});
