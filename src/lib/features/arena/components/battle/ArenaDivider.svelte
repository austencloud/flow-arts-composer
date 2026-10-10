<!--
  ArenaDivider.svelte - "VS" badge between matchup panels

  Centered between the two panels. Renders as a circular badge
  with "VS" text and the module accent color.
-->
<script lang="ts">
  import { ARENA_COLOR } from "../../domain/constants/arena-constants";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<div class="arena-divider" aria-hidden="true">
  <div class="vs-badge" style="--arena-accent: {ARENA_COLOR}">
    <span class="vs-text">{t('arena_battle_vs')}</span>
  </div>
</div>

<style>
  .arena-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: none;
  }

  .vs-badge {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--arena-accent, #e11d48);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 12px color-mix(in srgb, var(--arena-accent, #e11d48) 40%, transparent);
  }

  .vs-text {
    font-size: var(--font-size-min, 14px);
    font-weight: 800;
    color: white;
    letter-spacing: 1px;
    user-select: none;
  }

  @media (max-width: 767px) {
    .vs-badge {
      width: 40px;
      height: 40px;
    }

    .vs-text {
      font-size: var(--font-size-compact, 12px);
    }
  }
</style>
