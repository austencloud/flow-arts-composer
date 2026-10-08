import { describe, expect, expectTypeOf, it } from "vitest";
import type { PostItem, PostItemKind } from "@austencloud/video-editor/core";
import {
  PostProjectSchema,
  createEmptyPostProject,
} from "$lib/shared/post-studio-plugin";

describe("tka plugin", () => {
  it("adds the tka item kinds to the core union", () => {
    expectTypeOf<"animation">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"moves">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"carousel">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"titles">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<Extract<PostItem, { kind: "animation" }>>().not.toBeNever();
  });

  it("parses an empty project back to itself, key order included", () => {
    const project = createEmptyPostProject({
      sequenceId: "seq",
      now: 1_700_000_000_000,
    });
    const parsed = PostProjectSchema.parse(project);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(project));
  });
});
