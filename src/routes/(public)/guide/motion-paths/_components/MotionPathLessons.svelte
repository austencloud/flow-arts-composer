<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import MotionPathLessonSection from "./MotionPathLessonSection.svelte";

  type LessonId =
    | "hand-travel"
    | "step-joins"
    | "motion-layers"
    | "apply-paths";

  const lessons = [
    {
      value: "hand-travel",
      label: "Hand travel",
      panelId: "hand-travel-lesson",
      instruction: "Switch paths. Add the staff to compare its trace.",
      loader: () => import("./MotionPathTravelLesson.svelte"),
    },
    {
      value: "step-joins",
      label: "Step joins",
      panelId: "step-join-lesson",
      instruction: "Scrub across a step boundary.",
      loader: () => import("./MotionPathJoinLesson.svelte"),
    },
    {
      value: "motion-layers",
      label: "Motion layers",
      panelId: "third-order-lesson",
      instruction: "Combine a carrier path with inner motion.",
      loader: () => import("./MotionPathThirdOrderLesson.svelte"),
    },
    {
      value: "apply-paths",
      label: "Apply paths",
      panelId: "apply-path-lesson",
      instruction: "Apply a path to one step or the whole sequence.",
      loader: () => import("./MotionPathUseLesson.svelte"),
    },
  ] as const;

  const narrowViewport = new MediaQuery("(max-width: 34rem)");
  let selected = $state<LessonId>("hand-travel");
  const selectedLesson = $derived(
    lessons.find((lesson) => lesson.value === selected)!
  );
  const tabOptions = $derived(
    lessons.map((lesson) => ({
      value: lesson.value,
      label: lesson.label,
      id: `${lesson.panelId}-tab`,
      controls: lesson.panelId,
    }))
  );
</script>

<section class="lessons" aria-labelledby="motion-path-lessons-heading">
  <header class="lessons-header">
    <h2 id="motion-path-lessons-heading">Explore motion paths</h2>
    <div class="lesson-picker">
      <SegmentedControl
        options={tabOptions}
        value={selected}
        onchange={(value) => (selected = value)}
        ariaLabel="Motion path demonstration"
        semantics="tabs"
        columns={narrowViewport.current ? 2 : undefined}
      />
    </div>
    <p>{selectedLesson.instruction}</p>
  </header>

  <div class="lesson-panels">
    {#each lessons as lesson (lesson.value)}
      <MotionPathLessonSection
        id={lesson.panelId}
        tabId={`${lesson.panelId}-tab`}
        loader={lesson.loader}
        selected={selected === lesson.value}
      />
    {/each}
  </div>
</section>

<style>
  .lessons {
    width: min(100%, 60rem);
    margin-top: var(--spacing-2xl, 48px);
    min-width: 0;
    container-type: inline-size;
  }
  .lessons-header {
    display: grid;
    gap: var(--spacing-sm, 8px);
    margin-bottom: var(--spacing-lg, 24px);
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: clamp(22px, 3cqw, 28px);
  }
  .lesson-picker {
    width: min(100%, 44rem);
  }
  p {
    color: var(--theme-text-muted);
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
  }
  .lesson-panels {
    min-width: 0;
  }
  @media (max-width: 34rem) {
    .lesson-picker {
      width: 100%;
    }
  }
</style>
