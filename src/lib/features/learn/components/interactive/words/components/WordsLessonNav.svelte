<script lang="ts">
  let {
    showBack = true,
    nextLabel = "Next",
    onBack,
    onNext,
  } = $props<{
    showBack?: boolean;
    nextLabel?: string;
    onBack?: () => void;
    onNext: () => void;
  }>();
</script>

<div class="nav-buttons">
  {#if showBack && onBack}
    <button class="back-btn" onclick={onBack}>
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      Back
    </button>
  {/if}
  <button class="next-button" onclick={onNext}>
    <span>{nextLabel}</span>
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .nav-buttons {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .back-btn:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: white;
  }

  .next-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 2rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #50c878) 30%, transparent) 0%,
      color-mix(in srgb, var(--semantic-success, #50c878) 30%, transparent) 100%
    );
    border: 2px solid
      color-mix(in srgb, var(--semantic-success, #50c878) 50%, transparent);
    border-radius: 12px;
    color: white;
    font-size: 1.0625rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-emphasis),
      border-color var(--duration-emphasis),
      transform var(--duration-emphasis);
    min-height: var(--min-touch-target);
    margin-left: auto;
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success, #50c878) 40%, transparent) 0%,
      color-mix(in srgb, var(--semantic-success, #50c878) 40%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #50c878) 80%,
      transparent
    );
    transform: translateY(-2px);
  }

  @media (max-width: 600px) {
    .nav-buttons {
      flex-direction: column;
    }

    .back-btn,
    .next-button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
