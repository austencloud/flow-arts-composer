import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);

type RawSequence = {
  word: string;
  steps: unknown[];
  [key: string]: unknown;
};

type BuiltSequence = {
  id: string;
  data: Record<string, unknown>;
};

const importer = require(
  path.join(projectRoot, "scripts/import-sequence.cjs")
) as {
  detectLoop(raw: RawSequence): unknown;
  buildFirestoreDoc(
    raw: RawSequence,
    fieldValue: { serverTimestamp(): Date },
    loopInfo: unknown,
    options?: { visibility?: string }
  ): BuiltSequence;
};
const composer = require(
  path.join(projectRoot, "scripts/lib/compose-sequence.cjs")
) as {
  decomposeSequence(sequence: RawSequence): {
    leftSoloProp: { steps: Array<{ motionType: string }> };
    rightSoloProp: { steps: Array<{ motionType: string }> };
    leftSoloHash: string;
    rightSoloHash: string;
  };
};
const publisher = require(
  path.join(projectRoot, "scripts/publish-sequence.cjs")
) as {
  parseCliArgs(argv: string[]): {
    help: boolean;
    sequenceId: string;
    ownerId: string;
    dryRun: boolean;
  };
  buildPublisherArguments(options: {
    sequenceId: string;
    ownerId: string;
    dryRun: boolean;
  }): string[];
};

