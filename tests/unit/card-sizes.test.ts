import { describe, it, expect } from 'vitest';
import { CARD_SIZES, getPageLayout } from '#lib/features/choreo-card/domain/card-sizes.js';

describe('CARD_SIZES', () => {
  it('poker dimensions match existing MPC constants', () => {
    expect(CARD_SIZES.poker.canvasWidth).toBe(822);
    expect(CARD_SIZES.poker.canvasHeight).toBe(1122);
    expect(CARD_SIZES.poker.bleedPx).toBe(36);
    expect(CARD_SIZES.poker.contentWidth).toBe(750);
    expect(CARD_SIZES.poker.contentHeight).toBe(1050);
  });

  it('tarot dimensions are correct at 300 DPI', () => {
    expect(CARD_SIZES.tarot.canvasWidth).toBe(897);
    expect(CARD_SIZES.tarot.canvasHeight).toBe(1497);
    expect(CARD_SIZES.tarot.bleedPx).toBe(36);
    expect(CARD_SIZES.tarot.contentWidth).toBe(825);
    expect(CARD_SIZES.tarot.contentHeight).toBe(1425);
  });
});

describe('getPageLayout', () => {
  it('poker layout matches existing PrintPDFExporter (3x3=9)', () => {
    const layout = getPageLayout('poker');
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
    expect(layout.cardsPerPage).toBe(9);
    expect(layout.cardWidthPt).toBe(180);
    expect(layout.cardHeightPt).toBe(252);
  });

  it('tarot layout fits 3x2=6 on letter with paper cutter', () => {
    const layout = getPageLayout('tarot');
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.cardsPerPage).toBe(6);
    expect(layout.cardWidthPt).toBe(198);
    expect(layout.cardHeightPt).toBe(342);
  });

  it('margins are centered on letter page', () => {
    const poker = getPageLayout('poker');
    expect(poker.marginXPt).toBe(36);
    expect(poker.marginYPt).toBe(18);

    const tarot = getPageLayout('tarot');
    expect(tarot.marginXPt).toBe(9);
    expect(tarot.marginYPt).toBe(54);
  });

  it('poker fills a 13x19 Super B sheet 5x5=25', () => {
    const layout = getPageLayout('poker', 'superb');
    expect(layout.cols).toBe(5);
    expect(layout.rows).toBe(5);
    expect(layout.cardsPerPage).toBe(25);
    expect(layout.pageWidthPt).toBe(936);
    expect(layout.pageHeightPt).toBe(1368);
    expect(layout.marginXPt).toBe(18);
    expect(layout.marginYPt).toBe(54);
  });

  it('tarot on Super B stops at 4x3=12 so a printable margin survives', () => {
    const layout = getPageLayout('tarot', 'superb');
    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(3);
    expect(layout.cardsPerPage).toBe(12);
    // A 4th tarot row would be exactly 19" tall — zero vertical margin.
    expect(layout.marginYPt).toBeGreaterThan(0);
  });

  it('every layout keeps its grid inside the sheet with positive margins', () => {
    for (const paper of ['letter', 'superb'] as const) {
      for (const card of ['poker', 'tarot'] as const) {
        const l = getPageLayout(card, paper);
        expect(l.marginXPt).toBeGreaterThan(0);
        expect(l.marginYPt).toBeGreaterThan(0);
        expect(l.cols * l.cardWidthPt).toBeLessThanOrEqual(l.pageWidthPt);
        expect(l.rows * l.cardHeightPt).toBeLessThanOrEqual(l.pageHeightPt);
      }
    }
  });
});
