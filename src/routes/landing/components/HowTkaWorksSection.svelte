<script lang="ts">
  /**
   * Three real artifacts explain the entire notation path at a glance.
   * The data source is unchanged; only the presentation is intentionally terse.
   */
  import { onMount } from "svelte";
  import { doc, getDoc } from "firebase/firestore";
  import { getFirestoreInstance } from "$lib/shared/auth/firebase";
  import { getPublicSequencesPath } from "$lib/shared/library/data/firestore-paths";
  import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PublicSequenceIndex } from "$lib/shared/foundation/domain/models/public-sequence-index";
  import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import HowTkaAnimationCard from "./HowTkaAnimationCard.svelte";

  interface Props {
    propType?: PropType;
  }

  let { propType = PropType.STAFF }: Props = $props();

  let sequence = $state<SequenceData | null>(null);
  let motionData = $state<PictographData | null>(null);
  let loaded = $state(false);

  const LANDING_SEQUENCE_ID = "3b7882d6-a87d-4b57-bbfe-8eacb9e39f04";

  function forceProps(
    motion: MotionData | undefined | null
  ): MotionData | undefined {
    if (!motion) return undefined;
    return { ...motion, propType };
  }

  function setupFromSequence(full: SequenceData) {
    sequence = full;
    const firstStep = full.steps[0];
    if (!firstStep) return;

    motionData = {
      id: firstStep.id ?? "how-motion",
      letter: (firstStep.letter || undefined) as Letter | undefined,
      stepNumber: 1,
      startPlacement: firstStep.startPlacement,
      endPlacement: firstStep.endPlacement,
      motions: {
        left: forceProps(firstStep.motions?.left),
        right: forceProps(firstStep.motions?.right),
      },
    } as PictographData;
  }

  onMount(async () => {
    try {
      const firestore = await getFirestoreInstance();
      const docRef = doc(
        firestore,
        getPublicSequencesPath(),
        LANDING_SEQUENCE_ID
      );
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        console.warn(
          "[HowTkaWorks] Landing sequence not found in publicSequences"
        );
        return;
      }

      const data = snap.data() as PublicSequenceIndex;
      const seq: SequenceData = {
        id: snap.id,
        name: data.name,
        word: data.word,
        steps: [],
        thumbnails: [...data.thumbnails],
        sequenceLength: data.sequenceLength,
        level: data.level,
        isFavorite: false,
        isCircular: !!data.loopType,
        loopType: (data.loopType as LOOPType) ?? null,
        tags: [...data.tags],
        metadata: {},
        ownerId: data.ownerId,
        leftSoloProp: data.leftSoloProp,
        rightSoloProp: data.rightSoloProp,
        stepPairings: data.stepPairings,
        leftPathHash: data.leftPathHash,
        rightPathHash: data.rightPathHash,
        leftSoloHash: data.leftSoloHash,
        rightSoloHash: data.rightSoloHash,
      };

      if (data.leftSoloProp && data.rightSoloProp && data.stepPairings) {
        const hydrated = hydrate(seq);
        if (hydrated.steps && hydrated.steps.length > 0) {
          setupFromSequence({
            ...hydrated,
            sequenceLength: hydrated.steps.length,
          });
          return;
        }
      }

      console.warn(
        "[HowTkaWorks] Landing sequence has no compositional data to hydrate"
      );
    } catch (error) {
      console.error("[HowTkaWorks] Failed to load landing sequence:", error);
    } finally {
      loaded = true;
    }
  });
</script>

