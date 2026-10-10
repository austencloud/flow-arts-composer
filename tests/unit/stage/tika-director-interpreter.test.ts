import { describe, expect, it } from "vitest";

import {
  interpretConversationLocally,
  interpretStageDirectionLocally,
} from "#lib/features/stage/domain/tika-director-interpreter.js";
import { TIKA_DIRECTOR_FORMATIONS } from "#lib/features/stage/domain/tika-director.js";

describe("TIKA Stage direction interpreter", () => {
  it.each([
    [
      "Give every performer in this scene a different prop",
      "assign-distinct-props",
    ],
    ["Give every performer a different prop", "assign-distinct-props"],
    [
      "Every character should be a different avatar",
      "assign-distinct-characters",
    ],
    ["Make every avatar different", "assign-distinct-characters"],
    ["Give every performer a different prop!", "assign-distinct-props"],
    ["Please give every performer a different prop", "assign-distinct-props"],
    ["give every performer a different prop please", "assign-distinct-props"],
  ])("recognizes the complete cast command: %s", (prompt, type) => {
    expect(interpretStageDirectionLocally(prompt)).toMatchObject({
      kind: "apply",
      actions: [{ type }],
    });
  });

  it.each([
    "Put them all in a V shape and have them transition to a circle over 4 beats",
    "Put them in a V shape, then transition to a circle over 4 beats",
    "Put them in a V shape and transition to a circle over 4 beats",
  ])("preserves the flagship formation command: %s", (prompt) => {
    expect(interpretStageDirectionLocally(prompt)).toMatchObject({
      kind: "apply",
      actions: [
        {
          type: "formation-transition",
          startFormation: "v-shape",
          endFormation: "circle",
          durationBeats: 4,
        },
      ],
    });
  });

  it.each([
    ["Make all the avatars female", "feminine"],
    ["Make every avatar female.", "feminine"],
    ["make all of the avatars women", "feminine"],
    ["Make every avatar male", "masculine"],
    ["Please make all the avatars men", "masculine"],
    ["Make all the avatars androgynous", "androgynous"],
    ["make every avatar nonbinary", "androgynous"],
  ])("reads a presentation request: %s", (prompt, presentation) => {
    expect(interpretStageDirectionLocally(prompt)).toMatchObject({
      kind: "apply",
      actions: [{ type: "assign-distinct-characters", presentation }],
    });
  });

  it.each([
    "Transition to a circle over 8 counts",
    "Go to a circle in 8 counts",
    "Move to a circle over 8 beats!",
    "Please transition to a circle over 8 beats.",
  ])("reads counts as beats and tolerates politeness: %s", (prompt) => {
    // The Stage timeline itself labels beats as counts, so the two words are
    // one unit to a person directing from it.
    expect(interpretStageDirectionLocally(prompt)).toMatchObject({
      kind: "apply",
      actions: [
        {
          type: "formation-transition",
          endFormation: "circle",
          durationBeats: 8,
        },
      ],
    });
  });

  const orderedPairs = TIKA_DIRECTOR_FORMATIONS.flatMap((start) =>
    TIKA_DIRECTOR_FORMATIONS.filter((end) => end !== start).map(
      (end) => [start, end] as const
    )
  );
  it.each(orderedPairs)(
    "preserves requested order from %s to %s",
    (start, end) => {
      expect(
        interpretStageDirectionLocally(
          `Transition from a ${start} to a ${end} over 4 beats`
        )
      ).toMatchObject({
        kind: "apply",
        actions: [
          {
            type: "formation-transition",
            startFormation: start,
            endFormation: end,
            durationBeats: 4,
          },
        ],
      });
    }
  );

  it.each(["2x2 grid", "2×2 grid", "two by two grid"])(
    "treats %s as one destination, not two formations",
    (alias) => {
      const result = interpretStageDirectionLocally(
        `Move to a ${alias} over 4 beats`
      );
      expect(result).toMatchObject({
        kind: "apply",
        actions: [
          {
            type: "formation-transition",
            endFormation: "grid-2x2",
            durationBeats: 4,
          },
        ],
      });
      if (result?.kind === "apply")
        expect(result.actions[0]).not.toHaveProperty("startFormation");
    }
  );

  it.each([
    "Do not give every performer a different prop",
    "Never give every performer a different prop",
    "Use different avatars but keep all props the same",
    "Give only Alice and Bob different props; leave everyone else alone",
    "Give every performer a different prop, but use only staffs",
    "Give everyone different props, then transition to a circle",
    "Give every performer a different prop and turn off the lights",
    "Use different props and different avatars, then move to a circle in 8 beats",
    "Move from a V to a circle over 4 beats, then to a line over 8 beats",
    "In 8 beats, move to a circle over 4 beats",
    "Only if there are eight performers, give everyone different props",
    "What would happen if I gave everyone different props?",
    "Give every performer a different prop?",
    "Make all of the avatars female and give them different props",
    "Make every avatar different and leave gender unconstrained",
    "Make the lighting feel haunted",
    "Move to a circle over 0 beats",
    "Move to a circle over 65 beats",
    "Move to a circle over 1.5 beats",
    "Move to a circle over -4 beats",
    "Move to a circle over 999999999999999999999999999999 beats",
    "Move to a circle or a line over 4 beats",
    "Move from a circle, not a V shape, to a line over 4 beats",
    "Move to a circle over 4 beats; do not change anything yet",
  ])("defers the entire request without mutation: %s", (prompt) => {
    expect(interpretStageDirectionLocally(prompt)).toBeNull();
  });

  it.each([
    ["Could you put them in a line", "line"],
    ["Could you put them in a line?", "line"],
    ["line", "line"],
    ["circle please", "circle"],
    ["Put them in a V", "v-shape"],
    ["make a circle", "circle"],
    ["arrange them in a line", "line"],
    ["move to a line", "line"],
    ["go to a circle", "circle"],
    ["Transition to a circle", "circle"],
    ["snap them into a circle right now", "circle"],
    ["circle formation", "circle"],
    ["form a ring", "circle"],
    ["hey tika, put them in a row", "line"],
    ["2x2 grid", "grid-2x2"],
  ])("arranges the cast now for a bare shape: %s", (prompt, shape) => {
    expect(
      interpretStageDirectionLocally(prompt, { currentBeat: 0 })
    ).toMatchObject({
      kind: "apply",
      summary: expect.stringMatching(/at count 0\. Say "over 8 counts"/),
      actions: [{ type: "arrange-formation", shape }],
    });
  });

  it.each([
    ["wider", { spacing: "wider" }],
    ["a bit wider", { spacing: "wider" }],
    ["tighter", { spacing: "tighter" }],
    ["closer together", { spacing: "tighter" }],
    ["spread them out", { spacing: "wider" }],
    ["make it tighter", { spacing: "tighter" }],
    ["shift them left", { shift: "left" }],
    ["move them forward", { shift: "forward" }],
    ["back", { shift: "back" }],
    ["everyone to the right", { shift: "right" }],
    ["nudge them toward the audience", { shift: "forward" }],
    ["upstage", { shift: "back" }],
  ])("tweaks the current set locally: %s", (prompt, fields) => {
    const result = interpretStageDirectionLocally(prompt, { currentBeat: 8 });
    expect(result).toMatchObject({
      kind: "apply",
      summary: expect.stringMatching(/at count 8\./),
      actions: [{ type: "arrange-formation", ...fields }],
    });
    if (result?.kind === "apply") {
      expect(Object.keys(result.actions[0]!)).toHaveLength(2);
    }
  });

  it.each([
    "more",
    "a wider circle",
    "put A in front",
    "wider on the left side",
    "circle over 8 counts then wider",
    "put them in a heart",
    "line in 4",
  ])(
    "defers relative, scoped, or counted arrangement to the model: %s",
    (prompt) => {
      const result = interpretStageDirectionLocally(prompt, { currentBeat: 0 });
      if (result?.kind === "apply") {
        expect(result.actions[0]!.type).not.toBe("arrange-formation");
      } else {
        expect(result).toBeNull();
      }
    }
  );

  it("keeps a counted shape a move, not an arrangement", () => {
    expect(
      interpretStageDirectionLocally("Move to a line over 8 counts", {
        currentBeat: 4,
      })
    ).toMatchObject({
      kind: "apply",
      summary: expect.stringMatching(/over 8 counts, starting at count 4/),
      actions: [
        {
          type: "formation-transition",
          endFormation: "line",
          durationBeats: 8,
        },
      ],
    });
  });
});

