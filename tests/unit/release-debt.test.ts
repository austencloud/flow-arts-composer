import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import { summarizeReleaseDebt, debtVerdict } from "../../scripts/lib/release-debt.mjs";

// The report decides "is it time to release?". Miscounting in either
// direction is silent: chores inflating it, or plain-sentence subjects
// (most of this repo's history) vanishing from it.
const productionModules = { create: true, learn: false };

describe("summarizeReleaseDebt", () => {
  it("counts conventional fixes and plain-sentence app changes, not chores, tests or dark work", () => {
    const report = summarizeReleaseDebt({
      productionModules,
      daysSinceRelease: 3,
      commits: [
        { hash: "a", subject: "fix(create): undo keeps the last beat", files: [] },
        {
          hash: "b",
          subject: "The Grid lesson fills the screen",
          files: ["src/lib/shared/ui/Grid.svelte"],
        },
        { hash: "c", subject: "chore: bump deps", files: ["package.json"] },
        {
          hash: "d",
          subject: "Guard the share sheet",
          files: ["tests/unit/share.test.ts"],
        },
        {
          hash: "e",
          subject: "feat(learn): new lesson",
          files: ["src/lib/features/learn/x.ts"],
        },
      ],
    });
    expect(report.userFacing.map((c: { hash: string }) => c.hash)).toEqual([
      "a",
      "b",
    ]);
    expect(report.otherCount).toBe(3);
  });

  it("says when a release is worth cutting", () => {
    expect(debtVerdict(0, 9)).toMatch(/^Nothing user-facing/);
    expect(debtVerdict(3, 2)).toMatch(/can wait/);
    expect(debtVerdict(3, 20)).toMatch(/worth cutting/);
    expect(debtVerdict(23, 9)).toBe(
      "23 user-facing commits over 9 days: worth cutting a release."
    );
  });
});