<section class="how-tka-works">
  <div class="section-intro">
    <h2>How it works</h2>
    <p>One pictograph becomes a sequence, then movement.</p>
  </div>

  {#if loaded && sequence && motionData}
    <div
      class="proof-strip"
      role="region"
      aria-label="How TKA notation becomes movement"
    >
      <figure class="proof-cell proof-pictograph">
        <figcaption>Pictograph</figcaption>
        <div class="proof-media pictograph-media">
          <PictographContainer
            pictographData={motionData}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={propType}
            rightPropTypeOverride={propType}
            showGrid={true}
            showTKA={true}
            showReversals={false}
            showPlacements={true}
            showHandPoints={true}
            showLeftMotion={true}
            showRightMotion={true}
            darkMode={true}
            disableTransitions={true}
          />
        </div>
      </figure>

      <figure class="proof-cell proof-sequence">
        <figcaption>Sequence</figcaption>
        <div class="proof-media sequence-media">
          <ChoreoCard
            {sequence}
            darkMode={true}
            columnCount={2}
            leftPropType={propType}
            rightPropType={propType}
            startPlacementLayoutOverride="column"
            showMandala={true}
            showNotes={false}
          />
        </div>
      </figure>

      <figure class="proof-cell proof-playback">
        <figcaption>Playback</figcaption>
        <div class="proof-media playback-media">
          <HowTkaAnimationCard {sequence} {propType} active={true} />
        </div>
      </figure>
    </div>
  {:else if loaded}
    <div class="proof-strip proof-error" role="status">
      <p>Couldn't load the notation example.</p>
    </div>
  {:else}
    <div class="proof-strip proof-loading" aria-hidden="true">
      <div></div>
      <div></div>
      <div></div>
    </div>
  {/if}
</section>

<style>
  .how-tka-works {
    --proof-void: var(--landing-void, #070910);
    --proof-panel: rgba(10, 14, 31, 0.88);
    --proof-panel-raised: rgba(15, 21, 45, 0.9);
    --proof-copy: rgba(255, 255, 255, 0.64);
    --proof-line: rgba(255, 255, 255, 0.14);
    --proof-height: clamp(280px, 24vw, 360px);

    box-sizing: border-box;
    width: min(calc(100% - 48px), 1480px);
    margin: 0 auto;
    padding: 64px 0 72px;
    scroll-margin-top: 88px;
    container-type: inline-size;
  }

  .section-intro {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 40px;
    margin-bottom: 28px;
  }

  h2 {
    margin: 0;
    color: #f5f5f5;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(2.5rem, 4vw, 3.65rem);
    font-weight: 400;
    line-height: 1;
  }

  .section-intro p {
    max-width: 440px;
    margin: 0 0 4px;
    color: var(--proof-copy);
    font-size: clamp(var(--font-size-min, 14px), 1.25vw, 1rem);
    line-height: 1.5;
    text-align: right;
  }

  .proof-strip {
    display: grid;
    height: var(--proof-height);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.32);
    border-radius: 22px;
    background: var(--proof-void);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
  }

  .proof-cell {
    position: relative;
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    margin: 0;
    overflow: hidden;
    background: var(--proof-panel);
  }

  .proof-cell + .proof-cell {
    border-left: 1px solid var(--proof-line);
  }

  .proof-cell figcaption {
    position: absolute;
    top: 18px;
    left: 20px;
    z-index: 2;
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    letter-spacing: 0.02em;
  }

  .proof-media {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .pictograph-media {
    width: min(68%, 250px);
    aspect-ratio: 1;
    border-radius: 10px;
  }

  .sequence-media {
    width: min(80%, 310px);
    height: calc(100% - 58px);
    margin-top: 34px;
    border-radius: 10px;
  }

  .proof-playback {
    background: var(--proof-void);
  }

  .proof-sequence {
    background: var(--proof-panel-raised);
  }

  .proof-playback figcaption {
    color: rgba(255, 255, 255, 0.66);
  }

  .playback-media {
    width: min(70%, 260px);
    aspect-ratio: 1;
    border-radius: 10px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32);
  }

  .proof-error {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.72);
  }

  .proof-error p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .proof-loading div {
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.07);
    animation: proof-pulse 1.8s ease-in-out infinite;
  }

  .proof-loading div:last-child {
    border: 0;
    background: rgba(0, 0, 0, 0.22);
  }

  @keyframes proof-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.86;
    }
  }

  @media (max-width: 760px) {
    .how-tka-works {
      --proof-height: clamp(176px, 49vw, 210px);

      width: min(calc(100% - 32px), 680px);
      padding: 48px 0 56px;
      scroll-margin-top: 72px;
    }

    .section-intro {
      display: block;
      margin-bottom: 22px;
    }

    h2 {
      font-size: clamp(2.25rem, 11vw, 3rem);
    }

    .section-intro p {
      max-width: none;
      margin-top: 12px;
      text-align: left;
    }

    .proof-strip {
      border-radius: 14px;
    }

    .proof-cell figcaption {
      top: 10px;
      left: 10px;
      font-size: var(--font-size-min, 14px);
    }

    .pictograph-media,
    .playback-media {
      width: 76%;
    }

    .sequence-media {
      width: 88%;
      height: calc(100% - 38px);
      margin-top: 28px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .proof-loading div {
      animation: none;
    }
  }
</style>