describe("TIKA conversation-aware local interpretation", () => {
  const beat = { currentBeat: 4 };
  const user = (content: string) => ({ role: "user" as const, content });
  const tika = (content: string) => ({ role: "assistant" as const, content });

  it("reads a complete command with no history exactly like the bare interpreter", () => {
    expect(
      interpretConversationLocally("put them in a line", [], beat)
    ).toEqual(interpretStageDirectionLocally("put them in a line", beat));
  });

  it("keeps reading locally while every earlier turn was local too", () => {
    const history = [
      user("put them in a line"),
      tika("Arranged the cast in a line at count 0."),
    ];
    expect(interpretConversationLocally("wider", history, beat)).toMatchObject({
      kind: "apply",
      actions: [{ type: "arrange-formation", spacing: "wider" }],
    });
  });

  it("defers to the model once any earlier turn needed the model", () => {
    const history = [
      user("never use fans"),
      tika("Understood. I will keep fans out of every assignment."),
    ];
    expect(
      interpretConversationLocally(
        "give every performer a different prop",
        history,
        beat
      )
    ).toBeNull();
  });

  it("defers to the model while a question is pending", () => {
    const history = [
      user("put them in a line"),
      tika("Arrange them in a line now, or move over how many counts?"),
    ];
    expect(interpretConversationLocally("wider", history, beat)).toBeNull();
  });

  it.each(["more", "again", "a bit more", "even more", "More!"])(
    "repeats the last tweak for: %s",
    (prompt) => {
      const history = [
        user("a bit wider"),
        tika("Spread the cast wider at count 0."),
      ];
      expect(interpretConversationLocally(prompt, history, beat)).toMatchObject(
        {
          kind: "apply",
          summary: "Spread the cast wider at count 4.",
          actions: [{ type: "arrange-formation", spacing: "wider" }],
        }
      );
    }
  );

  it("repeats a shift the same way", () => {
    const history = [
      user("shift them left"),
      tika("Shifted the cast left at count 0."),
    ];
    expect(interpretConversationLocally("more", history, beat)).toMatchObject({
      actions: [{ type: "arrange-formation", shift: "left" }],
    });
  });

  it("has nothing to repeat after a shape or with no history", () => {
    const history = [
      user("put them in a line"),
      tika("Arranged the cast in a line at count 0."),
    ];
    expect(interpretConversationLocally("more", history, beat)).toBeNull();
    expect(interpretConversationLocally("more", [], beat)).toBeNull();
  });
});
