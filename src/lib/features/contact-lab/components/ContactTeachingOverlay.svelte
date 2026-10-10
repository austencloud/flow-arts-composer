<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { getContactLabContext } from "../context/contact-lab-context";

  const labState = getContactLabContext();
  const leftRegions = $derived(
    [
      ...new Set(
        labState.frame.balls.slice(0, 2).map((ball) => ball.contact.region)
      ),
    ].join(" + ")
  );
  const rightRegions = $derived(
    [
      ...new Set(
        labState.frame.balls.slice(2).map((ball) => ball.contact.region)
      ),
    ].join(" + ")
  );
</script>

<div class="teaching-overlay" aria-live="polite">
  <header>
    <p class="kicker">Contact Lab · Truth Sprint 01</p>
    <h1>Two-ball palmspin</h1>
    <p class="subtitle">
      {labState.profile.sequenceWord} drives one slow palm circuit across
      {labState.profile.sourceStepCount} TKA steps.
    </p>
    <p class="contract">
      Eight palm positions. Slow movement. Open fingers. No clicks between
      spheres.
    </p>
    <LinkChip
      class="reference"
      href="https://www.homeofpoi.com/us/lessons/teach/Juggling/Contact-Ball-Juggling/2-Ball-Palmspin-1"
      >Practitioner reference</LinkChip
    >
  </header>

  <aside class="readout" aria-label="Current contact state">
    <div class="beat">
      <span class="label">TKA step</span>
      <strong>{labState.frame.sourceStepNumber}</strong>
      <span class="of">/ {labState.frame.sourceStepCount}</span>
    </div>
    <div class="waypoint">
      <span>Palm position</span>
      <strong>{labState.frame.palmWaypoint} / 8</strong>
    </div>
    <div class="contact-row blue">
      <span class="dot"></span>
      <span>Left pair</span>
      <strong>{leftRegions}</strong>
    </div>
    <div class="contact-row red">
      <span class="dot"></span>
      <span>Right pair</span>
      <strong>{rightRegions}</strong>
    </div>
    <p class="gate">External review pending</p>
  </aside>
</div>

<style>
  .teaching-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    padding: clamp(1rem, 2.2cqw, 2.5rem);
    pointer-events: none;
    color: var(--theme-text, #f8f9ff);
  }

  header {
    max-width: min(64rem, 62cqw);
    pointer-events: auto;
  }

  .kicker {
    margin: 0 0 0.5rem;
    color: #83adff;
    font-size: clamp(0.75rem, 0.55cqw, 1.35rem);
    font-weight: 760;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.8rem, 3.4cqw, 7rem);
    line-height: 0.98;
    letter-spacing: -0.045em;
  }

  .subtitle {
    margin: 0.75rem 0 0;
    color: rgba(230, 236, 250, 0.68);
    font-size: clamp(0.85rem, 1.15cqw, 1.6rem);
    line-height: 1.45;
  }

  .contract {
    max-width: 42rem;
    margin: 0.75rem 0 0;
    color: rgba(238, 241, 250, 0.84);
    font-size: clamp(0.78rem, 0.64cqw, 1.2rem);
    line-height: 1.45;
  }

  .teaching-overlay :global(.reference) {
    margin-top: 0.7rem;
  }

  .readout {
    width: clamp(13.5rem, 18cqw, 30rem);
    padding: clamp(0.85rem, 0.7cqw, 1.35rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1rem;
    background: rgba(8, 12, 23, 0.78);
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.28);
  }

  .beat {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: baseline;
    gap: 0.35rem;
    min-height: 2.8rem;
    padding: 0.2rem 0.35rem 0.7rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09);
    font-variant-numeric: tabular-nums;
  }

  .waypoint {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.35rem 0.35rem;
    color: rgba(229, 235, 248, 0.62);
    font-size: max(var(--font-size-compact, 12px), 0.78rem);
  }

  .waypoint strong {
    color: #f7f8ff;
    font-variant-numeric: tabular-nums;
  }

  .beat .label,
  .of {
    color: rgba(229, 235, 248, 0.55);
    font-size: max(var(--font-size-compact, 12px), 0.78rem);
  }

  .beat strong {
    min-width: 2ch;
    font-size: clamp(1.6rem, 1.2cqw, 2.6rem);
  }

  .contact-row {
    display: grid;
    grid-template-columns: 0.7rem 1fr auto;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.45rem;
    color: rgba(235, 239, 250, 0.72);
    font-size: clamp(0.78rem, 0.55cqw, 1.25rem);
  }

  .contact-row strong {
    min-width: 10ch;
    color: #f7f8ff;
    text-align: right;
    text-transform: capitalize;
  }

  .dot {
    width: 0.62rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0.8rem currentColor;
  }

  .blue {
    color: #70a6ff;
  }

  .red {
    color: #ff7182;
  }

  .gate {
    margin: 0.35rem 0 0;
    padding: 0.65rem 0.35rem 0.1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.09);
    color: #f1bf6c;
    font-size: max(var(--font-size-compact, 12px), 0.72rem);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  @container (max-width: 42rem) {
    .teaching-overlay {
      flex-direction: column;
      justify-content: flex-start;
      gap: 0.65rem;
    }

    .subtitle,
    .contract,
    .teaching-overlay :global(.reference) {
      display: none;
    }

    .readout {
      width: min(100%, 14rem);
      align-self: flex-end;
    }

    .contact-row,
    .gate {
      display: none;
    }
  }

  @container (max-height: 33rem) {
    .subtitle {
      display: none;
    }

    .contract,
    .teaching-overlay :global(.reference) {
      display: none;
    }

    .readout {
      padding-block: 0.45rem;
    }

    .beat,
    .contact-row {
      min-height: 2rem;
    }
  }
</style>
