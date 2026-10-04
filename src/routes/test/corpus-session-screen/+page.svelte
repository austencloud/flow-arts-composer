<script lang="ts">
  /**
   * Visual harness for the hands-free pronunciation recording screen.
   *
   * The screen's real home is the Lab tab, which is `adminOnly` and needs a
   * microphone plus a folder grant before it renders anything past the Start
   * button. This route mounts the same component against a fake session so all
   * four states can be judged at every viewport without either.
   */
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import CorpusSessionScreen from "$lib/features/lab/pronunciation-recorder/components/CorpusSessionScreen.svelte";
  import type { ReadState } from "$lib/features/lab/pronunciation-recorder/state/corpus-session-state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";

  type State =
    | "idle"
    | "running"
    | "hearing"
    | "saved"
    | "retry"
    | "long"
    | "unsaved"
    | "failed"
    | "finished"
    | "aborted";

  /** The message a denied storage upload actually produces, at full length. */
  const SAVE_REJECTED =
    "Could not save the recording. Firebase Storage: User does not have permission to access 'pronunciation-corpus/abc123/corpus-2026-08-17T10-42-08/004.wav'. (storage/unauthorized)";

  let state = $state<State>("idle");

  const OPTIONS = [
    { value: "idle" as const, label: "Idle" },
    { value: "running" as const, label: "Waiting" },
    { value: "hearing" as const, label: "Recording" },
    { value: "saved" as const, label: "Saved" },
    { value: "retry" as const, label: "Re-read" },
    { value: "long" as const, label: "Longest word" },
    { value: "unsaved" as const, label: "Save failed" },
    { value: "failed" as const, label: "Failed" },
    { value: "finished" as const, label: "Finished" },
    { value: "aborted" as const, label: "Aborted" },
  ];

  // Eight letters is the longest length the word pool generates, so this is the
  // widest prompt the screen ever has to hold.
  const LONGEST = [
    Letter.SIGMA_DASH,
    Letter.OMEGA_DASH,
    Letter.LAMBDA_DASH,
    Letter.THETA_DASH,
    Letter.DELTA_DASH,
    Letter.PSI_DASH,
    Letter.PHI_DASH,
    Letter.GAMMA,
  ];

  const RUNNING: readonly State[] = ["running", "hearing", "saved", "retry", "long", "unsaved"];
  const running = $derived(RUNNING.includes(state));

  const READ_STATES: Partial<Record<State, ReadState>> = {
    hearing: "hearing",
    saved: "saved",
    retry: "retry",
    // The longest word is shown mid-read, which is when the prompt is at its
    // most crowded: the accent treatment is on and every reserved row is full.
    long: "heard",
  };

  const session = $derived({
    status: running ? "running" : state === "aborted" ? "finished" : state,
    abortReason: state === "aborted" ? "consecutive-failures" : null,
    folderName: state === "idle" ? null : "tka-corpus-2026-08-16",
    currentWord:
      state === "long" ? LONGEST : running ? [Letter.A, Letter.B, Letter.C] : null,
    nextWord: state === "long" ? [Letter.W_DASH, Letter.Z] : running ? [Letter.SIGMA] : null,
    completed: state === "idle" ? 0 : 137,
    remaining: state === "finished" || state === "aborted" ? 0 : 263,
    retired:
      state === "finished" || state === "aborted"
        ? [
            [Letter.THETA_DASH, Letter.OMEGA],
            [Letter.PSI_DASH],
          ]
        : [],
    levelDb: state === "long" || state === "hearing" ? -12 : -34,
    // The two label states are different widths, so both need looking at: the
    // reserve on the label is what stops the meter resizing between them.
    hearing: state === "long" || state === "hearing",
    readState: READ_STATES[state] ?? "waiting",
    // Named on screen once the prompt has moved on, so the confirmation says
    // which word it is confirming. The re-queue line carries the eight-letter
    // word because it is the longest string this screen can produce, and the
    // reserve above the prompt has to hold it at every width.
    judgedWord: state === "retry" ? LONGEST : [Letter.THETA_DASH, Letter.OMEGA],
    failure:
      state === "failed"
        ? "The speech detector could not start listening."
        : state === "unsaved"
          ? SAVE_REJECTED
          : null,
    start: async () => {},
  });
</script>

<svelte:head><title>Corpus session screen harness</title></svelte:head>

<div class="harness">
  <header>
    <p class="banner">
      Mock. Nothing here records: the numbers are invented and Start does nothing. The working
      recorder is at <LinkChip size="inline" href="/lab/pronunciation-recorder">/lab/pronunciation-recorder</LinkChip>.
    </p>

    <!-- SegmentedControl's root is `width: 100%`, so without a bounded wrapper
         six short labels stretch into a 3840px progress bar. -->
    <div class="switcher">
      <SegmentedControl
        options={OPTIONS}
        value={state}
        onchange={(next) => (state = next)}
        ariaLabel="Screen state"
        size="sm"
      />
    </div>
  </header>

  <main>
    <CorpusSessionScreen {session} />
  </main>
</div>

<style>
  .harness {
    display: grid;
    grid-template-rows: auto 1fr;
    /* Deliberately thin. On the 960x412 fold this chrome competes with the
       screen under test for the same scarce height, and a harness that
       manufactures its own overflow tells you nothing about the component. */
    gap: 0.5rem;
    min-height: 100dvh;
    padding: 0.5rem;
    background: var(--theme-bg, #0b0e14);
    color: var(--theme-text, #e8ecf2);
  }

  header {
    display: grid;
    gap: 0.4rem;
    justify-items: center;
  }

  .banner {
    margin: 0;
    /* 90ch alone runs off the side of a phone, and harness chrome that
       overflows makes the component under it look like the thing that broke. */
    max-width: min(90ch, 100%);
    font-size: 0.8rem;
    text-align: center;
    opacity: 0.7;
  }

  .switcher {
    width: min(52rem, 100%);
    /* Seven states do not fit a 375px phone. Scrolling the switcher keeps the
       harness chrome from overflowing the page it is meant to be judging. */
    overflow-x: auto;
  }

  main {
    display: grid;
    min-height: 0;
  }
</style>
