<script lang="ts">
  import { onMount } from "svelte";
  import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
  } from "firebase/auth";
  import {
    renderFestivalSampler,
    type FestivalSamplerPair,
  } from "#lib/features/choreo-card/services/festival-sampler-renderer.js";
  import type { CardPair } from "#lib/features/choreo-card/services/types.js";
  import { getAuthInstance } from "#lib/shared/auth/firebase.js";

  interface RenderedCard {
    slot: string;
    name: string;
    front: string;
    back: string;
    frontWidth: number;
    frontHeight: number;
    backWidth: number;
    backHeight: number;
  }

  let status = $state("Preparing the selected festival pack...");
  let error = $state("");
  let rendered = $state<RenderedCard[]>([]);
  let signedIn = $state(false);
  let signingIn = $state(false);
  let exporting = $state(false);
  let email = $state("");
  let password = $state("");
  let cardPairs = $state<CardPair[]>([]);

  function canvasUrl(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL("image/png");
  }

  function toRenderedCard(pair: FestivalSamplerPair): RenderedCard {
    return {
      slot: pair.slot,
      name: pair.name,
      front: canvasUrl(pair.front),
      back: canvasUrl(pair.back),
      frontWidth: pair.front.width,
      frontHeight: pair.front.height,
      backWidth: pair.back.width,
      backHeight: pair.back.height,
    };
  }

  async function renderPack() {
    try {
      error = "";
      rendered = [];
      const output = await renderFestivalSampler((next) => {
        status = next.label;
      });
      cardPairs = output;
      rendered = output.map(toRenderedCard);
      status = `Ready: ${rendered.length} cards`;
    } catch (cause) {
      console.error("[FestivalPackHarness] Render failed:", cause);
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Render failed";
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPngs() {
    if (cardPairs.length !== 9 || exporting) return;
    exporting = true;
    error = "";
    try {
      const { exportDeckZIP } =
        await import("#lib/features/choreo-card/services/print-zip-exporter.js");
      const archive = await exportDeckZIP(cardPairs, "Festival_Sampler_2026");
      triggerDownload(archive, "Festival_Sampler_2026_cards.zip");
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      exporting = false;
    }
  }

  async function signIn() {
    if (!email || !password || signingIn) return;
    signingIn = true;
    error = "";
    try {
      await signInWithEmailAndPassword(
        await getAuthInstance(),
        email,
        password
      );
      password = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      signingIn = false;
    }
  }

  onMount(() => {
    let unsubscribe = () => {};
    void getAuthInstance().then((auth) => {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        signedIn = !!user;
        if (user && rendered.length === 0) void renderPack();
      });
    });
    return () => unsubscribe();
  });
</script>

<svelte:head>
  <title>Festival Pack Capture</title>
</svelte:head>

<main>
  <header>
    <h1>Festival sampler capture</h1>
    <p data-testid="festival-pack-status">{status}</p>
    {#if cardPairs.length === 9}
      <button type="button" disabled={exporting} onclick={exportPngs}>
        {exporting ? "Building archive..." : "Download card PNGs"}
      </button>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </header>

  {#if !signedIn}
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void signIn();
      }}
    >
      <label>
        Agent email
        <input
          name="email"
          type="email"
          autocomplete="username"
          bind:value={email}
        />
      </label>
      <label>
        Agent password
        <input
          name="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
        />
      </label>
      <button type="submit" disabled={signingIn}>
        {signingIn ? "Signing in..." : "Sign in to render"}
      </button>
    </form>
  {/if}

  <section aria-label="Rendered card pairs" data-card-count={rendered.length}>
    {#each rendered as card, index (card.slot)}
      <article
        data-card-index={index}
        data-card-slot={card.slot}
        data-card-name={card.name}
        data-front={card.front}
        data-back={card.back}
        data-front-width={card.frontWidth}
        data-front-height={card.frontHeight}
        data-back-width={card.backWidth}
        data-back-height={card.backHeight}
      >
        <img src={card.front} alt={`${card.name} front`} />
        <img src={card.back} alt={`${card.name} back`} />
        <strong>{index + 1}. {card.name}</strong>
        <span>{card.slot}</span>
      </article>
    {/each}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #11131a;
    color: #f7f7fb;
    font-family: Inter, system-ui, sans-serif;
  }

  main {
    padding: 1.5rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }

  h1,
  p {
    margin: 0;
  }

  .error {
    color: #ff8f8f;
  }

  section {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.25rem;
  }

  form {
    display: flex;
    align-items: end;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
  }

  input,
  button {
    min-height: 2.75rem;
    box-sizing: border-box;
    padding: 0.6rem 0.8rem;
    color: inherit;
    background: #1a1d27;
    border: 1px solid #4b5168;
    border-radius: 0.5rem;
  }

  button {
    cursor: pointer;
  }

  article {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0.75rem;
    background: #1a1d27;
    border: 1px solid #35394a;
    border-radius: 0.75rem;
  }

  img {
    width: 100%;
    min-width: 0;
  }

  strong,
  span {
    grid-column: 1 / -1;
  }

  span {
    color: #aeb3c8;
    font-size: 0.8rem;
  }
</style>
