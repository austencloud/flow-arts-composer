<!--
MotionsIntroPage - Introduction to hand motions
-->
<script lang="ts">
  import FundamentalMotionCard from "./FundamentalMotionCard.svelte";

  let { onNext }: { onNext: () => void } = $props();
</script>

<div class="page">
  <h2>Hand Motions</h2>

  <div class="intro-section">
    <p class="intro-text">
      In TKA, hands move between grid points using three fundamental motions:
    </p>

    <div class="fundamental-motions">
      <FundamentalMotionCard
        type="shift"
        icon="fa-arrow-right"
        title="Shift"
        description="Move to an <strong>adjacent</strong> point (90°)"
      />
      <FundamentalMotionCard
        type="dash"
        icon="fa-bolt"
        title="Dash"
        description="Jump to the <strong>opposite</strong> point (180°)"
      />
      <FundamentalMotionCard
        type="static"
        icon="fa-pause"
        title="Static"
        description="<strong>Stay</strong> at the current point"
      />
    </div>

    <p class="intro-text">
      These combine into <strong>6 Motion Types</strong> that describe what both hands
      do together.
    </p>
  </div>

  <button class="next-button" onclick={onNext}>
    Learn Type 1: Dual-Shift
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    animation: slideInUp var(--duration-dramatic) var(--ease-standard);
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    font-size: 1.875rem;
    font-weight: 700;
    color: white;
    margin: 0;
    text-align: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #22d3ee) 0%,
      var(--theme-accent, #06b6d4) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .intro-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .intro-text {
    font-size: 1.125rem;
    line-height: 1.7;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
    text-align: center;
  }

  .fundamental-motions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .next-button {
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 2.5rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 100%
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 50%, transparent);
    border-radius: 12px;
    color: white;
    font-size: 1.0625rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-emphasis),
      border-color var(--duration-emphasis),
      transform var(--duration-emphasis);
    min-height: 54px;
    margin-top: 0.5rem;
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 80%,
      transparent
    );
    transform: translateY(-2px);
  }

  .next-button i {
    font-size: 0.9375rem;
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }

    .fundamental-motions {
      flex-direction: column;
      align-items: center;
    }

    .next-button {
      width: 100%;
      max-width: 300px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
