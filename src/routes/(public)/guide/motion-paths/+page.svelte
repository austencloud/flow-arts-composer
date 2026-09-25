<script lang="ts">
  import { browser } from "$app/environment";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import MotionPathExplorer from "./_components/MotionPathExplorer.svelte";
  import MotionPathExplanation from "./_components/MotionPathExplanation.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
</script>

<GuideSeo
  title="Motion paths · The Kinetic Alphabet Guide"
  description="Compare Arc, Linear, Concave, and Hybrid motion paths. Watch how hand travel changes a sequence’s mandala, and learn where to preview, save, and reset paths."
  path="/guide/motion-paths"
  datePublished="2026-09-08"
  partOf={{ name: "The Kinetic Alphabet Guide", path: "/guide" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Motion paths", path: "/guide/motion-paths" },
  ]}
/>

<GuideShell>
  <article class="motion-path-guide guide-page-route">
    <header class="intro">
      <h1>Motion paths</h1>
      <p>Change the path. See what it draws.</p>
    </header>

    <MotionPathExplanation />

    <header class="explorer-intro">
      <h2>Try all four on a sequence</h2>
      <p>
        Switch the path while the sequence plays. Hybrid uses Arc for pro
        motions and Concave for anti motions. Any motion can take any path;
        Hybrid only sets the default.
      </p>
    </header>

    {#if browser}
      <MotionPathExplorer />
    {:else}
      <p role="status">The interactive comparison loads in your browser.</p>
    {/if}

    <details class="reference">
      <summary>Motion path reference</summary>
      <div class="reading">
        <section aria-labelledby="paths-heading">
          <h2 id="paths-heading">What changes?</h2>
          <p>
            A path sets how a hand travels between its positions. The sequence
            keeps its letters and turns.
          </p>
          <dl class="definitions">
            <div>
              <dt>Arc</dt>
              <dd>The hand follows the circle around the grid center.</dd>
            </div>
            <div>
              <dt>Linear</dt>
              <dd>The hand takes a straight line between the endpoints.</dd>
            </div>
            <div>
              <dt>Concave</dt>
              <dd>The hand curves inward between the endpoints.</dd>
            </div>
            <div>
              <dt>Hybrid</dt>
              <dd>Pro motions use Arc. Anti motions use Concave.</dd>
            </div>
          </dl>
          <p>
            Dashes stay straight. Static hands stay at their grid point, even
            when the prop rotates. Float uses the underlying fixed path when
            Hybrid is on.
          </p>
          <p>
            Pick a matrix cell, then compare Arc with Hybrid. When one hand is
            pro and the other anti, they follow different kinds of paths. Switch
            the trace between Hands and Prop tips to see what the prop’s
            rotation adds.
          </p>
        </section>

        <section aria-labelledby="scope-heading">
          <h2 id="scope-heading">Where the setting applies</h2>
          <p>
            In the sequence viewer, open Motion on desktop or Playback on a
            phone. You can also right-click the animation canvas and open Motion
            Paths. Choose Arc to turn Hybrid off.
          </p>
          <dl class="definitions">
            <div>
              <dt>Preview</dt>
              <dd>
                A path choice applies to the sequence you’re viewing. It also
                overrides any saved step exceptions while you compare.
              </dd>
            </div>
            <div>
              <dt>Restore saved paths</dt>
              <dd>
                Returns to the sequence’s saved choices, including its step
                exceptions.
              </dd>
            </div>
            <div>
              <dt>Save paths</dt>
              <dd>
                Keeps the preview on a sequence already saved in your library
                that you own.
              </dd>
            </div>
            <div>
              <dt>Make default</dt>
              <dd>
                Sets your starting choice for sequences without a saved path
                setting. Saved step exceptions still take precedence.
              </dd>
            </div>
          </dl>
          <p>
            In Composer, select a step to set a different path for either hand.
            The reset arrow clears that hand’s exception and returns it to the
            current default.
          </p>
          <p>
            Path lines are the drawn guides. You can hide them while keeping the
            same movement.
          </p>
        </section>

        <section aria-labelledby="third-order-heading">
          <h2 id="third-order-heading">The connection to third order</h2>
          <p>
            The hand’s path can be a motion of its own. In Third Order, a moving
            grid carries another sequence. The outer motion moves the grid; the
            inner sequence moves within it.
          </p>
          <p>
            Explore extension and antispin by starting with circular travel,
            then trying a flower as the carrier path. A flower can be built from
            two rotations before the prop adds its own rotation.
          </p>
          <p>
            The current Concave option bends an arc inward. It is not an exact
            four-petal antispin construction. Use the flower carrier in Third
            Order when you want to work with the constructed path and its spin
            ratio.
          </p>
          <div class="links">
            <PanelButton href="/toys/third-order">Open Third Order</PanelButton>
            <PanelButton href="/guide/ratios"
              >Spin ratios and petals</PanelButton
            >
          </div>
          <p>Third Order requires sign-in.</p>
        </section>

        <section aria-labelledby="awkward-heading">
          <h2 id="awkward-heading">
            When the drawing works but the motion doesn’t
          </h2>
          <p>
            A mandala shows the whole trace at once. It can hide a sharp change
            where two steps meet.
          </p>
          <p>
            Watch those joins in the animation, including the return to the
            first step. Compare Arc with Concave, then try a per-hand exception
            in Composer. Keep the path that suits the movement you want to
            perform.
          </p>
          <div class="links">
            <PanelButton href="/create">Open Composer</PanelButton>
          </div>
        </section>
      </div>
    </details>
  </article>
</GuideShell>

<style>
  .motion-path-guide {
    width: 100%;
    min-width: 0;
    max-width: 1480px;
    margin-inline: auto;
    padding: clamp(20px, 3vw, 56px);
    color: var(--theme-text);
  }
  .intro {
    margin-bottom: var(--spacing-lg, 24px);
  }
  .intro h1 {
    text-align: left;
    padding: 0 0 var(--spacing-md, 16px);
  }
  .intro p {
    max-width: none;
    font-size: clamp(16px, 1.3vw, 20px);
    color: var(--theme-text-muted);
  }
  .explorer-intro {
    margin-block: clamp(2rem, 5vw, 3.5rem) var(--spacing-lg, 24px);
  }
  .explorer-intro h2 {
    margin: 0 0 var(--spacing-xs, 4px);
    font-size: clamp(1.4rem, 2.2vw, 1.85rem);
    line-height: 1.15;
  }
  .explorer-intro p {
    margin: 0;
    max-width: none;
    font-size: 16px;
    line-height: 1.6;
    color: var(--theme-text-muted);
  }
  .reading {
    display: grid;
    gap: clamp(32px, 4vw, 64px);
    margin-top: var(--spacing-lg, 24px);
  }
  .reference {
    margin-top: var(--spacing-xl, 32px);
  }
  .reference summary {
    cursor: pointer;
    min-height: 44px;
    padding-block: var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted);
  }
  .reference summary:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
  }
  .reading section {
    min-width: 0;
  }
  .reading p,
  dd {
    font-size: 16px;
    line-height: 1.75;
  }
  .reading p {
    color: var(--theme-text-muted);
  }
  .definitions {
    margin-block: var(--spacing-lg, 24px);
  }
  .definitions > div {
    display: grid;
    grid-template-columns: minmax(100px, 0.35fr) minmax(0, 1fr);
    gap: var(--spacing-md, 16px);
    padding-block: var(--spacing-sm, 8px);
  }
  dt {
    font-weight: 650;
    font-size: 16px;
    line-height: 1.75;
  }
  dd {
    margin: 0;
    color: var(--theme-text-muted);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-md, 16px);
  }
  @media (min-width: 1600px) {
    .reading {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 1024px) {
    .motion-path-guide {
      padding-top: 24px;
    }
  }
  @media (max-width: 480px) {
    .definitions > div {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
