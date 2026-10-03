import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  PostProjectSchema,
  POST_BOX,
  type PostAnimationItem,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import {
  addTunnelHook,
  findTunnelHook,
  removeTunnelHook,
  setTunnelAppearance,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import {
  animationAppearanceForItem,
  tunnelHidesMandala,
} from "$lib/shared/share/components/post-studio/post-item-render-options";
import { toolRow } from "$lib/shared/share/components/post-studio/editor/post-editor-tools";
import { NOW, overlay, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };

function withTunnel(): PostProject {
  const base = project(
    [video("v1", { start: 0, duration: 10, pinnedStart: true })],
    [
      [
        overlay("anim", "animation", {
          start: 0,
          duration: 10,
          box: { ...POST_BOX.bottom },
          anchor: { itemId: "v1", offset: 0 },
          fill: true,
          animationAppearance: { mandala: true, tkaGlyph: true },
        } as Partial<PostAnimationItem>),
      ],
    ]
  );
  return addTunnelHook(base, ctx, { seconds: 5 })!.project;
}

describe("the opening tunnel's own look", () => {
  it("keeps only what the tunnel shows differently from its animation", () => {
    const set = setTunnelAppearance(
      withTunnel(),
      { mandala: false, tkaGlyph: true },
      ctx
    );
    expect(PostProjectSchema.safeParse(set).success).toBe(true);
    const hook = findTunnelHook(set)!;
    expect(hook.tunnelAppearance).toEqual({ mandala: false });
    expect(hook.animationAppearance).toEqual({ mandala: true, tkaGlyph: true });
  });

  it("follows the animation again once a flag is set back to the animation's", () => {
    const off = setTunnelAppearance(withTunnel(), { mandala: false }, ctx);
    const glyphOff = setTunnelAppearance(off, { tkaGlyph: false }, ctx);
    expect(findTunnelHook(glyphOff)!.tunnelAppearance).toEqual({
      mandala: false,
      tkaGlyph: false,
    });
    const back = setTunnelAppearance(glyphOff, { mandala: true }, ctx);
    expect(findTunnelHook(back)!.tunnelAppearance).toEqual({ tkaGlyph: false });
    const same = setTunnelAppearance(back, { tkaGlyph: true }, ctx);
    expect(findTunnelHook(same)).not.toHaveProperty("tunnelAppearance");
  });

  it("matches the animation throughout when cleared", () => {
    const off = setTunnelAppearance(withTunnel(), { mandala: false }, ctx);
    const cleared = setTunnelAppearance(off, null, ctx);
    expect(findTunnelHook(cleared)).not.toHaveProperty("tunnelAppearance");
  });

  it("goes with the tunnel when the tunnel is removed", () => {
    const off = setTunnelAppearance(withTunnel(), { mandala: false }, ctx);
    const removed = removeTunnelHook(off, ctx);
    const anim = removed.tracks
      .flatMap((track) => track.items)
      .find((item) => item.id === "anim")!;
    expect(anim).not.toHaveProperty("tunnelHook");
    expect(anim).not.toHaveProperty("tunnelAppearance");
  });
});

describe("the look the canvas draws", () => {
  function hookItem(project: PostProject): PostAnimationItem {
    return findTunnelHook(project)!;
  }

  it("reads the tunnel's own flags over the animation's while the intro plays", () => {
    const item = hookItem(
      setTunnelAppearance(withTunnel(), { mandala: false }, ctx)
    );
    expect(animationAppearanceForItem(item, true)).toEqual({
      mandala: false,
      tkaGlyph: true,
    });
    expect(animationAppearanceForItem(item, false)).toBe(
      item.animationAppearance
    );
  });

  it("gives the canvas the same object every frame, so nothing resets", () => {
    const item = hookItem(
      setTunnelAppearance(withTunnel(), { mandala: false }, ctx)
    );
    expect(animationAppearanceForItem(item, true)).toBe(
      animationAppearanceForItem(item, true)
    );
  });

  it("draws an animation without a tunnel look exactly as before", () => {
    const item = hookItem(withTunnel());
    expect(animationAppearanceForItem(item, true)).toBe(
      item.animationAppearance
    );
    expect(animationAppearanceForItem(item, false)).toBe(
      item.animationAppearance
    );
  });

  it("keeps an animation with no look of its own on its own canvas after the intro", () => {
    const { animationAppearance: _own, ...bare } = hookItem(withTunnel());
    const item: PostAnimationItem = { ...bare, tunnelAppearance: { mandala: false } };
    expect(animationAppearanceForItem(item, true)).toEqual({ mandala: false });
    expect(animationAppearanceForItem(item, false)).toEqual({});
    expect(animationAppearanceForItem(bare, false)).toBeNull();
  });

  it("fades the mandala in at the hand-off only when the tunnel hid it", () => {
    const base = hookItem(withTunnel());
    expect(tunnelHidesMandala(base)).toBe(false);
    expect(
      tunnelHidesMandala({ ...base, tunnelAppearance: { mandala: false } })
    ).toBe(true);
    expect(
      tunnelHidesMandala({
        ...base,
        animationAppearance: { mandala: false },
        tunnelAppearance: { tkaGlyph: false },
      })
    ).toBe(false);
  });
});

describe("the tunnel's tools", () => {
  it("are its look, its speed, its footage framing and removing it", () => {
    expect(
      toolRow({
        kind: "animation",
        hasLayout: false,
        isTunnel: true,
        isTunnelHook: true,
        hasBackdrop: true,
      })
    ).toEqual(["back", "appearance", "speed", "crop", "delete"]);
  });

  it("leave the animation's own row without the tunnel's speed or framing", () => {
    const row = toolRow({ kind: "animation", hasLayout: false });
    expect(row).not.toContain("speed");
    expect(row).not.toContain("crop");
  });
});

describe("selecting the tunnel in the editor", () => {
  beforeEach(() => localStorage.clear());

  function editorWithTunnel() {
    let clock = 1_000;
    const editor = createPostEditorState({
      getSequence: () =>
        ({
          id: "seq-tunnel",
          displayName: "DCK",
          steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
        }) as unknown as SequenceData,
      now: () => (clock += 1),
    });
    editor.edit(() => withTunnel());
    return editor;
  }

  it("holds the tunnel as the part in hand until another pick", () => {
    const editor = editorWithTunnel();
    editor.selectTunnel("anim");
    expect(editor.selectedItemId).toBe("anim");
    expect(editor.selectedPart).toBe("tunnel");
    editor.selectedItemId = "anim";
    expect(editor.selectedPart).toBeNull();
  });

  it("deletes only the tunnel, leaving the animation selected", () => {
    const editor = editorWithTunnel();
    editor.selectTunnel("anim");
    expect(editor.deleteSelected()).toBe(true);
    expect(findTunnelHook(editor.project)).toBeNull();
    expect(editor.selectedItemId).toBe("anim");
    expect(editor.selectedPart).toBeNull();
    editor.undo();
    expect(findTunnelHook(editor.project)?.id).toBe("anim");
  });
});
