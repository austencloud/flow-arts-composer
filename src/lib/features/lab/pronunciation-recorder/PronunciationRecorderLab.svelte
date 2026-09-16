<script lang="ts">
  import CorpusSessionScreen from "./components/CorpusSessionScreen.svelte";
  import { planWords } from "./domain/corpus-plan";
  import { getPronunciationRecorder } from "./get-pronunciation-recorder";
  import { AudioRingCapture } from "./services/implementations/AudioRingCapture";
  import { CloudCorpusSessionStore } from "./services/implementations/CloudCorpusSessionStore";
  import { SileroBoundaryDetector } from "./services/implementations/SileroBoundaryDetector";
  import { createCorpusSession } from "./state/corpus-session-state.svelte";

  // Fetched rather than imported. A static JSON import is inlined into the app
  // bundle, and 2400 words would ride along in every page load of the whole
  // product for one lab tab — the bundle lever this repo has been bitten by
  // before. `static/` is served at `/`.
  async function buildSession() {
    const response = await fetch("/data/pronunciation-word-pool.json");
    const { words: pool, letters } = (await response.json()) as {
      words: string[][];
      letters: string[];
    };

    // The letter list comes from the pool, not from the `Letter` enum. The enum
    // carries 54 entries; 47 of them are letters a word can hold, and the other
    // seven are placement names. Planning cells for a placement name would put a
    // label on screen that is not a TKA word.
    //
    // Coverage starts empty. Resuming from a previous sitting reads session.json
    // back through the store; until that lands, a second sitting re-plans from
    // zero and simply over-serves the cells it already has.
    const plan = planWords({ pool, letters, coverage: {}, maxWords: 400 });

    return createCorpusSession({
      words: plan.words,
      capture: new AudioRingCapture(),
      detector: new SileroBoundaryDetector(),
      store: new CloudCorpusSessionStore(),
      microphone: getPronunciationRecorder(),
    });
  }
</script>

{#await buildSession() then session}
  <CorpusSessionScreen {session} />
{/await}
