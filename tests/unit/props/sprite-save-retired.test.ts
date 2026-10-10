import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
}));

vi.mock("$app/env", () => ({ dev: true }));
vi.mock("node:fs", () => ({ ...fs, default: fs }));

import { POST } from "../../../src/routes/test/prop-3d-studio/sprites/save/+server";
import {
  RETIRED_MODEL_SPRITE_PROPS,
  isRetiredModelSprite,
} from "#lib/shared/pictograph/prop/domain/retired-model-sprites.js";
import { PROP_MODEL_SPRITES } from "#lib/shared/pictograph/prop/domain/prop-model-sprites.generated.js";

function capture(prop: string) {
  return {
    request: new Request("http://localhost/test/prop-3d-studio/sprites/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prop,
        color: "blue",
        width: 100,
        height: 20,
        fit: 1,
        dataUrl: "data:image/webp;base64,AAAA",
      }),
    }),
  } as never;
}

describe("retired Version 2 captures", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([...RETIRED_MODEL_SPRITE_PROPS])(
    "refuses a %s capture and writes nothing",
    async (prop) => {
      const response = await POST(capture(prop));
      expect(response.status).toBe(400);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    }
  );

  it("still saves a prop that has a Version 2", async () => {
    const response = await POST(capture("sword"));
    expect(response.status).toBe(200);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("matches the retired props regardless of case and none has a sprite", () => {
    expect(isRetiredModelSprite("STAFF_V2")).toBe(true);
    expect(isRetiredModelSprite("staff")).toBe(false);
    for (const prop of RETIRED_MODEL_SPRITE_PROPS) {
      expect(PROP_MODEL_SPRITES[prop]).toBeUndefined();
    }
  });
});
