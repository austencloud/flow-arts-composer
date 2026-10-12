<!--
  RetroClippy - Staff Clippy assistant for TKA-OS v1.0

  A brown staff SVG with googly eyes that track the mouse cursor,
  positioned in the bottom-right corner above the taskbar. Rotates
  through "helpful" messages in a yellow speech bubble.

  Domain: Retro Easter Eggs
-->
<script lang="ts">
  let {
    ondismiss,
  }: {
    ondismiss?: () => void;
  } = $props();

  /* Messages                                                            */

  const MESSAGES = [
    "It looks like you're trying to notate a sequence. Would you like help?",
    "Did you know? TKA has over 237 unique motions at ceiling level.",
    "Tip: Save your work frequently. Floppy disks are unreliable.",
    "I see you haven't registered TKA-OS. Would you like to send $29.95?",
    "The Order requires all sequences to be documented. I'm just saying.",
  ];

  const DISMISS_MESSAGE = "I'll just... lean over here then.";
  const MESSAGE_INTERVAL_MS = 8000;
  const DISMISS_DELAY_MS = 2000;
  const PUPIL_RANGE = 3;

  /* State                                                               */

  let messageIndex = $state(0);
  let dismissing = $state(false);
  let visible = $state(false);
  let pupilOffsetX = $state(0);
  let pupilOffsetY = $state(0);

  const currentMessage = $derived(
    dismissing ? DISMISS_MESSAGE : MESSAGES[messageIndex]
  );

  /* Entry animation trigger                                             */

  $effect(() => {
    /* Slight delay before sliding in so the transition fires */
    const id = setTimeout(() => {
      visible = true;
    }, 50);
    return () => clearTimeout(id);
  });

  /* Message rotation                                                    */

  $effect(() => {
    if (dismissing) return;

    const id = setInterval(() => {
      messageIndex = (messageIndex + 1) % MESSAGES.length;
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(id);
  });

  /* Mouse tracking for googly eyes                                      */

  let staffEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!staffEl) return;

      const rect = staffEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + 20; /* eyes are near the top */

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist === 0) {
        pupilOffsetX = 0;
        pupilOffsetY = 0;
      } else {
        pupilOffsetX = (dx / dist) * PUPIL_RANGE;
        pupilOffsetY = (dy / dist) * PUPIL_RANGE;
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  });

  /* Dismiss                                                             */

  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  function handleDismiss() {
    dismissing = true;
    dismissTimer = setTimeout(() => {
      dismissTimer = undefined;
      ondismiss?.();
    }, DISMISS_DELAY_MS);
  }

  $effect(() => {
    return () => {
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  });
</script>

<div
  class="clippy-container"
  class:clippy-visible={visible}
  bind:this={staffEl}
  role="complementary"
  aria-label="Staff Clippy assistant"
>
  <!-- Speech bubble -->
  <div class="speech-bubble">
    <button
      class="speech-close"
      type="button"
      onclick={handleDismiss}
      aria-label="Dismiss Clippy"
      disabled={dismissing}
    >
      X
    </button>
    <p class="speech-text">{currentMessage}</p>
  </div>

  <!-- Staff with googly eyes -->
  <svg
    class="staff-svg"
    viewBox="0 0 40 100"
    width="40"
    height="100"
    aria-hidden="true"
  >
    <!-- Staff body -->
    <rect x="16" y="10" width="8" height="80" rx="2" fill="#8B4513" />
    <!-- Staff highlight -->
    <rect
      x="17"
      y="10"
      width="2"
      height="80"
      rx="1"
      fill="#A0522D"
      opacity="0.5"
    />

    <!-- Left eye - white -->
    <circle cx="14" cy="18" r="7" fill="#fff" stroke="#333" stroke-width="1" />
    <!-- Left pupil -->
    <circle cx={14 + pupilOffsetX} cy={18 + pupilOffsetY} r="3" fill="#000" />

    <!-- Right eye - white -->
    <circle cx="26" cy="18" r="7" fill="#fff" stroke="#333" stroke-width="1" />
    <!-- Right pupil -->
    <circle cx={26 + pupilOffsetX} cy={18 + pupilOffsetY} r="3" fill="#000" />
  </svg>
</div>

<style>
  /* Container - fixed bottom-right                                      */
  .clippy-container {
    position: absolute;
    bottom: 40px;
    right: 16px;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transform: translateY(160px);
    transition: transform var(--duration-emphasis) var(--ease-standard-out);
    pointer-events: auto;
  }

  .clippy-container.clippy-visible {
    transform: translateY(0);
  }

  /* Speech bubble                                                       */
  .speech-bubble {
    position: relative;
    background: #ffffcc;
    border: 1px solid #000;
    border-radius: 4px;
    padding: 8px 24px 8px 8px;
    max-width: 220px;
    font-family: var(
      --retro-font-family,
      "Microsoft Sans Serif",
      Arial,
      sans-serif
    );
    font-size: var(--retro-font-size, 11px);
    color: #000;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.25);
  }

  /* Tail pointing down */
  .speech-bubble::after {
    content: "";
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 8px solid #ffffcc;
  }

  .speech-bubble::before {
    content: "";
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 10px solid #000;
  }

  /* Close button                                                        */
  .speech-close {
    position: absolute;
    top: 2px;
    right: 4px;
    width: 16px;
    height: 16px;
    min-width: 16px;
    min-height: 16px;
    padding: 0;
    border: 1px solid #808080;
    background: #c0c0c0;
    font-family: var(
      --retro-font-family,
      "Microsoft Sans Serif",
      Arial,
      sans-serif
    );
    font-size: 9px;
    font-weight: bold;
    line-height: 1;
    cursor: pointer;
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      inset -1px -1px #808080,
      inset 1px 1px #fff;
    text-shadow: none;
  }

  .speech-close:hover {
    background: #d0d0d0;
  }

  .speech-close:active {
    border-style: inset;
  }

  /* Speech text                                                         */
  .speech-text {
    margin: 0;
    line-height: 1.4;
  }

  /* Staff SVG                                                           */
  .staff-svg {
    display: block;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.3));
  }
</style>
