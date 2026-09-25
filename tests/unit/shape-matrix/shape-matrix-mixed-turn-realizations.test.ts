import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadShapeMatrix } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import { flowerKey } from "$lib/shared/shape-matrix/domain/flower-signature";
import { buildModeRealizationCandidates } from "$lib/shared/shape-matrix/services/build-mode-realizations";
import { MODE_ORDER } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// Real data: the checked-in base-word snapshot and the diamond dataframe,
// served from static/ exactly as the app fetches them.
const STATIC = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(STATIC, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

async function candidatesFor(leftKey: string, rightKey: string) {
  const data = await loadShapeMatrix(PropType.STAFF);
  const find = (key: string) => data.axis.find((f) => flowerKey(f) === key);
  const left = find(leftKey);
  const right = find(rightKey);
  if (!left || !right) throw new Error(`Missing ${leftKey} or ${rightKey}`);
  const overlay = {
    left: data.left.get(leftKey)?.left ?? [],
    right: data.right.get(rightKey)?.right ?? [],
    tips: data.tips,
  };
  const counts: Record<string, number> = {};
  for (const mode of MODE_ORDER) {
    counts[mode] = (
      await buildModeRealizationCandidates({ left, right }, overlay, mode)
    ).length;
  }
  return counts;
}

describe("mixed whole-turn and quarter-turn cells", () => {
  it("builds every hand relationship for the 1:2 negative-quarter band", async () => {
    const counts = await candidatesFor(
      "pro--0.25-in-diamond",
      "anti--0.25-out-diamond"
    );
    for (const mode of MODE_ORDER) {
      expect(counts[mode], mode).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it("builds every hand relationship for a whole-turn hand against a quarter-turn hand", async () => {
    // The Level 4 configuration that could not pick anything: the pair
    // closes on the eight-step wheel, so the whole-turn hand traces its
    // four-step flower twice and the lap-aware loop comparison must accept it.
    const counts = await candidatesFor(
      "pro-2-in-diamond",
      "pro-0.25-out-diamond"
    );
    for (const mode of MODE_ORDER) {
      expect(counts[mode], mode).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it("builds every hand relationship for a half-turn hand against a quarter-turn hand", async () => {
    // Austen's 4:1 against 3:2 report: 1.5 turns beside 0.25 turns.
    const counts = await candidatesFor(
      "pro-1.5-in-diamond",
      "pro-0.25-out-diamond"
    );
    for (const mode of MODE_ORDER) {
      expect(counts[mode], mode).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  it("still builds the pure whole-turn and pure quarter-turn cells", async () => {
    const whole = await candidatesFor("pro-2-in-diamond", "pro-2-out-diamond");
    const quarter = await candidatesFor(
      "pro-0.25-in-diamond",
      "pro-0.25-out-diamond"
    );
    for (const mode of MODE_ORDER) {
      expect(whole[mode], mode).toBeGreaterThanOrEqual(1);
      expect(quarter[mode], mode).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
});
