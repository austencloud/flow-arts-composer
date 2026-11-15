/**
 * The "spill" check for the layout sweep (scripts/layout/sweep.mjs): words
 * that run past the edge of the button or card holding them. The law page
 * calls this "Text stays inside its box".
 *
 * The sweep's "cut" check only sees text whose own box hides the overflow
 * (overflow hidden, an ellipsis, a line clamp). Text in a box that lets it
 * overflow is drawn on top of whatever sits next to it, and nothing reported
 * it: "Switch to Box mode" running past its button on Construct, and "Box"
 * running under the next card on Generate's Grid card.
 *
 * findSpills runs inside the page. The sweep installs it as a page global
 * from its source text, so it must stay self-contained: no imports and no
 * references to anything outside its own body.
 */

/**
 * For every shown element with its own words, measure those words with a
 * Range (so a centred label that pokes out of both sides counts) and compare
 * them with the nearest element, itself included, that draws a box: a
 * button, a link, [role=button], or anything with a visible border,
 * background or rounded corners. Returns one entry per element whose words
 * reach more than `tolerance` px past any side of that box.
 *
 * @param {Document} doc
 * @param {{ tolerance?: number }} [options]
 * @returns {{ el: Element, box: Element, text: string, over: { left: number, right: number, top: number, bottom: number } }[]}
 */
export function findSpills(doc, options = {}) {
  const tolerance = options.tolerance ?? 1;
  const win = doc.defaultView;
  const W = win.innerWidth;
  const H = win.innerHeight;
  const style = (el) => win.getComputedStyle(el);

  // Transparent: the keyword, a fourth comma value of 0 (rgba(0, 0, 0, 0)),
  // or a slash alpha of 0 (rgb(0 0 0 / 0)). rgb(255, 0, 0) is red, not clear.
  const visibleColor = (c) =>
    !!c &&
    c !== "transparent" &&
    !/^[a-z]+\((?:[^,)]*,){3}\s*0(\.0+)?%?\s*\)$/.test(c) &&
    !/\/\s*0(\.0+)?%?\s*\)$/.test(c);
  const px = (v) => parseFloat(v) || 0;
  const drawsBox = (el) => {
    if (el.matches("button, a[href], [role=button]")) return true;
    const cs = style(el);
    if (visibleColor(cs.backgroundColor)) return true;
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const s = cs[`border${side}Style`];
      if (
        px(cs[`border${side}Width`]) > 0 &&
        s &&
        s !== "none" &&
        s !== "hidden" &&
        visibleColor(cs[`border${side}Color`])
      )
        return true;
    }
    for (const corner of ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]) {
      if (px(cs[`border${corner}Radius`]) > 0) return true;
    }
    return false;
  };
  const clips = (v) => v === "hidden" || v === "clip";
  const scrolls = (v) => v === "auto" || v === "scroll";
  // Screen-reader-only boxes: a 1px box, or clipped to nothing.
  const srOnly = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return true;
    const cs = style(el);
    if (cs.clip && cs.clip !== "auto" && /rect\(0/.test(cs.clip)) return true;
    if (cs.clipPath && /inset\(50%/.test(cs.clipPath)) return true;
    return false;
  };
  const shown = (el) => {
    if (el.closest("svg, canvas, [inert], [aria-hidden='true']")) return false;
    if (srOnly(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.right <= 0 || r.top >= H || r.left >= W)
      return false;
    return el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      : true;
  };

  const found = [];
  for (const el of doc.body.querySelectorAll("*")) {
    const words = [...el.childNodes].filter(
      (n) => n.nodeType === 3 && n.textContent.trim()
    );
    if (!words.length || !shown(el)) continue;
    const own = style(el);
    // Text its own box hides is the "cut" check's business.
    if (
      clips(own.overflowX) ||
      clips(own.overflowY) ||
      own.textOverflow === "ellipsis" ||
      parseInt(own.webkitLineClamp) > 0
    )
      continue;

    // Nearest box, itself included. A scrolling area on the way means the
    // words are content in a scroller, which may run past any box by design.
    let box = null;
    let inScroller = false;
    for (let a = el; a && a !== doc.body; a = a.parentElement) {
      if (a !== el) {
        const cs = style(a);
        if (scrolls(cs.overflowX) || scrolls(cs.overflowY)) {
          inScroller = true;
          break;
        }
      }
      if (drawsBox(a)) {
        box = a;
        break;
      }
    }
    if (!box || inScroller || srOnly(box)) continue;

    const range = doc.createRange();
    range.setStartBefore(words[0]);
    range.setEndAfter(words[words.length - 1]);
    const t = range.getBoundingClientRect();
    if (!t || t.width < 1 || t.height < 1) continue;
    const b = box.getBoundingClientRect();
    const over = {
      left: Math.round((b.left - t.left) * 10) / 10,
      right: Math.round((t.right - b.right) * 10) / 10,
      top: Math.round((b.top - t.top) * 10) / 10,
      bottom: Math.round((t.bottom - b.bottom) * 10) / 10,
    };
    if (Object.values(over).some((v) => v > tolerance)) {
      found.push({
        el,
        box,
        text: range.toString().replace(/\s+/g, " ").trim(),
        over,
      });
    }
  }
  return found;
}
