// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSpills } from "../../../scripts/layout/spill.mjs";

// The sweep's spill check (scripts/layout/spill.mjs). A miss is silent: words
// run past a button and nobody is told. jsdom has no layout, so each fixture
// element states its box in data-rect="left,top,width,height" and the words'
// box in data-text="left,top,width,height".
type Rect = DOMRect;
const rect = (spec: string | undefined): Rect => {
  const [left, top, width, height] = (spec ?? "0,0,0,0").split(",").map(Number);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as Rect;
};

const realEl = Element.prototype.getBoundingClientRect;
const realRange = (Range.prototype as { getBoundingClientRect?: () => Rect })
  .getBoundingClientRect;

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rect((this as HTMLElement).dataset?.rect);
  };
  (
    Range.prototype as { getBoundingClientRect: () => Rect }
  ).getBoundingClientRect = function (this: Range) {
    const el = this.startContainer as HTMLElement;
    return rect(el.dataset?.text);
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = realEl;
  (
    Range.prototype as { getBoundingClientRect?: () => Rect }
  ).getBoundingClientRect = realRange;
  document.body.innerHTML = "";
});

const spills = (html: string) => {
  document.body.innerHTML = html;
  return findSpills(document).map((s) => ({
    text: s.text,
    box: s.box.className || s.box.tagName.toLowerCase(),
    over: s.over,
  }));
};

describe("layout sweep: spill", () => {
  it("catches a centred label poking out both sides of its button", () => {
    const found = spills(
      `<button class="toggle" data-rect="10,10,168,36" data-text="8.5,20,171,16">Switch to Box mode</button>`
    );
    expect(found).toEqual([
      {
        text: "Switch to Box mode",
        box: "toggle",
        over: { left: 1.5, right: 1.5, top: -10, bottom: -10 },
      },
    ]);
  });

  it("measures an inline child against the box around it", () => {
    const found = spills(
      `<div class="card" style="background-color: rgb(20, 20, 20)" data-rect="0,0,80,80">
         <span data-rect="10,60,90,16" data-text="10,60,90,16">Box</span>
       </div>`
    );
    expect(found.map((f) => [f.text, f.box])).toEqual([["Box", "card"]]);
  });

  it("allows 1px of rounding", () => {
    expect(
      spills(
        `<button data-rect="0,0,100,36" data-text="-1,10,102,16">Play</button>`
      )
    ).toEqual([]);
  });

  it("ignores an element without a box around it", () => {
    expect(
      spills(
        `<div data-rect="0,0,100,20"><span data-rect="0,0,300,20" data-text="0,0,300,20">A long heading</span></div>`
      )
    ).toEqual([]);
  });

  it("counts a border or rounded corners as a box, not a transparent background", () => {
    const found = spills(`
      <div class="bordered" style="border-top-width: 1px; border-top-style: solid; border-top-color: red" data-rect="0,0,50,20">
        <span data-rect="0,0,90,20" data-text="0,0,90,20">bordered</span>
      </div>
      <div class="pill" style="border-top-left-radius: 8px" data-rect="0,40,50,20">
        <span data-rect="0,40,90,20" data-text="0,40,90,20">pill</span>
      </div>
      <div class="clear" style="background-color: rgba(0, 0, 0, 0)" data-rect="0,80,50,20">
        <span data-rect="0,80,90,20" data-text="0,80,90,20">clear</span>
      </div>`);
    expect(found.map((f) => f.box)).toEqual(["bordered", "pill"]);
  });

  it("leaves hidden overflow to the cut check, and skips artwork, aria-hidden and screen-reader-only text", () => {
    expect(
      spills(`
        <button data-rect="0,0,50,36"><span style="overflow-x: hidden" data-rect="0,0,50,16" data-text="0,0,90,16">clipped</span></button>
        <button data-rect="0,40,50,36"><span style="text-overflow: ellipsis" data-rect="0,40,50,16" data-text="0,40,90,16">ellipsis</span></button>
        <button data-rect="0,80,50,36" aria-hidden="true"><span data-rect="0,80,90,16" data-text="0,80,90,16">hidden</span></button>
        <button data-rect="0,120,50,36"><span data-rect="0,120,1,1" data-text="0,120,90,16">sr only</span></button>
        <svg><text data-rect="0,160,90,16" data-text="0,160,90,16">art</text></svg>`)
    ).toEqual([]);
  });

  it("skips words inside a scrolling area on the way to the box", () => {
    expect(
      spills(
        `<div class="panel" style="background-color: red" data-rect="0,0,100,100">
           <div style="overflow-y: auto" data-rect="0,0,100,100">
             <p data-rect="0,300,100,20" data-text="0,300,100,20">far down the list</p>
           </div>
         </div>`
      )
    ).toEqual([]);
  });
});
