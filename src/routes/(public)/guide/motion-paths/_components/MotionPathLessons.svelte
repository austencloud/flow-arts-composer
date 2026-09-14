<script lang="ts">
  import MotionPathLessonSection from "./MotionPathLessonSection.svelte";
</script>

<div class="lessons">
  <MotionPathLessonSection
    id="hand-travel-lesson"
    title="What does the path change?"
    description="Scrub the movement, switch paths, then add the prop."
    loader={() => import("./MotionPathTravelLesson.svelte")}
  />
  <MotionPathLessonSection
    id="step-join-lesson"
    title="Watch the join between steps"
    description="Compare the same sequence at the same moment, and slow down where two steps meet."
    loader={() => import("./MotionPathJoinLesson.svelte")}
  />
  <MotionPathLessonSection
    id="third-order-lesson"
    title="Build motion in layers"
    description="Show the carrier path, add the inner motion, then combine them."
    loader={() => import("./MotionPathThirdOrderLesson.svelte")}
  />
  <MotionPathLessonSection
    id="apply-path-lesson"
    title="Use it in a sequence"
    description="Change the whole sequence or one step. Save and restore within this example."
    loader={() => import("./MotionPathUseLesson.svelte")}
  />
</div>

<style>
  .lessons {
    display: grid;
    gap: var(--spacing-2xl, 48px);
    margin-top: var(--spacing-2xl, 48px);
    min-width: 0;
  }
  @media (min-width: 1400px) {
    .lessons {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--spacing-xl, 32px);
    }
  }
</style>
