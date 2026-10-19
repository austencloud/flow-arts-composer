import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { propTipOffsets, readFanWickTips } from '../../../unreal/FlowFest/Tools/prop-wick-geometry.mjs';
import { refreshPropWickAttachments } from '../../../unreal/FlowFest/Tools/refresh-prop-wick-attachments.mjs';

const fan = resolve(process.cwd(), 'static/models/props/fan.glb');
const source = process.cwd();

describe('native fan wick attachments', () => {
  it.each([
    ['fire', [[-24.08, 10.74], [-14.38, 22.48], [0, 27.27], [14.38, 22.48], [24.08, 10.74]]],
    ['lotus', [[-23.06, 10.75], [-16.56, 24.67], [0, 26.84], [16.56, 24.67], [23.06, 10.75]]],
  ] as const)('%s uses the five actual authored wick ends', (build, expected) => {
    const tips = readFanWickTips(fan, build);
    expect(tips).toHaveLength(5);
    for (let index = 0; index < tips.length; ++index) {
      expect(tips[index][0]).toBeCloseTo(expected[index][0], 1);
      expect(tips[index][1]).toBeCloseTo(expected[index][1], 1);
      expect(tips[index][2]).toBe(0);
    }
  });

  it('scales bigfan attachments with its imported mesh', () => {
    for (const build of ['fire', 'lotus'] as const) {
      const regular = readFanWickTips(fan, build);
      const large = readFanWickTips(fan, build, 1.4);
      for (let index = 0; index < regular.length; ++index) {
        expect(large[index][0]).toBeCloseTo(regular[index][0] * 1.4, 4);
        expect(large[index][1]).toBeCloseTo(regular[index][1] * 1.4, 4);
      }
    }
  });

  it.each([
    ['staff', 1, 45], ['simple_staff', 1, 45], ['staff_v2', 1, 45],
    ['bigstaff', 1.4, 63], ['fire_double_staff', 1, 45],
    ['stick', 1, 45], ['capsule_baton', 1, 43.18],
  ] as const)('%s ends stay on the imported staff geometry', (id, scale, end) => {
    const tips = propTipOffsets(id, {}, scale, source);
    expect(tips).toHaveLength(2);
    expect(tips[0][1]).toBeCloseTo(end, 4);
    expect(tips[1][1]).toBeCloseTo(-end, 4);
    expect(tips[0][0]).toBe(0);
    expect(tips[1][0]).toBe(0);
  });

  it.each(['fan', 'bigfan'] as const)('%s fire and lotus variants use their authored wick geometry', id => {
    const scale = id === 'bigfan' ? 1.4 : 1;
    for (const build of ['fire', 'lotus'] as const) {
      for (const cover of build === 'fire' ? ['bare', 'covered'] : ['bare']) {
        const tips = propTipOffsets(id, { fanBuild: build, fanCover: cover }, scale, source);
        expect(tips).toEqual(readFanWickTips(fan, build, scale));
      }
    }
  });

  it('refreshes only six fire fan attachments while preserving staff and imported mesh metadata', () => {
    const makeFan = (id: string, scale: number) => ({
      id, scale, authoredLengthCm: 90 * scale,
      variants: ['fire_black_bare', 'fire_black_covered', 'lotus_black_bare', 'day_black_bare'].map(variantId => {
        const key = `${id}_${variantId}`;
        return { id: variantId, fanBuild: variantId.split('_')[0],
          mesh: `/Game/FlowFest/Props/${key}.${key}`,
          rightMesh: `/Game/FlowFest/Props/${key}_right.${key}_right`,
          bounds: { minCm: [-35 * scale, -10 * scale, -2], maxCm: [35 * scale, 40 * scale, 2] },
          rightBounds: { minCm: [-35 * scale, -10 * scale, -2], maxCm: [35 * scale, 40 * scale, 2] },
          effectAttachments: Array.from({ length: 5 }, () =>
            ({ type: variantId.startsWith('day') ? 'none' : 'fire', offsetCm: [0, 50 * scale, 0] })),
        };
      }),
    });
    const catalog = { schema: 1, props: [
      { id: 'fire_double_staff', variants: [{ effectAttachments: [
        { type: 'fire', offsetCm: [0, 45, 0] }, { type: 'fire', offsetCm: [0, -45, 0] },
      ] }] },
      makeFan('fan', 1), makeFan('bigfan', 1.4),
    ] };
    const original = structuredClone(catalog);
    const updated = refreshPropWickAttachments(catalog, fan);
    expect(catalog).toEqual(original);
    expect(updated.props[0]).toEqual(original.props[0]);
    for (const prop of updated.props.slice(1)) {
      const before = original.props.find(item => item.id === prop.id)!;
      for (const variant of prop.variants) {
        const old = before.variants.find(item => item.id === variant.id)!;
        expect(variant.mesh).toBe(old.mesh);
        expect(variant.rightMesh).toBe(old.rightMesh);
        expect(variant.bounds).toEqual(old.bounds);
        expect(variant.rightBounds).toEqual(old.rightBounds);
        expect(variant.effectAttachments).toEqual(
          variant.fanBuild === 'day' ? old.effectAttachments :
            readFanWickTips(fan, variant.fanBuild, prop.scale).map(offsetCm => ({ type: 'fire', offsetCm })),
        );
      }
    }
    const invalid = structuredClone(catalog);
    invalid.props[1].variants[0].mesh = '/Game/Wrong';
    expect(() => refreshPropWickAttachments(invalid, fan)).toThrow('Unexpected imported geometry');
  });
});
