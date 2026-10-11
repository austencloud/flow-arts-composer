// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  SHAPE_MATRIX_REVEAL,
  SHAPE_MATRIX_REVEAL_CHOSEN_CLASS,
  SHAPE_MATRIX_REVEAL_HOLD_MS,
  runShapeMatrixDetailReveal,
  runShapeMatrixGridReveal,
  type RevealAnimator,
} from "#lib/shared/shape-matrix/app/services/shape-matrix-reveal.js";

interface Call {
  element: Element;
  delay: number;
}

// The shared vitest setup stubs the global `document.createElement` with a
// canvas-friendly fake element (no querySelectorAll/closest/classList) so
// canvas-capture tests can run under jsdom. This suite needs real DOM nodes
// to drive selectors and class toggles, so it builds them from a separate
// HTML document whose native createElement was never touched.
const domDocument = document.implementation.createHTMLDocument("");

function gridHost(): HTMLElement {
  const host = domDocument.createElement("div");
  host.innerHTML = `
    <table>
      <thead><tr>
        <th class="corner"></th>
        <th class="colhead" id="c0"></th><th class="colhead" id="c1"></th>
      </tr></thead>
      <tbody>
        <tr><th class="rowhead" id="r0"></th>
          <td><button class="cell"></button></td>
          <td><button class="cell"></button></td></tr>
        <tr><th class="rowhead" id="r1"></th>
          <td><button class="cell"></button></td>
          <td><button class="cell sel" id="chosen"></button></td></tr>
      </tbody>
    </table>`;
  return host;
}

function fakeAnimator(reduced = false) {
  const calls: Call[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const animator: RevealAnimator = {
    animate: (element, _keyframes, options) => {
      calls.push({ element, delay: Number(options.delay ?? 0) });
    },
    reducedMotion: () => reduced,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  };
  return { animator, calls, timers };
}

describe("shape matrix surprise reveal", () => {
  it("explains the roll in order: rows, then columns, then crossings, then the chosen one", () => {
    expect(SHAPE_MATRIX_REVEAL.rows.at).toBeLessThan(
      SHAPE_MATRIX_REVEAL.columns.at
    );
    expect(SHAPE_MATRIX_REVEAL.columns.at).toBeLessThan(
      SHAPE_MATRIX_REVEAL.crossings.at
    );
    expect(SHAPE_MATRIX_REVEAL.crossings.at).toBeLessThan(
      SHAPE_MATRIX_REVEAL.chosen.at
    );
    expect(SHAPE_MATRIX_REVEAL.chosen.at).toBeLessThan(
      SHAPE_MATRIX_REVEAL.relationship.at
    );

    const host = gridHost();
    const { animator, calls, timers } = fakeAnimator();
    runShapeMatrixGridReveal(host, animator);

    const delayOf = (selector: string) =>
      calls
        .filter((call) => call.element.matches(selector))
        .map((call) => call.delay);
    // Row headers stagger from the rows beat; column headers from theirs.
    expect(delayOf("#r0")).toEqual([SHAPE_MATRIX_REVEAL.rows.at]);
    expect(delayOf("#r1")).toEqual([
      SHAPE_MATRIX_REVEAL.rows.at + SHAPE_MATRIX_REVEAL.rows.stagger,
    ]);
    expect(delayOf("#c0")).toEqual([SHAPE_MATRIX_REVEAL.columns.at]);
    // The interior appears as one surface: every cell on the same beat.
    const cellDelays = calls
      .filter(
        (call) =>
          call.element.classList.contains("cell") &&
          call.delay === SHAPE_MATRIX_REVEAL.crossings.at
      )
      .map((call) => call.element);
    expect(cellDelays).toHaveLength(4);
    // The chosen crossing pulses on its own later beat.
    expect(delayOf("#chosen")).toContain(SHAPE_MATRIX_REVEAL.chosen.at);
    expect(delayOf("#chosen")).toHaveLength(2);

    // Its row and column headers light with it, then settle back.
    const [highlight] = timers;
    expect(highlight?.ms).toBe(SHAPE_MATRIX_REVEAL.chosen.at);
    highlight?.fn();
    for (const id of ["#chosen", "#r1", "#c1"]) {
      expect(
        host.querySelector(id)?.classList.contains(
          SHAPE_MATRIX_REVEAL_CHOSEN_CLASS
        )
      ).toBe(true);
    }
    expect(
      host.querySelector("#r0")?.classList.contains(
        SHAPE_MATRIX_REVEAL_CHOSEN_CLASS
      )
    ).toBe(false);
    const release = timers[1];
    expect(release?.ms).toBe(SHAPE_MATRIX_REVEAL_HOLD_MS);
    release?.fn();
    expect(
      host.querySelector("#chosen")?.classList.contains(
        SHAPE_MATRIX_REVEAL_CHOSEN_CLASS
      )
    ).toBe(false);
  });

  it("lands the relationship chip and breathes the hero in after the grid", () => {
    const host = domDocument.createElement("div");
    host.innerHTML = `
      <button class="relationship-choice" aria-pressed="false"></button>
      <button class="relationship-choice" aria-pressed="true" id="chip"></button>
      <div class="hero-frame" id="hero"></div>`;
    const { animator, calls } = fakeAnimator();
    runShapeMatrixDetailReveal(host, {}, animator);
    expect(calls.map((call) => [call.element.id, call.delay])).toEqual([
      ["chip", SHAPE_MATRIX_REVEAL.relationship.at],
      ["hero", SHAPE_MATRIX_REVEAL.hero.at],
    ]);

    // A compact layout flies the tile to the hero itself.
    const compact = fakeAnimator();
    runShapeMatrixDetailReveal(host, { hero: false }, compact.animator);
    expect(compact.calls.map((call) => call.element.id)).toEqual(["chip"]);
  });

  it("shows the final state at once under reduced motion", () => {
    const host = gridHost();
    const { animator, calls, timers } = fakeAnimator(true);
    runShapeMatrixGridReveal(host, animator);
    runShapeMatrixDetailReveal(host, {}, animator);
    expect(calls).toEqual([]);
    expect(timers).toEqual([]);
  });

  it("uses the platform animator by default without throwing on a bare host", () => {
    const spy = vi.fn();
    const host = gridHost();
    for (const element of host.querySelectorAll("*")) {
      (element as HTMLElement & { animate: typeof spy }).animate = spy;
    }
    expect(() => runShapeMatrixGridReveal(host)).not.toThrow();
  });
});
