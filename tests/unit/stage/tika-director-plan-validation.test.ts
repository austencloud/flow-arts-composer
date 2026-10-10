import { describe, expect, it } from "vitest";
import {
  validateTikaDirectorPlan,
  validateTikaDirectorPlanTiming,
} from "#lib/features/stage/domain/tika-director-plan-validation.js";
import type {
  TikaDirectorConversationMessage,
  TikaDirectorResponse,
} from "#lib/features/stage/domain/tika-director.js";

function plan(durationBeats = 4): TikaDirectorResponse {
  return {
    kind: "apply",
    summary: "Applied props and transition.",
    actions: [
      { type: "assign-distinct-props" },
      { type: "formation-transition", endFormation: "circle", durationBeats },
    ],
  };
}

function validate(
  prompt: string,
  duration = 4,
  conversation: TikaDirectorConversationMessage[] = []
) {
  return validateTikaDirectorPlanTiming(
    { prompt, conversation },
    plan(duration)
  );
}

describe("TIKA plan timing admission", () => {
  it("rejects the observed invented playhead duration atomically", () => {
    const result = validate(
      "Give everyone different props and transition to a circle",
      8
    );
    expect(result.kind).toBe("clarify");
    expect(result).not.toHaveProperty("actions");
  });

  it.each([
    ["Transition to a circle over 4 beats", 4],
    ["Transition to a circle in four beats", 4],
    ["Move to a circle for sixty-four beats", 64],
    ["Move to a circle over twenty one beats", 21],
    ["Over four beats, transition to a circle", 4],
    [
      "Give everyone different props and transition to a circle over four beats",
      4,
    ],
  ])("admits grounded timing unchanged: %s", (prompt, duration) => {
    const response = plan(duration);
    expect(
      validateTikaDirectorPlanTiming({ prompt, conversation: [] }, response)
    ).toBe(response);
  });

  it.each([
    // The Stage timeline labels beats as counts.
    ["Transition to a circle over 8 counts", 8],
    ["Go to a V in 16 counts", 16],
    // A bare number after over/in is beats on a Stage; only a foreign unit is not.
    ["keep the props, keep the avatars, circle over 4", 4],
    // Verbless single-clause phrasings still pin their one duration to the move.
    ["from a row to a ring over 4 beats", 4],
    ["4 beats circle", 4],
    ["snap them into a circle over 1 beat", 1],
    ["form a chevron over 4 beats", 4],
    [
      "ok so put them in a line then have them go to a circle over 8 counts and also give everyone different props",
      8,
    ],
  ])(
    "admits counts, bare numbers, and verbless clauses: %s",
    (prompt, duration) => {
      const response = plan(duration);
      expect(
        validateTikaDirectorPlanTiming({ prompt, conversation: [] }, response)
      ).toBe(response);
    }
  );

  it.each([
    "move to a circle over 4 seconds",
    "transition to a circle over two bars",
    "transition to a circle over 4 measures",
    "circle over 4.5 beats",
  ])("still rejects foreign or fractional units: %s", (prompt) => {
    expect(validate(prompt, 4).kind).toBe("clarify");
  });

  it("keeps timing attached to the transition when a later clause preserves props", () => {
    const response: TikaDirectorResponse = {
      kind: "apply",
      summary: "Transitioned to a circle over four beats.",
      actions: [
        {
          type: "formation-transition",
          endFormation: "circle",
          durationBeats: 4,
        },
      ],
    };
    expect(
      validateTikaDirectorPlanTiming(
        {
          prompt:
            "Transition to a circle over four beats, do not change the props",
          conversation: [],
        },
        response
      )
    ).toBe(response);
  });

  it.each([
    "Transition to a circle",
    "Transition to a circle over four beats, not eight",
    "Give everyone different props for eight beats and transition to a circle",
    "Transition to a circle and give everyone different props for eight beats",
    "Earlier we moved to a line over eight beats. Now transition to a circle",
    "Move to a circle over eight beats then to a line over four beats",
    "Transition to a circle over 0 beats",
    "Transition to a circle over 65 beats",
    "Transition to a circle over 1.5 beats",
    "Transition to a circle over -8 beats",
  ])(
    "rejects missing, unrelated, ambiguous, or mismatched timing: %s",
    (prompt) => {
      expect(validate(prompt, 8).kind).toBe("clarify");
    }
  );

  it.each([
    "In eight beats, transition to a circle over four beats",
    "At beat12, transition to a circle over four beats",
    "At beat twelve, transition to a circle over four beats",
    "Wait eight beats then move to a circle over four beats",
    "After eight beats move to a circle over four beats",
  ])("rejects unrepresentable delayed starts: %s", (prompt) => {
    const result = validate(prompt);
    expect(result.kind).toBe("unsupported");
    expect(result).not.toHaveProperty("actions");
  });

  const clarification: TikaDirectorConversationMessage[] = [
    {
      role: "user",
      content: "Give everyone different props and transition to a circle",
    },
    {
      role: "assistant",
      content: "How many beats should the transition take?",
    },
  ];
  it.each(["4", "four", "four beats", "Over four beats."])(
    "accepts immediate duration answer: %s",
    (prompt) => {
      expect(validate(prompt, 4, clarification).kind).toBe("apply");
    }
  );

  it("does not borrow timing from a completed command in history", () => {
    expect(
      validate("Now move to a circle", 8, [
        { role: "user", content: "Move to a line over eight beats" },
        { role: "assistant", content: "Applied line over eight beats." },
      ]).kind
    ).toBe("clarify");
  });

  it("accepts a repeated duration after a direct clarification without looping", () => {
    expect(
      validate("four", 4, [
        {
          role: "user",
          content:
            "Transition to a circle over four beats, do not change the props",
        },
        {
          role: "assistant",
          content: "How many beats should the transition take?",
        },
      ]).kind
    ).toBe("apply");
  });

  it("requires an unresolved immediate clarification, not any historical question", () => {
    expect(
      validate("4", 4, [
        ...clarification,
        { role: "user", content: "Make every avatar different" },
        { role: "assistant", content: "Applied distinct avatars." },
      ]).kind
    ).toBe("clarify");
    expect(
      validate("4", 4, [
        { role: "user", content: "Transition to a circle over eight beats" },
        { role: "assistant", content: "Applied eight beats. Anything else?" },
      ]).kind
    ).toBe("clarify");
  });

  it("does not change clarification, unsupported, or appearance-only responses", () => {
    const responses: TikaDirectorResponse[] = [
      { kind: "clarify", question: "Which formation?" },
      { kind: "unsupported", message: "Cannot do that." },
      {
        kind: "apply",
        summary: "Applied props.",
        actions: [{ type: "assign-distinct-props" }],
      },
    ];
    for (const response of responses) {
      expect(
        validateTikaDirectorPlanTiming(
          { prompt: "Make every prop different", conversation: [] },
          response
        )
      ).toBe(response);
    }
  });
});

