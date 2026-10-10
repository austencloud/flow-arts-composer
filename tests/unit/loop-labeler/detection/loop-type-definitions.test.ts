import { describe, it, expect } from "vitest";
import {
  LOOP_TYPE_DEFINITIONS,
  ALL_DEFINITION_TARGETS,
} from "#lib/features/loop-labeler/domain/constants/loop-type-definitions.js";
import { TRANSFORMATION_PRIORITY } from "#lib/features/loop-labeler/domain/constants/transformation-priority.js";

describe("LOOP_TYPE_DEFINITIONS", () => {
  it("covers every entry in TRANSFORMATION_PRIORITY", () => {
    const prioritySet = new Set(TRANSFORMATION_PRIORITY);
    const missing = [...prioritySet].filter(t => !ALL_DEFINITION_TARGETS.has(t));
    expect(missing).toEqual([]);
  });

  it("contains no targets outside TRANSFORMATION_PRIORITY", () => {
    const prioritySet = new Set(TRANSFORMATION_PRIORITY);
    const orphaned = [...ALL_DEFINITION_TARGETS].filter(t => !prioritySet.has(t));
    expect(orphaned).toEqual([]);
  });

  it("has no duplicate targets across definitions", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const def of LOOP_TYPE_DEFINITIONS) {
      for (const t of def.targets) {
        if (seen.has(t)) duplicates.push(t);
        seen.add(t);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("has unique definition ids", () => {
    const ids = LOOP_TYPE_DEFINITIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has exactly 16 definitions", () => {
    expect(LOOP_TYPE_DEFINITIONS.length).toBe(16);
  });

  it("every definition has at least one target and one component", () => {
    for (const def of LOOP_TYPE_DEFINITIONS) {
      expect(def.targets.length).toBeGreaterThan(0);
      expect(def.components.length).toBeGreaterThan(0);
    }
  });
});
