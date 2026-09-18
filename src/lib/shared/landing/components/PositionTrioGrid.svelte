<script lang="ts">
  /**
   * The alpha/beta/gamma position pictograph trio used on marketing pages
   * (/about, /notation). One source for the images, labels, and the
   * light/dark inversion treatment so the two pages can't drift.
   */
  let { lightsOn = true }: { lightsOn?: boolean } = $props();

  const positions = [
    {
      src: "/images/position_images/alpha.png",
      alt: "Alpha placement: hands at opposite points on the grid",
      name: "Alpha",
      desc: "Opposite points",
    },
    {
      src: "/images/position_images/beta.png",
      alt: "Beta placement: hands at the same point on the grid",
      name: "Beta",
      desc: "Same point",
    },
    {
      src: "/images/position_images/gamma.png",
      alt: "Gamma placement: hands forming a right angle on the grid",
      name: "Gamma",
      desc: "Right angle",
    },
  ];
</script>

<div class="position-grid" class:dark-mode={!lightsOn}>
  {#each positions as position}
    <div class="position-item">
      <div class="position-image-container">
        <img src={position.src} alt={position.alt} />
      </div>
      <span class="position-name">{position.name}</span>
      <span class="position-desc">{position.desc}</span>
    </div>
  {/each}
</div>

<style>
  .position-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin: 1.6rem 0;
  }
  .position-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .position-image-container {
    width: 100%;
    max-width: 160px;
    aspect-ratio: 1;
    background: #ffffff;
    border-radius: 12px;
    border: 1px solid oklch(0.4 0.04 270 / 0.15);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.5rem;
    transition:
      filter 0.3s ease,
      background 0.3s ease;
  }
  .position-image-container img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  /* Dark mode - invert the pictograph images */
  .position-grid.dark-mode .position-image-container {
    background: #14142b;
    filter: invert(1) hue-rotate(180deg);
  }
  .position-name {
    font-weight: 600;
    font-size: 1rem;
    color: oklch(0.92 0.01 270);
    margin-bottom: 0.125rem;
  }
  .position-desc {
    font-size: 0.78rem;
    color: oklch(0.6 0.02 270);
  }

  /* 4K / ultrawide: the trio is the page's only visual — let it break out of
     the reading column into a wide media band (classic editorial breakout:
     the negative margins centre a viewport-scaled band on the column).
     Source PNGs are 400×400, so the 360px cap stays under native. */
  /* The band recomposition stays because it uses the available canvas. Type
     stays on its normal roles, and the image cap remains a source-resolution
     limit. */
  @media (min-width: 1680px) {
    .position-grid {
      /* 35.4vw == 1360px at 3840; the band scales fluidly, but the 1800px cap
         (and the 360px image cap below) respect the 400×400 source PNGs. */
      --band: clamp(1360px, 35.4vw, 1800px);
      width: min(var(--band), 90vw);
      margin-left: calc(50% - min(var(--band), 90vw) / 2);
      gap: 2.5rem;
      margin-block: 3rem;
    }
    .position-image-container {
      max-width: 360px;
      border-radius: 18px;
    }
  }

  @media (max-width: 768px) {
    .position-image-container {
      max-width: 100px;
    }
    .position-name {
      font-size: 0.875rem;
    }
  }
  @media (max-width: 400px) {
    .position-image-container {
      max-width: 80px;
    }
    .position-desc {
      font-size: 0.7rem;
    }
  }
</style>
