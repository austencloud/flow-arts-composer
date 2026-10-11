import { describe, expect, it } from "vitest";
import {
  TIKA_CAPABILITIES,
  TikaDirectorActionSchema,
} from "#lib/features/stage/domain/tika-capabilities/index.js";
import { TikaDirectorResponseSchema } from "#lib/features/stage/domain/tika-director.js";
import { TIKA_EXECUTED_ACTION_TYPES } from "#lib/features/stage/services/tika-director-executor.js";

describe("TIKA capability registry contract", () => {
  it("lists every verb exactly once", () => {
    const types = TIKA_CAPABILITIES.map((capability) => capability.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toEqual(
      expect.arrayContaining([
        "assign-distinct-props",
        "assign-distinct-characters",
        "assign-distinct-sequences",
        "formation-transition",
        "arrange-formation",
      ])
    );
  });

  it.each(
    TIKA_CAPABILITIES.map(
      (capability) => [capability.type, capability] as const
    )
  )("%s is fully described, taught, and executable", (_type, capability) => {
    expect(capability.plannerLine.length).toBeGreaterThan(20);
    expect(capability.reviewerLine.length).toBeGreaterThan(20);
    expect(capability.examples.length).toBeGreaterThanOrEqual(2);
    for (const example of capability.examples) {
      const response = TikaDirectorResponseSchema.parse(example.response);
      if (response.kind === "apply") {
        for (const action of response.actions) {
          expect(TikaDirectorActionSchema.parse(action)).toEqual(action);
        }
        // A verb's own examples must exercise that verb at least once.
      }
    }
    expect(
      capability.examples.some(
        (example) =>
          example.response.kind === "apply" &&
          example.response.actions.some(
            (action) => action.type === capability.type
          )
      )
    ).toBe(true);
    expect(TIKA_EXECUTED_ACTION_TYPES.has(capability.type)).toBe(true);
  });

  it("builds the action union from exactly the registry's schemas", () => {
    for (const capability of TIKA_CAPABILITIES) {
      expect(TikaDirectorActionSchema.options).toContain(capability.schema);
    }
    expect(TikaDirectorActionSchema.options).toHaveLength(
      TIKA_CAPABILITIES.length
    );
  });
});
