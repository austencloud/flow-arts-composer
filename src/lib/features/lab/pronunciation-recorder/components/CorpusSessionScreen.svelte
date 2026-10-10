<script lang="ts">
  import { getLetterPronunciation } from "#lib/shared/pronunciation/pronunciation-plan.js";

  import type { ReadState } from "../state/corpus-session-state.svelte";

  import SessionReport from "./SessionReport.svelte";

  interface SessionView {
    status: string;
    abortReason: string | null;
    folderName: string | null;
    currentWord: readonly string[] | null;
    nextWord: readonly string[] | null;
    completed: number;
    remaining: number;
    retired: readonly (readonly string[])[];
    levelDb: number;
    hearing: boolean;
    readState: ReadState;
    /** The word the read state is about — already the previous one once saved. */
    judgedWord: readonly string[] | null;
    failure: string | null;
    start: () => Promise<void>;
  }

  let { session }: { session: SessionView } = $props();

  /**
   * The word as it is written — the thing he actually reads. Never routed
   * through `simplifyRepeatedWord`: that rule is for displaying a sequence
   * label, and this is a script. A word that repeats four times has to be read
   * four times or the aligner is handed a quarter of what it was promised.
   */
  const written = (word: readonly string[] | null) => word?.join("") ?? "";

  /**
   * How to say it, in the shorthand — "sig dash ome dash lam". Subordinate to
   * the written word on purpose: it settles that `Σ-` is read "sig dash" and
   * not "sigma dash", which is the difference between a token bank that plays
   * back at conversational speed and one that recites Greek.
   */
  const spoken = (word: readonly string[] | null) =>
    word
      ?.map((letter) => getLetterPronunciation(letter as never)?.shortName ?? letter)
      .join(" ") ?? "";

  // -60 dBFS reads as empty, 0 as full. A linear map of dBFS is the only meter
  // that shows a quiet microphone as quiet rather than as almost silent.
  const meter = $derived(Math.max(0, Math.min(1, (session.levelDb + 60) / 60)));
  const total = $derived(session.completed + session.remaining);

  /**
   * What the screen says about the read in progress, and about the one before
   * it. Each line reports an event that actually happened — the detector heard
   * speech start, the detector called the word finished, the upload landed —
   * so nothing here can claim more than the session knows.
   */
  const STATE_ICONS: Record<ReadState, string> = {
    waiting: "fa-microphone",
    hearing: "fa-microphone",
    heard: "fa-cloud-arrow-up",
    saved: "fa-circle-check",
    retry: "fa-rotate-left",
  };

  const stateLine = $derived.by(() => {
    const word = written(session.judgedWord);
    switch (session.readState) {
      case "hearing":
        return "Recording";
      // The answer to "am I done with this word yet". The detector has called
      // the word finished; the bytes are on their way up. Unnamed on purpose —
      // the word being saved is still the one on the prompt, so repeating it
      // here would only make the longest line on the screen longer.
      case "heard":
        return "Saving";
      case "saved":
        return word ? `Saved ${word}` : "Saved";
      // Not "read it again": `requeue` puts the word eight places down the
      // list, so the prompt has already moved on to a different one. Telling
      // him to re-read the word in front of him would be telling him to record
      // the wrong word. That the word comes back is a rule of the tool rather
      // than news about this read, so it is stated once on the idle screen and
      // kept out of a line that has to stay one line on a landscape phone.
      case "retry":
        return word ? `Didn't catch ${word}` : "Didn't catch that";
      default:
        return "Read this out loud";
    }
  });
</script>

