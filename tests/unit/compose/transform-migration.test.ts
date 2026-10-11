import { describe, it, expect } from 'vitest';
import { migrateAppliedTransforms } from '#lib/features/compose/tabs/arrange/services/arrange-grid-serializer.js';

describe('migrateAppliedTransforms', () => {
  it('converts legacy appliedTransforms to transformStack', () => {
    const legacy = { appliedTransforms: ['rotate90', 'mirror'] };
    const result = migrateAppliedTransforms(legacy);
    expect(result.transformStack).toHaveLength(2);
    expect(result.transformStack[0]).toEqual({ type: 'rotate90', hand: 'both', timestamp: 0 });
    expect(result.transformStack[1]).toEqual({ type: 'mirror', hand: 'both', timestamp: 0 });
  });

  it('preserves existing transformStack', () => {
    const existing = { transformStack: [{ type: 'mirror', hand: 'left', timestamp: 123 }] };
    const result = migrateAppliedTransforms(existing);
    expect(result.transformStack).toEqual(existing.transformStack);
  });

  it('returns empty stack when neither field exists', () => {
    const result = migrateAppliedTransforms({});
    expect(result.transformStack).toEqual([]);
  });
});
