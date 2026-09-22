import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearLoopDisplayCache,
  resolveLoopDisplay,
} from "$lib/features/loop-labeler/services/loop-display-resolver";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";

const workerSource = readFileSync(
  resolve(process.cwd(), "src/lib/shared/render/workers/composition.worker.ts"),
  "utf8"
);

describe("composition worker LOOP display registration", () => {
  it("boots the canonical resolver before composing card headers", () => {
    expect(workerSource).toContain(
      'import("$lib/shared/composition-root/worker-loop-display-resolver")'
    );
    expect(workerSource).toContain("registerWorkerLoopDisplayResolver()");
  });

  it("keeps canonical displays distinct when variations reuse a sequence ID", () => {
    const sequence = (period: number) =>
      ({
        id: "shared-variation-id",
        thumbnails: [],
        steps: [{}, {}],
        loopSpec: {
          left: { rotated: { period } },
          right: { rotated: { period } },
        },
      }) as never;

    clearLoopDisplayCache();
    expect(resolveLoopDisplay(sequence(2)).rotationPeriod).toBe(Period.HALVED);

    expect(resolveLoopDisplay(sequence(4)).rotationPeriod).toBe(
      Period.QUARTERED
    );
  });
});
