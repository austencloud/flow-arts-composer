import { describe, expect, it } from "vitest";
import { Vector3, type BufferAttribute } from "three";
import { TrailRenderer3D } from "#lib/shared/3d/effects/trails/trail-renderer-3d.js";

/**
 * A trail's buffers are sized for the longest ribbon the config allows, but a
 * live trail usually occupies a small leading slice of them. three re-uploads
 * the entire backing array for any attribute dirtied without an update range,
 * so the ribbon has to declare the span it actually wrote.
 */
describe("TrailRenderer3D buffer uploads", () => {
  function feed(renderer: TrailRenderer3D, points: number): void {
    for (let index = 0; index < points; index++) {
      renderer.addPoint(new Vector3(index * 0.1, Math.sin(index) * 0.1, 0));
    }
    renderer.update(new Vector3(0, 0, 5));
  }

  it("uploads only the vertices the frame wrote", () => {
    const renderer = new TrailRenderer3D();
    feed(renderer, 6);

    const geometry = renderer.object3D.geometry;
    const position = geometry.attributes.position as BufferAttribute;
    const alpha = geometry.attributes.alpha as BufferAttribute;

    expect(position.updateRanges).toHaveLength(1);
    expect(alpha.updateRanges).toHaveLength(1);

    const positionRange = position.updateRanges[0]!;
    expect(positionRange.start).toBe(0);
    expect(positionRange.count).toBeGreaterThan(0);
    expect(positionRange.count).toBeLessThan(position.array.length);
    expect(alpha.updateRanges[0]!.count).toBe(positionRange.count / 3);

    // Two vertices per interpolated point, six indices per quad between them.
    const emittedVertices = positionRange.count / 3;
    expect(geometry.drawRange.count).toBe((emittedVertices / 2 - 1) * 6);
  });

  it("grows the uploaded span as the trail lengthens", () => {
    const short = new TrailRenderer3D();
    feed(short, 4);
    const shortSpan = (
      short.object3D.geometry.attributes.position as BufferAttribute
    ).updateRanges[0]!.count;

    const long = new TrailRenderer3D();
    feed(long, 40);
    const longSpan = (
      long.object3D.geometry.attributes.position as BufferAttribute
    ).updateRanges[0]!.count;

    expect(longSpan).toBeGreaterThan(shortSpan);
    expect(longSpan).toBeLessThan(
      (long.object3D.geometry.attributes.position as BufferAttribute).array
        .length
    );
  });

  it("leaves the buffers clean when there is nothing to draw", () => {
    const renderer = new TrailRenderer3D();
    renderer.update(new Vector3(0, 0, 5));

    const geometry = renderer.object3D.geometry;
    expect(geometry.drawRange.count).toBe(0);
    expect(
      (geometry.attributes.position as BufferAttribute).version
    ).toBe(0);
  });
});
