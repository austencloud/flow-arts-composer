import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registerSequenceTools } from "../src/tools/sequence-tools.js";

// Gap 16 of docs/superpowers/specs/2026-10-22-center-point-beyond-level-3.md:
// levels above 3 are not defined yet. The engine's turn allocator throws for
// them; the tool schemas refuse them before a request gets that far.
function schemaOf(toolName: string): z.ZodObject<z.ZodRawShape> {
  const schemas = new Map<string, z.ZodRawShape>();
  registerSequenceTools({
    tool: (name: string, _description: string, schema: z.ZodRawShape) =>
      void schemas.set(name, schema),
  } as never);
  const shape = schemas.get(toolName);
  if (!shape) throw new Error(`${toolName} was not registered`);
  return z.object(shape);
}

describe("generate_sequence level", () => {
  const schema = schemaOf("generate_sequence");

  it("refuses level 4 and above instead of clamping", () => {
    for (const level of [4, 5, 6]) {
      expect(schema.safeParse({ level }).success, `level ${level}`).toBe(false);
    }
  });

  it("accepts levels 1 to 3", () => {
    for (const level of [1, 2, 3]) {
      const parsed = schema.safeParse({ level });
      expect(parsed.success, `level ${level}`).toBe(true);
      expect(parsed.data?.level).toBe(level);
    }
  });
});