<div class="session">
  {#if session.status === "idle"}
    <h1 class="title">Record the pronunciation corpus</h1>
    <p class="hint">
      Words appear one at a time. Read each one out loud in your normal voice — it hears you
      stop, saves the audio, and moves to the next one on its own. Nothing to press between
      words. Anything it cannot make out goes back into the list to come round again.
    </p>
    <button class="start" onclick={() => session.start()}>Start recording</button>
    <p class="hint">Starting asks for your microphone. The recordings save to your account.</p>
  {:else if session.status === "running"}
    <!-- The running commentary, and the only place a finished read is confirmed.
         `assertive` because it corrects what he is doing right now: a re-queue
         announced politely arrives after he has already started the next word. -->
    <p class="state-line" data-read={session.readState} aria-live="assertive">
      <!-- One span, so the icon and the words are inline neighbours in a single
           grid item. As two items the grid gave each its own row. -->
      <span><i class="fas {STATE_ICONS[session.readState]}" aria-hidden="true"></i>{stateLine}</span>
    </p>

    <p class="prompt" data-read={session.readState} aria-live="polite">
      {written(session.currentWord)}
    </p>
    <p class="guide">{spoken(session.currentWord)}</p>

    <p class="upcoming">
      {session.nextWord ? `Next: ${written(session.nextWord)}` : "Last one"}
    </p>

    <div class="status">
      <p class="progress" aria-live="off">Word {session.completed + 1} of {total}</p>
      <span class="level" class:hearing={session.hearing}>
        <!-- Not a live region any more. The state line above announces the same
             transition with more to say, and two regions firing on one event
             read the screen out twice. -->
        <span class="level-label">
          <i class="fas fa-microphone" aria-hidden="true"></i>
          {session.hearing ? "Hearing you" : "Listening"}
        </span>
        <span class="meter" role="img" aria-label="Microphone input level">
          <span class="fill" style:transform={`scaleX(${meter})`}></span>
        </span>
      </span>
    </div>

    <p class="trouble" class:shown={session.failure !== null} aria-live="polite">
      {session.failure ?? ""}
    </p>
  {:else if session.status === "failed"}
    <p class="prompt-failed">
      Could not start. Allow the microphone when the browser asks, and make sure you are signed
      in — the recordings save to your account.
    </p>
    {#if session.failure}
      <p class="reason">{session.failure}</p>
    {/if}
    <button class="start" onclick={() => session.start()}>Try again</button>
  {:else}
    <SessionReport
      retired={session.retired}
      recorded={session.completed}
      folderName={session.folderName}
      abortReason={session.abortReason}
      failure={session.failure}
    />
  {/if}
</div>

<style>
  .session {
    display: grid;
    align-content: center;
    justify-items: center;
    /* Both track the viewport's SHORT axis. On a 960x412 fold four 1rem gaps
       plus 2rem of padding is a sixth of the height, which is what pushed the
       count off the bottom; at 2160 the same 1rem reads as no gap at all. */
    gap: clamp(0.5rem, 3vh, 3rem);
    min-height: 100%;
    padding: clamp(1rem, 3vh, 2.5rem);
    text-align: center;
  }

  .start {
    /* An action he presses once from across the room, not an inline link.
       Width is pinned to the label: a stretched pill reads as a progress bar. */
    width: max-content;
    max-width: 100%;
    min-height: 44px;
    /* `em`, so the pill grows with its own label rather than staying a 1080p
       lozenge marooned in the middle of a 4K canvas. */
    padding: 0.7em 2em;
    border: 1px solid var(--theme-accent, currentColor);
    border-radius: 999px;
    background: var(--theme-accent, transparent);
    color: var(--theme-on-accent, inherit);
    font-size: clamp(1.25rem, 1.8vw, 3.5rem);
    cursor: pointer;
  }

  .title {
    margin: 0;
    font-size: clamp(1.5rem, 2.2vw, 4rem);
    font-weight: 700;
  }

  .hint {
    margin: 0;
    max-width: 46ch;
    font-size: clamp(1rem, 1vw, 2rem);
    line-height: 1.5;
    opacity: 0.6;
  }

  .state-line {
    margin: 0;
    /* Two lines of reserve. The longest of the five states wraps on a phone;
       the rest are one line everywhere. A row that changed height between them
       would move the word itself up and down every time a read landed, which is
       the one element on this screen that has to hold still. */
    /* The icon rides in the text flow rather than sitting beside it as a flex
       sibling. As a sibling it kept the full available width and `text-wrap:
       balance` shortened the lines inside it, so on a wide screen the glyph
       ended up marooned a hundred pixels from the words it belongs to. */
    display: grid;
    place-content: center;
    text-align: center;
    width: min(40ch, 92vw);
    /* The `vh` arm is what a landscape phone gets, and there this row competes
       with the word for a fold that was already full. One line is all it needs
       at that width, so 9vh buys the row it uses and hands the rest back to the
       prompt rather than pushing the bottom of the screen past the fold. */
    height: min(3em, 9vh);
    /* Bigger than the row it replaced. It stopped being a standing instruction
       and became the verdict on the last thing he said, which is read from
       wherever he is standing rather than from in front of the screen. */
    font-size: clamp(1.1rem, 1.5vw, 3rem);
    letter-spacing: 0.06em;
    line-height: 1.3;
    text-transform: uppercase;
    /* No `balance` here. Balancing counts the leading glyph as content and will
       hand it a line of its own, which turns a two-line message into a
       three-line one and overruns the reserve above the prompt. */
    opacity: 0.5;
  }

  /* Resting is dim; every state that reports something is full strength and
     carries its own colour, so the verdict on the last read is legible from
     across the room without reading the words. */
  .state-line i {
    margin-inline-end: 0.45em;
  }

  .state-line[data-read="hearing"],
  .state-line[data-read="heard"] {
    color: var(--theme-accent, currentColor);
    opacity: 1;
  }

  .state-line[data-read="saved"] {
    color: var(--semantic-success, #22c55e);
    opacity: 1;
  }

  .state-line[data-read="retry"] {
    color: var(--semantic-warning, #f59e0b);
    opacity: 1;
  }

  .progress {
    margin: 0;
    /* Changing digits with proportional figures shove the meter sideways. */
    font-variant-numeric: tabular-nums;
    font-size: clamp(1rem, 1.1vw, 2.25rem);
    opacity: 0.6;
  }

  .prompt {
    margin: 0;
    /* A fixed box holding a viewport-sized word. The reserve is what keeps the
       count and the meter below from moving between a two-letter word and an
       eight-letter one, and `16vh` is what keeps a two-line word inside that
       reserve (2 lines x 1.05 line-height = 33.6vh, against 30vh of box, with
       `text-wrap: balance` making the second line the short one). The 20rem
       ceiling is what stops the prompt reading as small print on a TV. */
    display: grid;
    /* Bottom-anchored inside its reserved box so a two-line word grows upward
       and the pronunciation below it never moves. Centring instead would park
       the guide a hundred pixels under a one-line word. */
    place-content: end center;
    width: 100%;
    /* Two lines of reserve, expressed in the prompt's own type size, so a short
       fold reserves two short lines rather than a third of a tall screen. */
    height: min(30vh, 2.2em);
    font-size: clamp(2rem, min(9vw, 16vh), 20rem);
    font-weight: 700;
    line-height: 1.05;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  /* The word itself carries the live signal. `saved` deliberately does not
     appear here: by then the prompt is showing the NEXT word, and colouring it
     green would credit it with a recording it has not been given yet. */
  .prompt[data-read="hearing"],
  .prompt[data-read="heard"] {
    color: var(--theme-accent, currentColor);
  }

  .guide {
    margin: 0;
    /* The pronunciation, not the prompt. The longest word reads out to about
       sixty-five characters — one line on a TV, four on a phone — so the box is
       reserved at four either way and the meter below cannot move. */
    display: grid;
    place-content: start center;
    width: 100%;
    /* Four lines where there is room for them, fewer on a fold — where the
       screen is also wide enough that the longest spelling fits on one. */
    height: min(4.5em, 12vh);
    font-size: clamp(0.9rem, 0.95vw, 1.8rem);
    line-height: 1.3;
    text-wrap: balance;
    overflow-wrap: anywhere;
    opacity: 0.55;
  }

  .prompt-failed {
    margin: 0;
    font-size: clamp(1.25rem, 1.8vw, 3rem);
    max-width: 40ch;
  }

  .upcoming {
    margin: 0;
    /* One line, reserved: the longest word in the pool is fifteen characters,
       which fits on one line at every width this screen is used at. */
    display: grid;
    place-content: center;
    width: 100%;
    height: 1.6em;
    font-size: clamp(0.95rem, 1vw, 2rem);
    overflow-wrap: anywhere;
    opacity: 0.35;
  }

  .status {
    /* Count and level share one strip. Two stacked status rows is what pushed
       the count under the fold on a 960x412 phone in landscape. */
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5em 1.5em;
    width: min(45rem, 80vw);
  }

  .level {
    /* The label is what stops a horizontal bar reading as a progress bar. It is
       not decoration — an unlabelled fill next to a word count is a loading
       indicator to anyone who did not write it. */
    display: flex;
    flex: 1 1 12rem;
    align-items: center;
    gap: 0.75em;
    font-size: clamp(0.85rem, 0.9vw, 1.6rem);
    opacity: 0.6;
  }

  .level.hearing {
    /* Full strength against the dimmed resting state. This is the only signal
       that the half of the pipe which ends words is awake — a meter can move
       on a detector that never scored a frame. */
    color: var(--theme-accent, currentColor);
    opacity: 1;
  }

  .level-label {
    flex: 0 0 auto;
    /* Reserved for the longer of the two labels, plus the icon, so the meter
       beside it does not resize every time he starts and stops speaking. */
    min-width: 13ch;
    text-align: start;
    white-space: nowrap;
  }

  .trouble {
    margin: 0;
    /* Held in the layout whether or not there is anything to say, so a save that
       starts failing halfway through does not shove the prompt and the meter
       upward mid-sitting. Four lines of reserve, which is what a storage
       permission message — the longest one this screen can produce — runs to at
       this width. */
    display: grid;
    place-content: start center;
    width: min(52ch, 90vw);
    height: min(5.6em, 15vh);
    font-size: clamp(0.85rem, 0.9vw, 1.5rem);
    line-height: 1.4;
    text-wrap: balance;
    overflow-wrap: anywhere;
    /* Not `display: none` — the row has to keep its height. Hidden also takes it
       out of the accessibility tree, so the live region announces on reveal. */
    visibility: hidden;
  }

  .trouble.shown {
    visibility: visible;
    color: var(--semantic-warning, #f59e0b);
  }

  .reason {
    margin: 0;
    max-width: 60ch;
    font-size: clamp(0.85rem, 0.9vw, 1.5rem);
    opacity: 0.6;
  }

  .meter {
    flex: 1 1 auto;
    height: 0.6em;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 15%, transparent);
    overflow: hidden;
  }

  .fill {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--theme-accent, currentColor);
    transform-origin: left center;
    transition: transform 80ms linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
