import { describe, it, expect, vi } from "vitest";

vi.mock("$app/environment", () => ({ browser: false }));

import { hashSequenceForPreview } from "$lib/shared/share/services/preview-cache";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(partial: Partial<SequenceData> = {}): SequenceData {
  return {
    id: "s1",
    word: "AB",
    steps: [{ letter: "A" }, { letter: "B" }],
    ...partial,
  } as unknown as SequenceData;
}

describe("hashSequenceForPreview", () => {
  it("changes when the sequence is joined", () => {
    expect(hashSequenceForPreview(seq({ conjoined: { toward: "e", steps: 1 } }))).not.toBe(
      hashSequenceForPreview(seq())
    );
  });

  it("changes when the join changes", () => {
    const a = hashSequenceForPreview(seq({ conjoined: { toward: "e", steps: 1 } }));
    expect(hashSequenceForPreview(seq({ conjoined: { toward: "e", steps: 2 } }))).not.toBe(a);
    expect(hashSequenceForPreview(seq({ conjoined: { toward: "w", steps: 1 } }))).not.toBe(a);
  });

  it("is stable for the same join and unchanged for one grid", () => {
    const join = { toward: "n", steps: 2 } as const;
    expect(hashSequenceForPreview(seq({ conjoined: join }))).toBe(
      hashSequenceForPreview(seq({ conjoined: { ...join } }))
    );
    expect(hashSequenceForPreview(seq({ conjoined: undefined }))).toBe(
      hashSequenceForPreview(seq())
    );
  });

  it("treats a malformed stored join as one grid", () => {
    expect(
      hashSequenceForPreview(seq({ conjoined: { toward: "up", steps: 7 } as never }))
    ).toBe(hashSequenceForPreview(seq()));
  });
});
