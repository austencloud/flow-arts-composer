import { describe, expect, it } from "vitest";

import {
  TikaDirectorRequestSchema,
  TikaDirectorResponseSchema,
} from "#lib/features/stage/domain/tika-director.js";
import { interpretStageDirectionLocally } from "#lib/features/stage/domain/tika-director-interpreter.js";

const scene = {
  id: "scene",
  name: "Scene",
  bpm: 120,
  currentBeat: 0,
  performers: [{ id: "a", label: "A", characterId: "x-bot", prop: "staff" }],
  formations: [],
};

describe("TIKA Director distinct sequences", () => {
  it("accepts an assign-distinct-sequences apply plan", () => {
    const parsed = TikaDirectorResponseSchema.parse({
      kind: "apply",
      summary: "Assign a different library sequence to every performer.",
      actions: [{ type: "assign-distinct-sequences" }],
    });
    expect(parsed).toMatchObject({
      kind: "apply",
      actions: [{ type: "assign-distinct-sequences" }],
    });
  });

  it("rejects a named sequence target on the action", () => {
    expect(
      TikaDirectorResponseSchema.safeParse({
        kind: "apply",
        summary: "Assign sequences.",
        actions: [{ type: "assign-distinct-sequences", sequenceId: "abc" }],
      }).success
    ).toBe(false);
  });

  it("carries the library size so the planner can refuse an empty library", () => {
    const parsed = TikaDirectorRequestSchema.parse({
      prompt: "give each one a different sequence",
      conversation: [],
      scene: { ...scene, librarySequenceCount: 12 },
    });
    expect(parsed.scene.librarySequenceCount).toBe(12);
    expect(
      TikaDirectorRequestSchema.safeParse({
        prompt: "x",
        conversation: [],
        scene: { ...scene, librarySequenceCount: -1 },
      }).success
    ).toBe(false);
    expect(
      TikaDirectorRequestSchema.safeParse({
        prompt: "x",
        conversation: [],
        scene,
      }).success
    ).toBe(true);
  });

  it.each([
    "Give every performer a different sequence",
    "Give each performer a different sequence from my library",
    "give each performer a distinct word.",
  ])("recognizes the complete cast command locally: %s", (prompt) => {
    expect(interpretStageDirectionLocally(prompt)).toMatchObject({
      kind: "apply",
      actions: [{ type: "assign-distinct-sequences" }],
    });
  });

  it.each([
    "Give performer A a different sequence",
    "Give every performer a different sequence except Jamie",
    "give each one a different sequence",
  ])(
    "leaves scoped or conversational sequence requests to the model: %s",
    (prompt) => {
      expect(interpretStageDirectionLocally(prompt)).toBeNull();
    }
  );
});
