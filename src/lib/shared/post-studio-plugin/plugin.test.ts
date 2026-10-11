import fs from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ANIMATION_OVERLAY_ROLE,
  POST_BOX,
  POST_STUDIO_ROLE,
  stripModeFromRole,
  stripRole,
  type PluginItemKinds,
  type PostItem,
  type PostItemKind,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  createPainterRegistry,
  textPainterFactory,
  type PainterEnv,
  type PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StaffTipTrack } from "#lib/shared/media-composition/domain/staff-tip-track.js";
import {
  PostProjectSchema,
  TKA_COMPILE_HOOKS,
  TKA_COMPILE_OUTPUTS,
  TKA_ITEM_KINDS,
  TKA_NORMALIZE,
  compilePostProject,
  createEmptyPostProject,
  createTkaPlugin,
  normalizeProject,
  staffEffectRole,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  createTkaPainters,
  type TkaPainterDeps,
} from "#lib/shared/post-studio-plugin/painters.js";
import { createTkaSurfaces } from "#lib/shared/post-studio-plugin/surfaces.js";

const DCK_FILE = "tests/fixtures/video-editor-parity/dck.project.json";

describe("tka plugin", () => {
  it("adds the tka item kinds to the core union", () => {
    expectTypeOf<"animation">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"moves">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"carousel">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"titles">().toMatchTypeOf<PostItemKind>();
    expectTypeOf<"arrangement">().toMatchTypeOf<PostItemKind>();
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
      | "arrangement"
    >();
    expectTypeOf<keyof PluginItemKinds>().toEqualTypeOf<
      "animation" | "moves" | "carousel" | "titles" | "arrangement"
    >();
    expect(TKA_ITEM_KINDS.map((definition) => definition.kind)).toEqual([
      "animation",
      "moves",
      "carousel",
      "arrangement",
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

describe("tka surfaces", () => {
  it("gives every render its own surfaces for the sequence animation, the choreo card and arrangements", () => {
    const one = createTkaSurfaces();
    const two = createTkaSurfaces();
    expect(one.map((surface) => surface.renderMode).sort()).toEqual([
      "arrangement",
      "choreo-card",
      "sequence-animation",
    ]);
    for (const surface of one) expect(two).not.toContain(surface);
  });
});

describe("tka painter factories", () => {
  const sequence = { word: "", steps: [] } as unknown as SequenceData;
  const itemBase = {
    start: 0,
    duration: 5,
    box: { ...POST_BOX.full },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
  };

  /** The dck project with `item` on one more overlay track above its own. */
  function dckWith(item: PostItem): PostProject {
    const dck = normalizeProject(
      PostProjectSchema.parse(JSON.parse(fs.readFileSync(DCK_FILE, "utf8")))
    );
    return PostProjectSchema.parse({
      ...dck,
      tracks: [
        ...dck.tracks,
        { id: `track-${item.id}`, hidden: false, locked: false, items: [item] },
      ],
    });
  }

  function compileEnv(project: PostProject, animationOverlay = false) {
    const compiled = compilePostProject(project, {
      now: project.updatedAt,
      animationOverlay,
    });
    if (!compiled) throw new Error("project compiled to null");
    const env: PainterEnv = { project, compiled };
    const roles = new Set(compiled.preset.clips.map((clip) => clip.sourceRole));
    return { env, roles };
  }

  function factory(id: string, deps: Partial<TkaPainterDeps> = {}) {
    const found = createTkaPainters({
      getSequence: () => sequence,
      showProgressBar: () => false,
      getTakes: () => [],
      staffTrack: () => null,
      getOverlayPainter: () => null,
      ...deps,
    }).find((candidate) => candidate.id === id);
    if (!found) throw new Error(`no painter factory ${id}`);
    return found;
  }

  function expectPainter(painter: PostStudioLayerPainter | null) {
    expect(painter).not.toBeNull();
    expect(typeof painter?.prepare).toBe("function");
    expect(typeof painter?.paint).toBe("function");
  }

  it("lists the five factories in the order the registry asks them", () => {
    const ids = createTkaPainters({
      getSequence: () => sequence,
      showProgressBar: () => false,
      getTakes: () => [],
      staffTrack: () => null,
      getOverlayPainter: () => null,
    }).map((candidate) => candidate.id);
    expect(ids).toEqual([
      "tka-carousel",
      "tka-strips",
      "tka-overlay",
      "tka-titles",
      "tka-staff",
    ]);
  });

  it("tka-carousel paints the role a carousel item compiles to", () => {
    const { env, roles } = compileEnv(
      dckWith({ ...itemBase, id: "carousel-1", kind: "carousel" } as PostItem)
    );
    expect(roles.has(POST_STUDIO_ROLE.carousel)).toBe(true);
    expectPainter(
      factory("tka-carousel").create(POST_STUDIO_ROLE.carousel, env)
    );
  });

  it("tka-strips paints the role a moves item without its own look compiles to", () => {
    const role = stripRole("alternate");
    const { env, roles } = compileEnv(
      dckWith({
        ...itemBase,
        id: "moves-2",
        kind: "moves",
        mode: "alternate",
      } as PostItem)
    );
    expect(roles.has(role)).toBe(true);
    expect(stripModeFromRole(role)).toBe("alternate");
    expectPainter(factory("tka-strips").create(role, env));
  });

  it("tka-overlay hands back the overlay painter the editor has loaded", () => {
    const loaded: PostStudioLayerPainter = {
      prepare: async () => {},
      paint: () => {},
    };
    const { env, roles } = compileEnv(
      dckWith({
        ...itemBase,
        id: "animation-2",
        kind: "animation",
        overlay: true,
      } as PostItem),
      true
    );
    expect(roles.has(ANIMATION_OVERLAY_ROLE)).toBe(true);
    const painter = factory("tka-overlay", {
      getOverlayPainter: () => loaded,
    }).create(ANIMATION_OVERLAY_ROLE, env);
    expectPainter(painter);
    expect(painter).toBe(loaded);
  });

  it("tka-titles paints the role a titles item compiles to", () => {
    const { env, roles } = compileEnv(
      dckWith({ ...itemBase, id: "titles-1", kind: "titles" } as PostItem)
    );
    const plan = env.compiled.titles[0];
    if (!plan) throw new Error("the titles item left no plan");
    expect(roles.has(plan.role)).toBe(true);
    expectPainter(factory("tka-titles").create(plan.role, env));
  });

  it("tka-staff paints the role a video with a staff effect compiles to", () => {
    const dck = normalizeProject(
      PostProjectSchema.parse(JSON.parse(fs.readFileSync(DCK_FILE, "utf8")))
    );
    const project = PostProjectSchema.parse({
      ...dck,
      tracks: dck.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.id === "dck-main-1"
            ? { ...item, staffEffect: { effect: "sparkles" } }
            : item
        ),
      })),
    });
    const role = staffEffectRole("dck-main-1");
    const { env, roles } = compileEnv(project);
    expect(roles.has(role)).toBe(true);
    const track = { version: 1, staffs: [] } as unknown as StaffTipTrack;
    expectPainter(
      factory("tka-staff", {
        getTakes: () => project.takes,
        staffTrack: () => track,
      }).create(role, env)
    );
  });
});
