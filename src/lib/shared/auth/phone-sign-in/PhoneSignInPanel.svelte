<!--
  The computer's side of "Sign in with your phone": the QR code, its number,
  the time left, and what happened. It shows whatever `session` is doing; the
  sign-in sheet starts the session when the phone choice is pointed at, so the
  code is often ready by the time this panel finishes arriving.
  Spec: docs/superpowers/specs/2026-10-10-shared-phone-sign-in-design.md
-->
<script lang="ts">
  import { QrCode } from "@austencloud/phone-sign-in/svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import { formatCode } from "./client";
  import PhoneNotice from "./PhoneNotice.svelte";
  import {
    DENIED_MESSAGE,
    EXPIRED_MESSAGE,
    type PhoneSignInSession,
  } from "./phone-sign-in-session.svelte";

  const QR_SIZE = 208;

  interface Props {
    session: PhoneSignInSession;
  }

  let { session }: Props = $props();

  const view = $derived(session.view);

  // The QR side swaps between the code and a tile with the state's mark, and
  // the words beside it between the matching lines and buttons.
  const tileKey = $derived(
    view.kind === "waiting"
      ? `qr-${view.request.id}`
      : view.kind === "idle" ||
          view.kind === "starting" ||
          view.kind === "signing-in"
        ? "busy"
        : view.kind
  );

  const spokenCode = (code: string) => `Code ${code.split("").join(" ")}`;
</script>

<div class="phone-panel">
  <p class="sr-only" aria-live="polite">{session.announcement}</p>

  <div class="layout">
    <div class="stage">
      <div class="tile">
        <Crossfade key={tileKey} fill>
          {#if view.kind === "waiting"}
            <QrCode
              value={view.request.approveUrl}
              label="QR code to approve this sign-in on your phone"
              size={QR_SIZE}
            />
          {:else if view.kind === "idle" || view.kind === "starting" || view.kind === "signing-in"}
            <div class="mark"><PanelSpinner /></div>
          {:else}
            <div class="mark" aria-hidden="true">
              <i
                class="fa-solid {view.kind === 'signed-in'
                  ? 'fa-check'
                  : view.kind === 'denied'
                    ? 'fa-xmark'
                    : view.kind === 'expired'
                      ? 'fa-clock'
                      : 'fa-circle-exclamation'}"
              ></i>
            </div>
          {/if}
        </Crossfade>
      </div>
      <!-- The number's line is always there, so nothing moves when a code arrives. -->
      <Crossfade key={view.kind === "waiting" ? view.request.code : ""}>
        {#if view.kind === "waiting"}
          <p class="code" role="img" aria-label={spokenCode(view.request.code)}>
            {formatCode(view.request.code)}
          </p>
        {:else}
          <p class="code" aria-hidden="true">&nbsp;</p>
        {/if}
      </Crossfade>
    </div>

    <div class="words">
      <p class="lead">
        Scan it with your phone while it's signed in, then tap Approve. Your
        phone shows the same number.
      </p>

      <Crossfade
        key={view.kind === "idle" || view.kind === "starting"
          ? "starting"
          : view.kind}
        animateHeight
      >
        {#if view.kind === "waiting"}
          <p class="quiet" role="timer">
            Expires in <span class="time">{session.countdown}</span>
          </p>
        {:else if view.kind === "idle" || view.kind === "starting"}
          <p class="quiet">Getting a code...</p>
        {:else if view.kind === "signing-in" || view.kind === "signed-in"}
          <p class="quiet">Signing in...</p>
        {:else}
          <div class="stack">
            <PhoneNotice
              tone={view.kind === "expired" ? "plain" : "error"}
              icon={view.kind === "denied"
                ? "fa-xmark"
                : view.kind === "expired"
                  ? "fa-clock"
                  : "fa-circle-exclamation"}
            >
              <p>
                {view.kind === "denied"
                  ? DENIED_MESSAGE
                  : view.kind === "expired"
                    ? EXPIRED_MESSAGE
                    : view.message}
              </p>
            </PhoneNotice>
            <div class="actions">
              <PanelButton variant="primary" onclick={session.start}>
                {view.kind === "error" ? "Try again" : "New code"}
              </PanelButton>
            </div>
          </div>
        {/if}
      </Crossfade>
    </div>
  </div>
</div>

<style>
  /* The panel measures itself, so it lays out the same in the sheet and on its own page. */
  .phone-panel {
    container-type: inline-size;
  }

  /* Stacked when narrow; the code beside the words once there is room. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 1rem;
  }

  @container (min-width: 30rem) {
    .layout {
      grid-template-columns: auto minmax(0, 1fr);
      justify-items: start;
      align-items: start;
      gap: 1.5rem;
    }
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  /* The QR's own size, reserved in every state so nothing moves when it arrives. */
  .tile {
    position: relative;
    /* The QR's 208px plus the 1px stroke on each side. */
    width: 210px;
    height: 210px;
    border-radius: var(--radius-md, 0.75rem);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    overflow: hidden;
  }

  .tile :global(.qr) {
    border-radius: 0;
  }

  .mark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    /* A quiet stand-in for the code. The notice beside it carries the color. */
    color: color-mix(in srgb, var(--theme-text) 32%, transparent);
  }

  .code {
    margin: 0;
    font-family:
      ui-monospace, "Cascadia Mono", "Fira Code", Consolas, monospace;
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text);
    text-align: center;
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    width: 100%;
  }

  .lead {
    margin: 0;
    max-width: 36ch;
    font-size: var(--font-size-min, var(--font-size-base));
    line-height: 1.5;
    color: var(--theme-text);
    text-wrap: pretty;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .actions {
    display: flex;
  }

  /* Digits are tabular, so the width holds still as the seconds change. */
  .quiet {
    margin: 0;
    font-size: var(--font-size-min, var(--font-size-sm));
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .time {
    display: inline-block;
    min-width: 4ch;
    color: var(--theme-text);
  }
</style>
