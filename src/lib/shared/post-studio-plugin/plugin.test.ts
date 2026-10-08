import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  PluginItemKinds,
  PostItem,
  PostItemKind,
} from "@austencloud/video-editor/core";
import {
  PostProjectSchema,
  TKA_COMPILE_HOOKS,
  TKA_COMPILE_OUTPUTS,
  TKA_ITEM_KINDS,
  TKA_NORMALIZE,
  createEmptyPostProject,
  createTkaPlugin,
} from "$lib/shared/post-studio-plugin";

describe("tka plugin", () => {
  it("adds the tka item kinds to the core union", () => {
    expectTypeOf<"animation">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"moves">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"carousel">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"titles">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<Extract<PostItem, { kind: "animation" }>>().not.toBeNever();
    // The checks above also pass if a kind type decays to any; these name the exact unions.
    expectTypeOf<PostItemKind>().toEqualTypeOf<
      | "video"
      | "image"
      | "card"
      | "text"
      | "animation"
      | "moves"
      | "carousel"
      | "titles"
    >();
    expectTypeOf<keyof PluginItemKinds>().toEqualTypeOf<
      "animation" | "moves" | "carousel" | "titles"
    >();
    expect(TKA_ITEM_KINDS.map((definition) => definition.kind)).toEqual([
      "animation",
      "moves",
      "carousel",
      "titles",
    ]);
  });

  it("wires the tka hooks and each kind's compile into the plugin", () => {
    const plugin = createTkaPlugin();
    expect(plugin.normalize).toBe(TKA_NORMALIZE);
    expect(plugin.compileHooks).toBe(TKA_COMPILE_HOOKS);
    expect(plugin.compileOutputs).toBe(TKA_COMPILE_OUTPUTS);
    for (const definition of TKA_ITEM_KINDS) {
      expect(typeof definition.compile, definition.kind).toBe("function");
    }
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
