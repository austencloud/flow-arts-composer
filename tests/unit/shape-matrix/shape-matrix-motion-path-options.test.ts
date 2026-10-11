import { afterEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const axis = [
  { key: "pro", style: "pro" },
  { key: "anti", style: "anti" },
  { key: "float", style: "float" },
];

async function loadHarness(loadEdges = vi.fn().mockResolvedValue([])) {
  vi.resetModules();
  const resolveArchetypes = vi.fn().mockResolvedValue([]);
  vi.doMock(
    "#lib/shared/animation-engine/domain/types/prop-tip-points.js",
    () => ({ getTipPoints: () => ({ points: [{ dx: 12, dy: 0 }] }) })
  );
  vi.doMock(
    "#lib/shared/animation-engine/domain/types/trail-point-types.js",
    () => ({
      getDefaultTrailPointConfig: () => ({ right: { type: "tip", index: 0 } }),
    })
  );
  vi.doMock(
    "#lib/shared/shape-matrix/services/rotation-style-archetypes.js",
    () => ({ resolveRotationStyleArchetypes: resolveArchetypes })
  );
  vi.doMock(
    "#lib/features/choreo-card/services/pictograph-letter-lookup.js",
    () => ({ loadDiamondEdges: loadEdges })
  );
  vi.doMock("#lib/shared/shape-matrix/services/flower-archetype.js", () => ({
    resolveFlowerArchetype: () => ({}),
  }));
  vi.doMock("#lib/shared/shape-matrix/domain/flower-signature.js", () => ({
    buildShapeMatrixAxis: () => axis,
    flowerKey: (flower: (typeof axis)[number]) => flower.key,
  }));
  vi.doMock(
    "#lib/features/lab/vtg-lab/services/build-flower-sequence.js",
    () => ({
      buildFlowerSequence: (
        archetype: unknown,
        flower: (typeof axis)[number]
      ) => ({
        steps: [
          {
            motions: {
              left: {
                motionType: flower.style,
                rotationDirection: "cw",
                startLocation: "n",
                endLocation: "e",
                turns: 1,
                startOrientation: "out",
                endOrientation: "out",
              },
            },
          },
        ],
      }),
    })
  );

  const { loadShapeMatrix } =
    await import("#lib/shared/shape-matrix/services/shape-matrix-flowers.js");
  return { loadShapeMatrix, resolveArchetypes };
}

afterEach(() => {
  vi.doUnmock("#lib/shared/animation-engine/domain/types/prop-tip-points.js");
  vi.doUnmock("#lib/shared/animation-engine/domain/types/trail-point-types.js");
  vi.doUnmock("#lib/shared/shape-matrix/services/rotation-style-archetypes.js");
  vi.doUnmock("#lib/features/choreo-card/services/pictograph-letter-lookup.js");
  vi.doUnmock("#lib/shared/shape-matrix/services/flower-archetype.js");
  vi.doUnmock("#lib/shared/shape-matrix/domain/flower-signature.js");
  vi.doUnmock("#lib/features/lab/vtg-lab/services/build-flower-sequence.js");
  vi.resetModules();
});

function pathFor(data: Awaited<ReturnType<typeof importMatrix>>, key: string) {
  return data.left.get(key)?.left[0]?.d;
}

async function importMatrix() {
  const { loadShapeMatrix } =
    await import("#lib/shared/shape-matrix/services/shape-matrix-flowers.js");
  return loadShapeMatrix(PropType.STAFF);
}

describe("Shape Matrix motion-path geometry", () => {
  it("isolates geometry options while sharing the flower source and default result", async () => {
    const { loadShapeMatrix, resolveArchetypes } = await loadHarness();
    const [defaultData, explicitArc, linear, hands] = await Promise.all([
      loadShapeMatrix(PropType.STAFF),
      loadShapeMatrix(PropType.STAFF, { pathShape: "arc", trace: "tips" }),
      loadShapeMatrix(PropType.STAFF, { pathShape: "linear", trace: "tips" }),
      loadShapeMatrix(PropType.STAFF, { pathShape: "arc", trace: "hands" }),
    ]);

    expect(defaultData).toBe(explicitArc);
    expect(linear).not.toBe(defaultData);
    expect(resolveArchetypes).toHaveBeenCalledTimes(1);
    expect(defaultData.geometryKey).toBe("arc:tips");
    expect(linear.geometryKey).toBe("linear:tips");
    expect(pathFor(defaultData, "pro")).not.toBe(pathFor(linear, "pro"));
    expect(pathFor(defaultData, "pro")).not.toBe(pathFor(hands, "pro"));
  });

  it("uses the guide's per-motion Hybrid rules and preserves its Float fallback", async () => {
    const { loadShapeMatrix } = await loadHarness();
    const [arc, concave, linear, hybridLinear, hybridConcave] =
      await Promise.all([
        loadShapeMatrix(PropType.STAFF, { pathShape: "arc" }),
        loadShapeMatrix(PropType.STAFF, { pathShape: "concave" }),
        loadShapeMatrix(PropType.STAFF, { pathShape: "linear" }),
        loadShapeMatrix(PropType.STAFF, {
          pathShape: "hybrid",
          hybridFallback: "linear",
        }),
        loadShapeMatrix(PropType.STAFF, {
          pathShape: "hybrid",
          hybridFallback: "concave",
        }),
      ]);

    expect(pathFor(hybridLinear, "pro")).toBe(pathFor(arc, "pro"));
    expect(pathFor(hybridLinear, "anti")).toBe(pathFor(concave, "anti"));
    expect(pathFor(hybridLinear, "float")).toBe(pathFor(linear, "float"));
    expect(pathFor(hybridConcave, "float")).toBe(pathFor(concave, "float"));
    expect(hybridLinear.geometryKey).toBe("hybrid:linear:tips");
    expect(hybridConcave.geometryKey).toBe("hybrid:concave:tips");
  });

  it("rebuilds a rejected load so a later retry can succeed", async () => {
    const loadEdges = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("temporary source failure"))
      .mockResolvedValue([]);
    const { loadShapeMatrix, resolveArchetypes } = await loadHarness(loadEdges);

    await expect(loadShapeMatrix(PropType.STAFF)).rejects.toThrow(
      "temporary source failure"
    );
    await expect(loadShapeMatrix(PropType.STAFF)).resolves.toMatchObject({
      geometryKey: "arc:tips",
    });

    expect(loadEdges).toHaveBeenCalledTimes(2);
    expect(resolveArchetypes).toHaveBeenCalledTimes(2);
  });
});
