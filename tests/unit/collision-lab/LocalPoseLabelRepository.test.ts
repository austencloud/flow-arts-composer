import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalPoseLabelRepository } from "#lib/features/lab/tabs/collision-lab/services/local-pose-label-repository.js";
import type {
  PoseLabel,
  PoseLabelsFile,
} from "#lib/features/lab/tabs/collision-lab/domain/types.js";

const STORAGE_KEY = "tka:collision-lab:diamond-in-out-labels";

function makeLabel(
  id: string,
  status: PoseLabel["status"],
  labeledAt: number
): PoseLabel {
  return {
    poseId: id,
    status,
    stanceVariantIndex: 0,
    armRouting: "auto",
    collisionSnapshot: null,
    labeledAt,
  };
}

describe("LocalPoseLabelRepository", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("save() writes to localStorage", () => {
    const repo = new LocalPoseLabelRepository();
    const labels = {
      "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000),
    };
    repo.save(labels);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as PoseLabelsFile;
    expect(parsed.labels["wall-Ni-Eo"]?.status).toBe("clear");
  });

  it("loadAll() returns empty map when nothing is stored and canonical loader returns null", async () => {
    const repo = new LocalPoseLabelRepository();
    repo.__setCanonicalLoader(async () => null);
    const labels = await repo.loadAll();
    expect(Object.keys(labels)).toHaveLength(0);
  });

  it("loadAll() returns labels previously saved via save()", async () => {
    const repo = new LocalPoseLabelRepository();
    repo.__setCanonicalLoader(async () => null);
    repo.save({ "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000) });

    const loaded = await repo.loadAll();
    expect(loaded["wall-Ni-Eo"]?.status).toBe("clear");
  });

  it("merge: localStorage wins when labeledAt is newer than canonical", async () => {
    const canonical: PoseLabelsFile = {
      version: 1,
      mode: "diamond-in-out",
      generatedAt: 0,
      labels: {
        "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "needs-adjustment", 500),
      },
    };
    const repo = new LocalPoseLabelRepository();
    repo.__setCanonicalLoader(async () => canonical);

    repo.save({ "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000) });

    const merged = await repo.loadAll();
    expect(merged["wall-Ni-Eo"]?.status).toBe("clear");
    expect(merged["wall-Ni-Eo"]?.labeledAt).toBe(1000);
  });

  it("merge: canonical wins when localStorage has an older labeledAt", async () => {
    const canonical: PoseLabelsFile = {
      version: 1,
      mode: "diamond-in-out",
      generatedAt: 0,
      labels: {
        "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "needs-adjustment", 2000),
      },
    };
    const repo = new LocalPoseLabelRepository();
    repo.__setCanonicalLoader(async () => canonical);

    repo.save({ "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000) });

    const merged = await repo.loadAll();
    expect(merged["wall-Ni-Eo"]?.status).toBe("needs-adjustment");
    expect(merged["wall-Ni-Eo"]?.labeledAt).toBe(2000);
  });

  it("serialize() produces valid PoseLabelsFile JSON", () => {
    const repo = new LocalPoseLabelRepository();
    const labels = { "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000) };
    const json = repo.serialize(labels);
    const parsed = JSON.parse(json) as PoseLabelsFile;
    expect(parsed.version).toBe(1);
    expect(parsed.mode).toBe("diamond-in-out");
    expect(parsed.labels["wall-Ni-Eo"]?.status).toBe("clear");
    expect(parsed.labels["wall-Ni-Eo"]?.labeledAt).toBe(1000);
  });

  it("exportJson() triggers the download lifecycle (createObjectURL + revokeObjectURL)", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    // Stub DOM mutation to avoid jsdom Node-type strictness.
    vi.spyOn(document.body, "appendChild").mockImplementation(
      ((node: Node) => node) as any
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      ((node: Node) => node) as any
    );

    const repo = new LocalPoseLabelRepository();
    repo.exportJson({ "wall-Ni-Eo": makeLabel("wall-Ni-Eo", "clear", 1000) });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
