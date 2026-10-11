<!--
  TunnelPublicationControls.svelte — the owner's "share to Explore" panel
  section for one saved tunnel (Browse Phase 3).

  Publish-first: "Share publicly" makes the tunnel live in Explore
  immediately. Moderation is a retroactive takedown, and content it removed
  can't be republished as-is. This section reports exactly where the tunnel
  sits in that lifecycle and offers the one action that makes sense there.
-->
<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import type { CollectedTunnel } from "../domain/tunnel-collection-types";
  import {
    getTunnelPublicationStatus,
    publishTunnel,
    withdrawTunnelPublication,
    type PublicationOwner,
    type TunnelPublicationStatus,
  } from "../services/tunnel-publication-service";

  let { tunnel }: { tunnel: CollectedTunnel } = $props();

  let status = $state<TunnelPublicationStatus | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state("");
  let requestToken = 0;

  const owner = $derived.by((): PublicationOwner | null => {
    const user = authState.user;
    if (!user || !authState.isFullAccount) return null;
    return { uid: user.uid, displayName: user.displayName ?? "Flow artist" };
  });

  const isLive = $derived(status?.liveRevisionId !== undefined);
  const liveIsStale = $derived(status?.liveIsStale === true);

  $effect(() => {
    void tunnel.id;
    void owner;
    void refresh();
  });

  async function refresh() {
    if (!owner) {
      status = null;
      return;
    }
    const token = ++requestToken;
    loading = true;
    error = "";
    try {
      const loaded = await getTunnelPublicationStatus(tunnel, owner);
      if (token === requestToken) status = loaded;
    } catch (cause) {
      console.warn("[TunnelPublication] Status load failed:", cause);
      if (token === requestToken) {
        error = "Sharing status could not be loaded.";
      }
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  /**
   * `share` publishes; `preview` re-runs the same publish purely to re-render
   * the Explore poster. Publishing already re-renders it, so the two differ only
   * in what they tell the owner — without the second entry point the only way to
   * replace a stale public preview is to unpublish the tunnel.
   */
  async function publish(intent: "share" | "preview" = "share") {
    if (!owner || busy) return;
    busy = true;
    try {
      const result = await publishTunnel(tunnel, owner);
      if (result.status === "removed") {
        toast.error(
          "This version was removed by moderation — edit the tunnel to share it"
        );
      } else if (intent === "preview") {
        toast.success("Explore preview updated");
      } else if (result.status === "published") {
        toast.success("Now public in Explore");
      } else {
        toast.info("This version is already public");
      }
      await refresh();
    } catch (cause) {
      console.warn("[TunnelPublication] Publish failed:", cause);
      toast.error(
        intent === "preview"
          ? "Couldn't update the preview — try again"
          : "Couldn't share the tunnel — try again"
      );
    } finally {
      busy = false;
    }
  }

  async function withdraw() {
    if (!owner || busy) return;
    busy = true;
    try {
      await withdrawTunnelPublication(tunnel.id, owner);
      toast.success("Removed from public view");
      await refresh();
    } catch (cause) {
      console.warn("[TunnelPublication] Withdraw failed:", cause);
      toast.error("Couldn't withdraw the tunnel — try again");
    } finally {
      busy = false;
    }
  }
</script>

<section class="publication-section" aria-labelledby="publication-title">
  <div class="publication-head">
    <h3 id="publication-title">Public sharing</h3>
    {#if status}
      {#if isLive}
        <span class="status-chip live">
          <i class="fas fa-globe" aria-hidden="true"></i>
          Public
        </span>
      {:else if status.state === "removed"}
        <span class="status-chip declined">
          <i class="fas fa-ban" aria-hidden="true"></i>
          Removed
        </span>
      {:else}
        <span class="status-chip idle">
          <i class="fas fa-lock" aria-hidden="true"></i>
          Private
        </span>
      {/if}
    {/if}
  </div>

  {#if !owner}
    <p class="publication-hint">
      Sign in with a full account to share tunnels in Explore.
    </p>
  {:else if loading && !status}
    <div class="publication-status">
      <PanelSpinner size={8} />
      <span>Checking sharing status…</span>
    </div>
  {:else if error}
    <div class="publication-status error">
      <span>{error}</span>
      <button type="button" onclick={() => void refresh()}>Retry</button>
    </div>
  {:else if status}
    {#if isLive}
      {#if liveIsStale}
        <p class="publication-hint">
          The public version is older than this saved tunnel.
        </p>
        <button
          type="button"
          class="pub-btn primary"
          disabled={busy}
          onclick={() => void publish()}
        >
          <i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i>
          <span>Publish update</span>
        </button>
      {:else}
        <p class="publication-hint">
          This tunnel is visible to everyone in Explore.
        </p>
        <button
          type="button"
          class="pub-btn secondary"
          disabled={busy}
          onclick={() => void publish("preview")}
        >
          <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
          <span>Refresh preview</span>
        </button>
      {/if}
      <button
        type="button"
        class="pub-btn secondary"
        disabled={busy}
        onclick={() => void withdraw()}
      >
        <i class="fas fa-eye-slash" aria-hidden="true"></i>
        <span>Remove from public</span>
      </button>
    {:else if status.state === "removed"}
      <p class="publication-hint">
        This version was removed by moderation. Edit the tunnel to share a new
        version.
      </p>
    {:else}
      <p class="publication-hint">
        Sharing makes this tunnel visible to everyone in Explore, under your
        name, right away.
      </p>
      <button
        type="button"
        class="pub-btn primary"
        disabled={busy}
        onclick={() => void publish()}
      >
        <i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i>
        <span>Share publicly</span>
      </button>
    {/if}
  {/if}
</section>

<style>
  .publication-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .publication-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .publication-head h3 {
    margin: 0;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .status-chip.live {
    color: var(--semantic-success, #34d399);
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #34d399) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, #34d399) 12%,
      transparent
    );
  }

  .status-chip.declined {
    color: var(--semantic-error, #ef4444);
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  .publication-hint,
  .publication-status {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }

  .publication-status {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
  }

  .publication-status.error {
    justify-content: space-between;
    color: var(--semantic-error, #ef4444);
  }

  .publication-status button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 45%, transparent);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 10%,
      transparent
    );
    color: var(--theme-accent-text, var(--theme-accent, #22d3ee));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    cursor: pointer;
  }

  .pub-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 12px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  .pub-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .pub-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .pub-btn.primary {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 75%, white),
      var(--theme-accent, #22d3ee)
    );
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent);
  }

  .pub-btn.secondary {
    background: transparent;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 45%, transparent);
    color: var(--theme-accent-text, var(--theme-accent, #22d3ee));
  }

  @media (hover: hover) {
    .pub-btn.secondary:hover:not(:disabled) {
      background: color-mix(
        in srgb,
        var(--theme-accent, #22d3ee) 12%,
        transparent
      );
    }
    .pub-btn.primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px
        color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pub-btn {
      transition: none !important;
    }
    .pub-btn.primary:hover {
      transform: none;
    }
  }
</style>
