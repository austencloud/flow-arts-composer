<script lang="ts">
  /**
   * Level 1 guide cover - the locked design, as a reusable component.
   *
   * Hero title = Fraunces (wonky italic). "Level 1" = canonical baby-blue badge.
   * A combined emblem (Iso circle + Anti lens-rose + Dash +, overlaid) above an
   * arc trio of the same three forms (iso·dash·anti). Colors = the two prop
   * hands (blue/red), NOT motion type. Arc path. Deterministic MCP geometry, so
   * it reprints identically.
   *
   * `theme="navy"` - matte navy + gold foil, glowing line-art (digital / pro
   * print / foil edition). `theme="light"` - ivory + ink rule, dark line-art
   * (cheap home-printer edition, minimal ink).
   *
   * Mandala sizes scale to the container width, so the same component fills the
   * 540px cover-lab preview and a full 8.5×11 print page identically.
   */
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import type { MandalaPalette } from "#lib/shared/mandala/domain/mandala-types.js";
  import { guideEdit, ptDrag, pt, editText, registerEditSource } from "../_data/guide-edit.svelte";

  let { theme = "navy", level = "1" }: { theme?: "navy" | "light"; level?: "1" | "2" } = $props();

  let w = $state(0);
  const emblemSize = $derived(w ? Math.round(w * 0.44) : 0);
  const trioSize = $derived(w ? Math.round(w * 0.185) : 0);

  // ── Edit-mode offsets (pt) - every cover element is draggable/deletable ────
  const S = 816 / 612; // pt → px at native page width
  type Off = { x: number; y: number };
  const zero = (): Off => ({ x: 0, y: 0 });
  let OFF = $state({
    title: zero(),
    subtitle: zero(),
    level: zero(),
    emblem: zero(),
    forms: [zero(), zero(), zero()],
    byline: zero(),
  });
  const tf = (o: Off) => `transform: translate(${o.x * S}px, ${o.y * S}px)`;

  // Editable cover TEXT (separate from OFF positions). Title is html (two stacked
  // spans); subtitle + byline are plain runs. Edited via the editText action.
  let TX = $state({
    title: "<span>The Kinetic</span><span>Alphabet</span>",
    subtitle: "Notation for Flow Arts",
    byline: "Created by Austen Cloud",
  });

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Cover", () =>
      Object.entries({
        title: OFF.title,
        subtitle: OFF.subtitle,
        level: OFF.level,
        emblem: OFF.emblem,
        "form[0]": OFF.forms[0]!,
        "form[1]": OFF.forms[1]!,
        "form[2]": OFF.forms[2]!,
        byline: OFF.byline,
      })
        .map(([k, o]) => `  ${k}: dx: ${r1(o.x)}, dy: ${r1(o.y)}`)
        .join("\n")
    )
  );

  function mono(s: string, f: string): MandalaPalette {
    return { leftStroke: s, leftFill: f, rightStroke: s, rightFill: f, purpleStroke: s, purpleFill: f };
  }
  // Bright on navy, deep ink on ivory.
  const NAVY = { iso: mono("#6f8cff", "#6f8cff10"), dash: mono("#c0a3ff", "#c0a3ff10"), anti: mono("#ff7a7a", "#ff7a7a10") };
  const LIGHT = { iso: mono("#2342c9", "#2342c910"), dash: mono("#6d28d9", "#6d28d910"), anti: mono("#c01b1b", "#c01b1b10") };
  const pal = $derived(theme === "navy" ? NAVY : LIGHT);

  const m = (mt: string, rd: string, sl: string, el: string, so: string, eo: string) =>
    ({ motionType: mt, rotationDirection: rd, startLocation: sl, endLocation: el, startOrientation: so, endOrientation: eo });
  const step = (left, right) => ({ motions: { left, right } });
  const seq = (steps: any[]) => ({ leftPropType: "staff", rightPropType: "staff", steps });

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

  const FORMS = $derived([
    { seq: ISO, palette: pal.iso },
    { seq: DASH, palette: pal.dash },
    { seq: ANTI, palette: pal.anti },
  ]);
