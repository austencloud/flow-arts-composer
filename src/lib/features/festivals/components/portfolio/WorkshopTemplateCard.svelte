<script lang="ts">
  import type {
    WorkshopTemplate,
    WorkshopLevel,
  } from "../../domain/models/teaching-portfolio";

  interface Props {
    workshop: WorkshopTemplate;
    onclick: () => void;
  }

  let { workshop, onclick }: Props = $props();

  const levelColors: Record<WorkshopLevel, string> = {
    introductory: "#a78bfa",
    beginner: "#22c55e",
    intermediate: "#eab308",
    advanced: "#ef4444",
    mixed: "#3b82f6",
  };

  const levelColor = $derived(
    levelColors[workshop.level] ?? "var(--theme-accent, #6366f1)"
  );

  const PROP_ICONS: Record<string, string> = {
    "double-staves": "fa-grip-lines-vertical",
    staves: "fa-grip-lines-vertical",
    staff: "fa-grip-lines-vertical",
    "double staves": "fa-grip-lines-vertical",
    clubs: "fa-baseball-bat-ball",
    club: "fa-baseball-bat-ball",
    "mixed-static-props": "fa-shapes",
    "mixed props": "fa-shapes",
    mixed: "fa-shapes",
    "contact-ball": "fa-circle",
    contact: "fa-circle",
    cj: "fa-circle",
    "crystal ball": "fa-circle",
    balloons: "fa-wind",
    balloon: "fa-wind",
    poi: "fa-yin-yang",
    fans: "fa-fan",
    fan: "fa-fan",
    buugeng: "fa-infinity",
    "s-staff": "fa-infinity",
  };

  function getPropIcon(prop: string): string {
    return PROP_ICONS[prop.toLowerCase().trim()] ?? "fa-circle-dot";
  }

  function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 8); i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  interface PatternCircle {
    size: number;
    top: number;
    left: number;
  }

  interface PatternLine {
    width: number;
    top: number;
    left: number;
    angle: number;
  }

  const patternSeed = $derived(hashCode(workshop.id));

  const circles = $derived.by<PatternCircle[]>(() => {
    const seed = patternSeed;
    const count = (seed % 2) + 2;
    return Array.from({ length: count }, (_, i) => ({
      size: 30 + ((seed >> (i * 3)) % 7) * 10,
      top: ((seed >> (i * 4 + 1)) % 80) - 10,
      left: ((seed >> (i * 5 + 2)) % 90) - 5,
    }));
  });

  const lines = $derived.by<PatternLine[]>(() => {
    const seed = patternSeed;
    const count = (seed % 2) + 2;
    return Array.from({ length: count }, (_, i) => ({
      width: 50 + ((seed >> (i * 3 + 7)) % 7) * 12,
      top: 20 + ((seed >> (i * 4 + 8)) % 6) * 12,
      left: ((seed >> (i * 5 + 9)) % 80) - 5,
      angle: -40 + ((seed >> (i * 3 + 10)) % 9) * 10,
    }));
  });
</script>

<button
  class="workshop-card level-{workshop.level}"
  style="--level-color: {levelColor}"
  {onclick}
  type="button"
>
  <div class="level-accent"></div>

  <div class="card-hero">
    {#if workshop.imageUrl}
      <img
        class="card-hero-image"
        src={workshop.imageUrl}
        alt="{workshop.title} cover"
      />
    {:else}
      <div class="card-pattern">
        {#each circles as circle}
          <div
            class="pattern-circle"
            style="width:{circle.size}px;height:{circle.size}px;top:{circle.top}%;left:{circle.left}%"
          ></div>
        {/each}
        {#each lines as line}
          <div
            class="pattern-line"
            style="width:{line.width}px;top:{line.top}%;left:{line.left}%;transform:rotate({line.angle}deg)"
          ></div>
        {/each}
      </div>
    {/if}

    {#if workshop.props.length > 0}
      <div class="card-props">
        {#each workshop.props as prop (prop)}
          <span class="prop-icon" title={prop}>
            <i class="fas {getPropIcon(prop)}" aria-hidden="true"></i>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="card-info">
    <h4 class="card-title">{workshop.title}</h4>
    {#if workshop.description}
      <p class="card-teaser">{workshop.description}</p>
    {/if}
  </div>

  <div class="card-meta">
    <span class="level-dot"></span>
    <span class="level-label">{workshop.level}</span>
    <span class="solo-badge">{workshop.solo ? "Solo" : "Partner"}</span>
  </div>
</button>

<style>
  .workshop-card {
    all: unset;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color var(--transition-fast, var(--duration-fast)),
      transform var(--transition-fast, var(--duration-fast)),
      box-shadow var(--transition-fast, var(--duration-fast));
    position: relative;
    text-align: left;
  }

  .workshop-card:hover {
    border-color: color-mix(in srgb, var(--level-color) 40%, transparent);
    transform: translateY(-3px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  }

  .workshop-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .level-accent {
    height: 3px;
    background: linear-gradient(
      90deg,
      var(--level-color),
      color-mix(in srgb, var(--level-color) 50%, transparent)
    );
  }

  .card-hero {
    height: 120px;
    position: relative;
    overflow: hidden;
  }

  .card-hero::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at 30% 20%,
      var(--level-color),
      transparent 70%
    );
    opacity: 0.12;
  }

  .card-hero::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 70%;
    background: linear-gradient(
      to top,
      var(--theme-card-bg, rgba(13, 13, 26, 0.95)),
      transparent
    );
  }

  .card-hero-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-pattern {
    position: absolute;
    inset: 0;
    overflow: hidden;
    opacity: 0.15;
    color: var(--level-color);
  }

  .pattern-circle {
    position: absolute;
    border-radius: 50%;
    border: 2px solid currentColor;
  }

  .pattern-line {
    position: absolute;
    height: 1px;
    background: currentColor;
    transform-origin: left center;
  }

  .card-props {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 6px;
    z-index: 2;
  }

  .prop-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.7);
  }

  .card-info {
    padding: 14px 14px 8px;
  }

  .card-title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    line-height: 1.3;
    color: var(--theme-text, #ffffff);
  }

  .card-teaser {
    margin: 6px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px 12px;
  }

  .level-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--level-color);
    flex-shrink: 0;
  }

  .level-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.35));
  }

  .solo-badge {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.25));
    margin-left: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .workshop-card {
      transition: none;
    }

    .workshop-card:hover {
      transform: none;
      box-shadow: none;
    }
  }
</style>
