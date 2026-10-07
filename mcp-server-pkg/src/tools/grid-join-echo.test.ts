import { beforeEach, describe, expect, it, vi } from "vitest";

// The preset store is a JSON file in the package's data folder; keep it in memory.
const { store, openedImages, rendered } = vi.hoisted(() => ({
  store: { presets: [] as any[] },
  openedImages: [] as string[],
  rendered: [] as any[],
}));

// The packaged card renderer needs glyph assets that only the package build
// copies in, so the preset run records what it was asked to draw instead.
vi.mock("../core/sequence-renderer.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../core/sequence-renderer.js")>();
  return {
    ...original,
    renderSequenceToImage: async (_steps: unknown, _word: string, options: any) => {
      rendered.push(options);
      return Buffer.alloc(1);
    },
  };
});

vi.mock("../core/user-presets/storage.js", () => ({
  loadUserPresets: () => ({ version: 1, presets: store.presets, lastModified: 0 }),
  saveUserPresets: () => {},
  getPresetsFilePath: () => "memory",
  addPreset: (preset: any) => void store.presets.push(preset),
  updatePreset: (id: string, updates: any) => {
    const index = store.presets.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const existing = store.presets[index];
    store.presets[index] = {
      ...existing,
      ...updates,
      config: updates.config
        ? { ...existing.config, ...updates.config }
        : existing.config,
    };
    return store.presets[index];
  },
  deletePreset: () => true,
  getPreset: (idOrName: string) =>
    store.presets.find(
      (p) => p.id === idOrName || p.name.toLowerCase() === idOrName.toLowerCase()
    ),
  listPresets: () => store.presets,
}));

// Never open a window from a test.
vi.mock("../shared/server-context.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../shared/server-context.js")>();
  return {
    ...original,
    saveAndOpenImage: (_png: Buffer, label: string) => {
      openedImages.push(label);
      return `memory://${label}`;
    },
  };
});

import {
  describeGridJoin,
  effectiveGridJoin,
  gridJoinField,
  gridJoinLine,
} from "../shared/grid-join-schema.js";
import { registerSequenceTools } from "./sequence-tools.js";
import { registerLoopTools } from "./loop-tools.js";
import { registerPictographTools } from "./pictograph-tools.js";
import { registerPresetTools } from "./preset-tools.js";
import { createPreset, updatePreset } from "../core/user-presets/index.js";

type Handler = (input: any) => Promise<{
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}>;

function register(...registrars: Array<(server: any) => void>) {
  const tools = new Map<string, { description: string; handler: Handler }>();
  const server = {
    tool: (
      name: string,
      description: string,
      _schema: unknown,
      handler: Handler
    ) => void tools.set(name, { description, handler }),
  };
  for (const registrar of registrars) registrar(server);
  return tools;
}

const tools = register(
  registerSequenceTools,
  registerLoopTools,
  registerPictographTools,
  registerPresetTools
);