describe("TIKA arrange admission", () => {
  const scene = {
    id: "s",
    name: "S",
    bpm: 120,
    currentBeat: 8,
    performers: [{ id: "a", label: "A", characterId: "x-bot", prop: "staff" }],
    formations: [{ atBeat: 0, presetId: "line" }],
  };
  type Action = Extract<
    TikaDirectorResponse,
    { kind: "apply" }
  >["actions"][number];
  const arrange = (fields: Record<string, string>) =>
    ({ type: "arrange-formation", ...fields }) as Action;
  const transition: Action = {
    type: "formation-transition",
    endFormation: "circle",
    durationBeats: 4,
  };
  const applyPlan = (actions: Action[]): TikaDirectorResponse => ({
    kind: "apply",
    summary: "x",
    actions,
  });
  const check = (prompt: string, actions: Action[]) =>
    validateTikaDirectorPlan(
      { prompt, conversation: [], scene },
      applyPlan(actions)
    );

  it("rejects arranging and moving in one plan", () => {
    const result = check("circle then wider over 4 beats", [
      arrange({ shape: "circle" }),
      transition,
    ]);
    expect(result.kind).toBe("unsupported");
    expect(result).not.toHaveProperty("actions");
  });

  it("allows a shape followed by one spacing tweak", () => {
    const plan = applyPlan([
      arrange({ shape: "circle" }),
      arrange({ spacing: "wider" }),
    ]);
    expect(
      validateTikaDirectorPlan(
        { prompt: "a wider circle", conversation: [], scene },
        plan
      )
    ).toBe(plan);
  });

  it("allows a lone tweak and a lone shape", () => {
    for (const actions of [
      [arrange({ spacing: "tighter" })],
      [arrange({ shift: "left" })],
      [arrange({ shape: "line" })],
    ]) {
      const plan = applyPlan(actions);
      expect(
        validateTikaDirectorPlan(
          { prompt: "whatever", conversation: [], scene },
          plan
        )
      ).toBe(plan);
    }
  });

  it.each([
    [[arrange({ shape: "circle" }), arrange({ shape: "line" })]],
    [[arrange({ spacing: "wider" }), arrange({ shape: "circle" })]],
    [[arrange({})]],
    [[arrange({ shape: "circle", spacing: "wider" })]],
    [
      [
        arrange({ shape: "circle" }),
        arrange({ spacing: "wider" }),
        arrange({ shift: "left" }),
      ],
    ],
  ])("rejects malformed arrangement sets", (actions) => {
    const result = check("whatever", actions);
    expect(result.kind).toBe("unsupported");
    expect(result).not.toHaveProperty("actions");
  });

  it("asks when a count is present but the plan only arranges", () => {
    const result = check("circle over 8 counts", [
      arrange({ shape: "circle" }),
    ]);
    expect(result).toEqual({
      kind: "clarify",
      question: "Did you want them in a circle now, or a move over 8 counts?",
    });
  });

  it("offers the arrange path when a transition lacks a count", () => {
    expect(check("transition to a circle", [transition])).toEqual({
      kind: "clarify",
      question: "Arrange them in a circle now, or move over how many counts?",
    });
  });

  it("accepts a count answered after the arrange-or-move question", () => {
    const plan = applyPlan([{ ...transition, durationBeats: 8 }]);
    expect(
      validateTikaDirectorPlan(
        {
          prompt: "8",
          conversation: [
            { role: "user", content: "transition to a circle" },
            {
              role: "assistant",
              content:
                "Arrange them in a circle now, or move over how many counts?",
            },
          ],
          scene,
        },
        plan
      )
    ).toBe(plan);
  });
});
