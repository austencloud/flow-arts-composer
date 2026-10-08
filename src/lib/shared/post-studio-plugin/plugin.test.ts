import fs from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  POST_STUDIO_ROLE,
  stripModeFromRole,
  type PluginItemKinds,
  type PostItem,
  type PostItemKind,
} from "@austencloud/video-editor/core";
import {
  createPainterRegistry,
  textPainterFactory,
} from "@austencloud/video-editor/render";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  PostProjectSchema,
  TKA_COMPILE_HOOKS,
  TKA_COMPILE_OUTPUTS,
  TKA_ITEM_KINDS,
  TKA_NORMALIZE,
  compilePostProject,
  createEmptyPostProject,
  createTkaPainters,
  createTkaPlugin,
  normalizeProject,
  staffEffectRole,
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

  it("builds tka painters only for roles the compiled preset uses", () => {
    const file = "tests/fixtures/video-editor-parity/dck.project.json";
    const project = normalizeProject(
      PostProjectSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
    );
    const compiled = compilePostProject(project, {
      now: project.updatedAt,
      animationOverlay: false,
    });
    if (!compiled) throw new Error("dck fixture compiled to null");
    const sequence = { word: "", steps: [] } as unknown as SequenceData;
    const painters = createPainterRegistry([
      textPainterFactory,
      ...createTkaPainters({
        getSequence: () => sequence,
        showProgressBar: () => false,
        getTakes: () => [],
        staffTrack: () => null,
        getOverlayPainter: () => null,
      }),
    ]).paintersFor({ project, compiled });
    const roles = new Set(compiled.preset.clips.map((clip) => clip.sourceRole));
    for (const role of painters.keys()) expect(roles.has(role)).toBe(true);
    // The overlay stub has no painter and the compile leaves the overlay out.
    const staffRoles = project.tracks.flatMap((track) =>
      track.items.flatMap((item) =>
        item.kind === "video" && item.staffEffect
          ? [staffEffectRole(item.id)]
          : []
      )
    );
    const owned = [...roles].filter(
      (role) =>
        compiled.texts.some((text) => text.role === role) ||
        role === POST_STUDIO_ROLE.carousel ||
        stripModeFromRole(role) !== null ||
        compiled.titles.some((plan) => plan.role === role) ||
        staffRoles.includes(role)
    );
    expect(painters.size).toBe(owned.length);
  });
});