function text(result: Awaited<ReturnType<Handler>>): string {
  return result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

describe("grid join wording", () => {
  it("reads like the app's Copy for Claude line", () => {
    expect(describeGridJoin({ toward: "e", steps: 2 })).toBe(
      "join: red's grid 2 points east of blue's (toward e, steps 2)"
    );
    expect(describeGridJoin({ toward: "se", steps: 1 }, "box")).toBe(
      "join: red's grid 1 point southeast of blue's (toward se, steps 1)"
    );
  });

  it("says nothing for one grid or a malformed join", () => {
    for (const none of [
      undefined,
      null,
      { toward: "up", steps: 1 },
      { toward: "e", steps: 3 },
    ]) {
      expect(describeGridJoin(none)).toBe("");
      expect(gridJoinLine(none)).toBe("");
      expect(gridJoinField(none)).toEqual({});
    }
  });

  it("reports the join as drawn when the grid turns it onto its hand points", () => {
    // A diagonal is off a diamond grid's hand-point lines; the renderers turn
    // it 45 degrees clockwise, so the echo must name the drawn direction.
    expect(effectiveGridJoin({ toward: "ne", steps: 1 }, "diamond")).toEqual({
      toward: "e",
      steps: 1,
    });
    expect(describeGridJoin({ toward: "ne", steps: 1 }, "diamond")).toContain(
      "toward e, steps 1; asked for ne"
    );
    expect(gridJoinField({ toward: "ne", steps: 1 }, "diamond")).toEqual({
      conjoined: { toward: "e", steps: 1 },
    });
  });
});

describe("tool descriptions", () => {
  it("say that omitting conjoined means one grid", () => {
    for (const name of [
      "get_sequence_data",
      "generate_sequence",
      "generate_loop_sequence",
      "generate_loop_image",
      "view_loop_sequence",
      "generate_pictograph",
      "view_pictograph",
      "generate_with_preset",
      "save_user_preset",
    ]) {
      expect(tools.get(name)?.description, name).toMatch(
        /omitting conjoined means one grid/
      );
    }
  });

  it("explains why the pictograph URL tool has no join", () => {
    expect(tools.get("generate_pictograph_url")?.description).toMatch(
      /no grid join/
    );
  });
});

describe("get_sequence_data", () => {
  const base = {
    word: "ABC",
    gridMode: "diamond",
    maxAttempts: 500,
    compact: false,
  };

  it("returns the join in the sequence data", async () => {
    const result = await tools.get("get_sequence_data")!.handler({
      ...base,
      conjoined: { toward: "e", steps: 2 },
    });
    const data = JSON.parse(text(result));
    expect(data.conjoined).toEqual({ toward: "e", steps: 2 });
    expect(data.steps.length).toBeGreaterThan(1);
  });

  it("names the join in compact output", async () => {
    const result = await tools.get("get_sequence_data")!.handler({
      ...base,
      compact: true,
      conjoined: { toward: "e", steps: 1 },
    });
    expect(text(result)).toContain("join: red's grid 1 point east of blue's");
  });

  it("leaves the field out for one grid", async () => {
    const result = await tools.get("get_sequence_data")!.handler(base);
    expect("conjoined" in JSON.parse(text(result))).toBe(false);
  });

  it("carries the join through a constrained build too", async () => {
    const result = await tools.get("get_sequence_data")!.handler({
      ...base,
      constraintPreset: "smooth",
      conjoined: { toward: "n", steps: 1 },
    });
    expect(JSON.parse(text(result)).conjoined).toEqual({
      toward: "n",
      steps: 1,
    });
  });
});

describe("generate_loop_sequence", () => {
  it("returns the join with the LOOP sequence", async () => {
    const handler = tools.get("generate_loop_sequence")!.handler;
    const input = {
      word: "AB",
      loopType: "rotated",
      period: "halved",
      gridMode: "diamond",
      maxAttempts: 500,
    };
    const joined = await handler({
      ...input,
      conjoined: { toward: "s", steps: 2 },
    });
    expect(joined.isError).toBeFalsy();
    expect(JSON.parse(text(joined)).conjoined).toEqual({
      toward: "s",
      steps: 2,
    });
    const plain = await handler(input);
    expect("conjoined" in JSON.parse(text(plain))).toBe(false);
  });
});

describe("view_pictograph", () => {
  it("names the join it drew", async () => {
    const result = await tools.get("view_pictograph")!.handler({
      letter: "A",
      variation: 0,
      conjoined: { toward: "e", steps: 1 },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("join: red's grid 1 point east of blue's");
  });

  it("stays quiet for one grid", async () => {
    const result = await tools
      .get("view_pictograph")!
      .handler({ letter: "A", variation: 0 });
    expect(text(result)).not.toContain("join:");
  });
});

describe("generate_pictograph", () => {
  it("names the join even when the text data is switched off", async () => {
    const result = await tools.get("generate_pictograph")!.handler({
      letter: "A",
      variation: 0,
      includeTextData: false,
      conjoined: { toward: "w", steps: 2 },
    });
    expect(text(result)).toBe(
      "join: red's grid 2 points west of blue's (toward w, steps 2)"
    );
  });

  it("adds the join to the motion text", async () => {
    const result = await tools.get("generate_pictograph")!.handler({
      letter: "A",
      variation: 0,
      includeTextData: true,
      conjoined: { toward: "w", steps: 2 },
    });
    expect(text(result)).toContain("**Right-hand motion:**");
    expect(text(result)).toContain("join: red's grid 2 points west of blue's");
  });
});

describe("presets remember a join", () => {
  beforeEach(() => {
    store.presets.length = 0;
    openedImages.length = 0;
    rendered.length = 0;
  });

  it("stores it, shows it in the summary and config, and rejects a bad one", async () => {
    const save = tools.get("save_user_preset")!.handler;
    const created = await save({
      name: "Side by side",
      conjoined: { toward: "e", steps: 2 },
    });
    expect(text(created)).toContain("joined grids (toward e, steps 2)");
    expect(store.presets[0].config.conjoined).toEqual({
      toward: "e",
      steps: 2,
    });

    const shown = await tools
      .get("get_user_preset")!
      .handler({ preset: "Side by side" });
    expect(text(shown)).toContain('"conjoined"');

    const bad = await save({
      name: "Bad",
      conjoined: { toward: "up", steps: 5 },
    });
    expect(bad.isError).toBe(true);
  });

  it("keeps the join on an unrelated update and removes it on null", () => {
    createPreset({ name: "P", conjoined: { toward: "n", steps: 1 } });
    expect(updatePreset("P", { level: 2 }).config.conjoined).toEqual({
      toward: "n",
      steps: 1,
    });
    expect(
      updatePreset("P", { conjoined: null }).config.conjoined
    ).toBeUndefined();
  });

  it("draws and reports the preset's join, unless the call overrides it", async () => {
    createPreset({ name: "Joined", conjoined: { toward: "e", steps: 1 } });
    const generate = tools.get("generate_with_preset")!.handler;
    const input = { preset: "Joined", word: "ABC", includeImage: false };

    expect(text(await generate(input))).toContain(
      "join: red's grid 1 point east of blue's"
    );
    expect(
      text(await generate({ ...input, conjoined: { toward: "s", steps: 2 } }))
    ).toContain("join: red's grid 2 points south of blue's");
    expect(text(await generate({ ...input, conjoined: null }))).not.toContain(
      "join:"
    );
    // The same three runs, as the renderer saw them.
    expect(rendered.map((options) => options.conjoined ?? null)).toEqual([
      { toward: "e", steps: 1 },
      { toward: "s", steps: 2 },
      null,
    ]);
  });
});