function readProjectFile(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("legacy sequence script parity boundaries", () => {
  const cells = JSON.parse(
    readProjectFile("docs/research/spiroanim/eightstep-72-sequences.json")
  ) as RawSequence[];
  const raw = cells[0];
  const localClock = { serverTimestamp: () => new Date(0) };

  it("refuses script-side public imports", () => {
    expect(() =>
      importer.buildFirestoreDoc(raw, localClock, importer.detectLoop(raw), {
        visibility: "public",
      })
    ).toThrow(/owner, public projection, and hash claim commit together/);
  });

  it("runs private imports through the canonical persistence normalizer", async () => {
    const probe = String.raw`
      const { readFileSync } = require("node:fs");
      const importer = require("./scripts/import-sequence.cjs");
      const raw = JSON.parse(readFileSync(
        "./docs/research/spiroanim/eightstep-72-sequences.json",
        "utf8"
      ))[0];
      const clock = { serverTimestamp: () => new Date(0) };
      (async () => {
        const built = importer.buildFirestoreDoc(
          raw,
          clock,
          importer.detectLoop(raw),
          { visibility: "private" }
        );
        const normalized = await importer.normalizeFirestoreDoc(built);
        process.stdout.write(JSON.stringify({
          contentHash: normalized.contentHash,
          contentHashVersion: normalized.contentHashVersion,
          storedContentHash: normalized.data.contentHash,
          storedContentHashVersion: normalized.data.contentHashVersion,
          sequenceLength: normalized.data.sequenceLength,
          hydratedLength: normalized.hydrated.steps?.length,
          hasStoredSteps: "steps" in normalized.data,
        }));
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `;
    const normalized = JSON.parse(
      execFileSync(process.execPath, ["-e", probe], {
        cwd: projectRoot,
        encoding: "utf8",
      })
    ) as {
      contentHash: string;
      contentHashVersion: number;
      storedContentHash: string;
      storedContentHashVersion: number;
      sequenceLength: number;
      hydratedLength: number;
      hasStoredSteps: boolean;
    };

    expect(normalized.contentHashVersion).toBe(3);
    expect(normalized.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.storedContentHash).toBe(normalized.contentHash);
    expect(normalized.storedContentHashVersion).toBe(3);
    expect(normalized.sequenceLength).toBe(raw.steps.length);
    expect(normalized.hydratedLength).toBe(raw.steps.length);
    expect(normalized.hasStoredSteps).toBe(false);
  });

  it("decomposes current and legacy hand keys into the same solo props", () => {
    const current = composer.decomposeSequence(raw);
    const legacy = JSON.parse(JSON.stringify(raw)) as RawSequence & {
      startPlacement?: { motions?: Record<string, unknown> };
      steps: Array<{ motions?: Record<string, unknown> }>;
    };

    const remap = (motions?: Record<string, unknown>) => {
      if (!motions) return;
      motions.blue = motions.left;
      motions.red = motions.right;
      delete motions.left;
      delete motions.right;
    };
    remap(legacy.startPlacement?.motions);
    legacy.steps.forEach((step) => remap(step.motions));

    const fromLegacy = composer.decomposeSequence(legacy);

    expect(current.leftSoloProp.steps[0]?.motionType).not.toBe("static");
    expect(current.rightSoloProp.steps[0]?.motionType).not.toBe("static");
    expect(fromLegacy.leftSoloHash).toBe(current.leftSoloHash);
    expect(fromLegacy.rightSoloHash).toBe(current.rightSoloHash);
  });

  it("keeps imported attribution, display names, tags, and authored planes", () => {
    const qst = JSON.parse(
      readProjectFile("docs/research/spiroanim/qst-228-sequences.json")
    )[0] as RawSequence & {
      displayName: string;
      tags: string[];
      metadata: { source: string };
      steps: Array<{ motions: { left: { plane: string } } }>;
    };
    const built = importer.buildFirestoreDoc(qst, localClock, null, {
      visibility: "private",
    });
    const composed = composer.decomposeSequence(qst);

    expect(built.data.displayName).toBe(qst.displayName);
    expect(built.data.tags).toEqual(qst.tags);
    expect((built.data.metadata as { source: string }).source).toBe(
      "spiroanim-quarter-space-tech"
    );
    expect((composed.leftSoloProp.steps[0] as { plane?: string }).plane).toBe(
      qst.steps[0]?.motions.left.plane
    );
  });

  it("keeps owner-only repair scripts away from public sequences", () => {
    const loopBackfill = readProjectFile(
      "scripts/backfill-sequence-loop-type.cjs"
    );
    const startRepair = readProjectFile(
      "scripts/repair-broken-start-placements.cjs"
    );

    expect(loopBackfill).toContain('data.visibility === "public"');
    expect(startRepair).toContain('data.visibility === "public"');
  });

  it("keeps retired direct-public writers fail-closed", () => {
    const retiredSync = readProjectFile(
      "scripts/sync-missing-public-sequences.js"
    );
    const showSequence = readProjectFile("scripts/show-sequence.mjs");

    expect(retiredSync).not.toContain("firebase-admin");
    expect(retiredSync).toContain("publish-missing-public-mirrors.ts");
    expect(showSequence).toContain('visibility: "private"');
    expect(showSequence).not.toContain('visibility: "public"');
    expect(showSequence).not.toContain("await pubRef.set");
  });

  it("turns public promotion into one guarded command", () => {
    const options = publisher.parseCliArgs(["seq-123"]);
    const invocation = publisher.buildPublisherArguments(options);
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(options).toEqual({
      help: false,
      sequenceId: "seq-123",
      ownerId: "PBp3GSBO6igCKPwJyLZNmVEmamI3",
      dryRun: false,
    });
    expect(invocation).toContain("--promote");
    expect(invocation).toContain("--strict");
    expect(invocation).toContain("--apply");
    expect(invocation).toContain("PBp3GSBO6igCKPwJyLZNmVEmamI3:seq-123");
    expect(packageJson.scripts["sequence:publish"]).toBe(
      "node scripts/publish-sequence.cjs"
    );
  });

  it("keeps dry runs non-mutating and supports an explicit owner", () => {
    const options = publisher.parseCliArgs([
      "seq-456",
      "--owner",
      "future-owner",
      "--dry-run",
    ]);
    const invocation = publisher.buildPublisherArguments(options);

    expect(options.ownerId).toBe("future-owner");
    expect(invocation).toContain("future-owner:seq-456");
    expect(invocation).toContain("--promote");
    expect(invocation).not.toContain("--apply");
  });

  it("keeps promotion inside the public aggregate transaction", () => {
    const migration = readProjectFile(
      "scripts/migrations/publish-missing-public-mirrors.ts"
    );
    const transaction = migration.slice(
      migration.indexOf("await db.runTransaction"),
      migration.indexOf("const stamp =")
    );

    expect(transaction).toContain("retainedRevisionRef");
    expect(transaction).toContain("t.set(publicRef, projection)");
    expect(transaction).toContain(
      "t.set(retainedRevisionRef, retainedRevision)"
    );
    expect(transaction).toContain("t.set(claimRef");
    expect(transaction).toContain('visibility: "public"');
    expect(transaction).toContain("publicProjectionDigest");
  });
});
