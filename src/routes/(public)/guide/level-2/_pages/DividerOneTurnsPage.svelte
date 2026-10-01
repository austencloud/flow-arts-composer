<script lang="ts">
  /**
   * "2.0 - 1-Turns" divider - body page 1 (manifest `divider-1-turns`),
   * rebuilding old p2. Structure is faithful (pictograph row · "2.0" ·
   * vertical rule · "1-Turns" · vertical rule · pictograph row); the art is a
   * facelift (flagged in the tracker): the original's hand-composited 4-fold
   * pictograph overlays are rendered with the real SequenceMandala engine -
   * the same forms family as the locked Level 1 cover - instead of decoding
   * each composite stroke-for-stroke.
   */
  import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";

  const S = 816 / 612; // pt → px

  const m = (mt: string, rd: string, sl: string, el: string, so: string, eo: string) =>
    ({ motionType: mt, rotationDirection: rd, startLocation: sl, endLocation: el, startOrientation: so, endOrientation: eo });
  const step = (left, right) => ({ motions: { left, right } });
  const seq = (steps: unknown[]) => ({ leftPropType: "staff", rightPropType: "staff", steps });

  // Four forms, echoing the cover family: isolation, antispin, dash, hybrid.
  const ISO = seq([
    step(m("pro", "cw", "n", "e", "in", "in"), m("pro", "cw", "s", "w", "in", "in")),
    step(m("pro", "cw", "e", "s", "in", "in"), m("pro", "cw", "w", "n", "in", "in")),
    step(m("pro", "cw", "s", "w", "in", "in"), m("pro", "cw", "n", "e", "in", "in")),
    step(m("pro", "cw", "w", "n", "in", "in"), m("pro", "cw", "e", "s", "in", "in")),
  ]);
  const ANTI = seq([
    step(m("anti", "ccw", "n", "e", "in", "out"), m("anti", "ccw", "s", "w", "in", "out")),
    step(m("anti", "ccw", "e", "s", "out", "in"), m("anti", "ccw", "w", "n", "out", "in")),
    step(m("anti", "ccw", "s", "w", "in", "out"), m("anti", "ccw", "n", "e", "in", "out")),
    step(m("anti", "ccw", "w", "n", "out", "in"), m("anti", "ccw", "e", "s", "out", "in")),
  ]);
  const DASH = seq([
    step(m("dash", "noRotation", "w", "e", "in", "out"), m("dash", "noRotation", "s", "n", "in", "out")),
    step(m("dash", "noRotation", "e", "w", "out", "in"), m("dash", "noRotation", "n", "s", "out", "in")),
  ]);
  const HYBRID = seq([
    step(m("pro", "cw", "n", "e", "in", "in"), m("anti", "ccw", "s", "w", "in", "out")),
    step(m("pro", "cw", "e", "s", "in", "in"), m("anti", "ccw", "w", "n", "out", "in")),
    step(m("pro", "cw", "s", "w", "in", "in"), m("anti", "ccw", "n", "e", "in", "out")),
    step(m("pro", "cw", "w", "n", "in", "in"), m("anti", "ccw", "e", "s", "out", "in")),
  ]);

  const FORMS = [ISO, ANTI, DASH, HYBRID];
  const CELL = 96; // pt
  const GAP = 26; // pt between cells
  const rowW = 4 * CELL + 3 * GAP;
  const rowX = (612 - rowW) / 2;
  const cellX = (i: number) => rowX + i * (CELL + GAP);
</script>

<div class="divider">
  <!-- Top pictograph row -->
  {#each FORMS as f, i (i)}
    <div class="cell" style="left:{cellX(i) * S}px; top:{64 * S}px; width:{CELL * S}px; height:{CELL * S}px">
      <SequenceMandala sequence={f} size={CELL * S} darkMode={false} leftPropType="staff" rightPropType="staff" pathShape="arc" strokeWidth={3} />
    </div>
  {/each}

  <div class="num" style="top:{232 * S}px">2.0</div>
  <div class="vrule" style="top:{330 * S}px; height:{115 * S}px"></div>
  <div class="guide-title word" style="top:{492 * S}px">{translate("guide_l2_print_one_turns")}</div>
  <div class="vrule" style="top:{545 * S}px; height:{70 * S}px"></div>

  <!-- Bottom pictograph row (reversed order, like the original's variety) -->
  {#each FORMS as f, i (i)}
    <div class="cell" style="left:{cellX(3 - i) * S}px; top:{632 * S}px; width:{CELL * S}px; height:{CELL * S}px">
      <SequenceMandala sequence={f} size={CELL * S} darkMode={false} leftPropType="staff" rightPropType="staff" pathShape="arc" strokeWidth={3} />
    </div>
  {/each}
</div>

<style>
  .divider {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .cell {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .num {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-weight: 700;
    font-size: 76px;
    line-height: 1;
    letter-spacing: 0.04em;
  }
  .vrule {
    position: absolute;
    left: 50%;
    width: 2.5px;
    transform: translateX(-50%);
    background: #141414;
  }
  /* "1-Turns" in the shared calligraphic face, centered as its own block. */
  .divider .word {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 64px;
    transform: translateY(-50%);
  }
</style>