</script>

<svelte:head>
  <!-- Both faces are self-hosted. This cover renders inside a landing launchpad
       tile (LaunchpadTile -> BookCoverArt -> GuideCover), so the old
       fonts.googleapis.com pair opened two extra origins at 2.58s for every
       first-time visitor to the homepage. Fraunces was already self-hosted at
       the exact italic 700 face used below; Cormorant now is too. -->
  <link rel="stylesheet" href="/fonts/css/fraunces.css" />
  <link rel="stylesheet" href="/fonts/css/cormorant.css" />
</svelte:head>

<div class="cover {theme}" bind:clientWidth={w}>
  <div class="frame"></div>

  <header class="hero">
    <h1
      class="title drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "cover-title"}
      style={tf(OFF.title)}
      use:ptDrag={pt("cover-title", "Cover title", OFF.title)}
      use:editText={{ id: "cover-title", label: "Cover title", get: () => TX.title, set: (h) => (TX.title = h) }}
    >{@html TX.title}</h1>
    <p
      class="subtitle drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "cover-subtitle"}
      style={tf(OFF.subtitle)}
      use:ptDrag={pt("cover-subtitle", "Cover subtitle", OFF.subtitle)}
      use:editText={{ id: "cover-subtitle", label: "Cover subtitle", get: () => TX.subtitle, set: (v) => (TX.subtitle = v), plain: true }}
    >{TX.subtitle}</p>
    <div
      class="lvl drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "cover-level"}
      style={tf(OFF.level)}
      use:ptDrag={pt("cover-level", "Level badge", OFF.level)}
    >
      <span class="lvl-word">Level</span><span class="lvl-badge">{level}</span>
    </div>
  </header>

  <div
    class="emblem drag"
    class:edit={guideEdit.on}
    class:selected={guideEdit.selectedId === "cover-emblem"}
    style="--em:{emblemSize}px; {tf(OFF.emblem)}"
    use:ptDrag={pt("cover-emblem", "Emblem", OFF.emblem)}
  >
    {#each FORMS as f}
      <div class="layer">
        {#if emblemSize}<SequenceMandala sequence={f.seq} size={emblemSize} darkMode={false} palette={f.palette} leftPropType="staff" rightPropType="staff" pathShape="arc" strokeWidth={3} />{/if}
      </div>
    {/each}
  </div>

  <div class="forms">
    {#each FORMS as f, i (i)}
      <div class="form">
        <div
          class="drag"
          class:edit={guideEdit.on}
          class:selected={guideEdit.selectedId === `cover-form-${i}`}
          style={tf(OFF.forms[i] ?? { x: 0, y: 0 })}
          use:ptDrag={pt(`cover-form-${i}`, `Trio form ${i + 1}`, OFF.forms[i] ?? { x: 0, y: 0 })}
        >
          {#if trioSize}<SequenceMandala sequence={f.seq} size={trioSize} darkMode={false} palette={f.palette} leftPropType="staff" rightPropType="staff" pathShape="arc" strokeWidth={2.5} />{/if}
        </div>
      </div>
    {/each}
  </div>

  <footer
    class="byline drag"
    class:edit={guideEdit.on}
    class:selected={guideEdit.selectedId === "cover-byline"}
    style={tf(OFF.byline)}
    use:ptDrag={pt("cover-byline", "Byline", OFF.byline)}
    use:editText={{ id: "cover-byline", label: "Byline", get: () => TX.byline, set: (v) => (TX.byline = v), plain: true }}
  >{TX.byline}</footer>
</div>

<style>
  .cover {
    position: relative; height: 100%; width: 100%; box-sizing: border-box;
    container-type: inline-size;
    display: flex; flex-direction: column; align-items: center;
    /* Bottom padding trimmed (13%→9%) to reclaim the subtitle's height so the
       cover stays exactly 8.5×11 (Letter) instead of overflowing taller. */
    padding: 8% 8% 9%;
  }
  .cover.navy { background: radial-gradient(120% 120% at 50% 30%, #1d1d3a 0%, #14142b 70%, #0f0f22 100%); color: #f4f0e4; }
  .cover.light { background: #faf7ef; color: #1a1a1a; }

  /* Frame */
  .frame { position: absolute; inset: 3.3cqw; pointer-events: none; }
  .cover.navy .frame { border: 2.4px solid transparent; border-image: linear-gradient(135deg, #8a6a14 0%, #f6e3a1 25%, #c9a227 50%, #f9efc0 72%, #9a7b1f 100%) 1; }
  .cover.navy .frame::before { content: ""; position: absolute; inset: 5px; border: 1px solid #c9a22799; }
  .cover.light .frame { border: 1.4px solid #1f2937; }
  .cover.light .frame::before { content: ""; position: absolute; inset: 5px; border: 0.8px solid #1f2937; }

  /* Title - Fraunces wonky italic */
  .hero { text-align: center; }
  .title {
    font-family: "Fraunces", Georgia, serif; font-style: italic; font-weight: 700;
    font-variation-settings: "opsz" 144, "wght" 640, "SOFT" 0, "WONK" 1;
    line-height: 1.0; margin: 0; display: flex; flex-direction: column;
    font-size: clamp(32px, 12.5cqw, 88px);
  }
  /* Pure white on navy, pure black on ivory - max legibility (AAA). */
  .cover.navy .title { color: #ffffff; }
  .cover.light .title { color: #000000; }

  /* Subtitle under the title - gold foil on navy, deep gold ink on ivory. */
  .subtitle {
    margin: 2.4cqw 0 0; text-align: center;
    font-family: "Cormorant Garamond", Georgia, serif; font-style: italic;
    font-size: clamp(16px, 4.6cqw, 34px); letter-spacing: 0.02em;
  }
  .cover.navy .subtitle { color: #e9d9a3; }   /* foil gold, ~12:1 on #14142b */
  .cover.light .subtitle { color: #8a6a14; }  /* deep gold ink on ivory */

  .lvl { margin-top: 3.5cqw; display: flex; align-items: center; justify-content: center; gap: 0.5em; }
  .lvl-word { font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-size: clamp(15px, 4cqw, 30px); opacity: 0.85; }
  .lvl-badge {
    width: 7.2cqw; height: 7.2cqw; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: radial-gradient(ellipse at top left, rgb(224,242,254) 0%, rgb(198,232,253) 30%, rgb(164,218,250) 70%, rgb(130,202,245) 100%);
    border: 1px solid #000; color: #000;
    font-family: Cambria, Georgia, serif; font-weight: 700; line-height: 1;
    font-size: calc(7.2cqw * 0.58);
  }

  .emblem { flex: 1 1 auto; min-height: 0; position: relative; width: var(--em); aspect-ratio: 1; display: grid; place-items: center; margin: 2.2% 0; }
  .layer { position: absolute; inset: 0; display: grid; place-items: center; }

  .forms { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; place-items: center; gap: 3cqw; align-items: center; margin-top: 1%; }
  .forms .form:nth-child(1) { transform: translateY(3cqw) rotate(-8deg); }
  .forms .form:nth-child(2) { transform: translateY(-2cqw); }
  .forms .form:nth-child(3) { transform: translateY(3cqw) rotate(8deg); }
  .form { display: grid; place-items: center; }

  /* Byline at full strength, theme-aware, ≥7:1 contrast on its ground (AAA). */
  .byline { position: absolute; bottom: 7.5cqw; left: 0; right: 0; text-align: center; margin: 0; font-style: italic; font-family: "Cormorant Garamond", Georgia, serif; font-size: clamp(13px, 2.8cqw, 18px); opacity: 1; }
  .cover.navy .byline { color: #ece9f6; }   /* ~14:1 on #14142b */
  .cover.light .byline { color: #2a2a2a; }   /* ~12:1 on #faf7ef */

  /* Edit-mode affordances (drag/select any cover element). */
  .drag.edit {
    outline: 1px dashed rgba(140, 150, 255, 0.55);
    cursor: move;
  }
  .drag.selected {
    outline: 1.5px solid #6f8cff;
    outline-offset: 1px;
  }
</style>
