import { tick } from "svelte";

/**
 * What the timing mode's toolbar, dock, panel and stage share: the phone's
 * settings sheet, the panel's animation section and the take's shape. The
 * scope makes one per post.
 */
export function createTimingUi() {
  let settingsOpen = $state(false);
  let animationOpen = $state(false);
  let ratio = $state(9 / 16);
  let animationSection = $state<HTMLDivElement | null>(null);
  /** The phone's dock is on screen, so the settings sheet holds the panel. */
  let dockMounted = $state(false);

  return {
    get settingsOpen() {
      return settingsOpen;
    },
    set settingsOpen(next: boolean) {
      settingsOpen = next;
    },
    get animationOpen() {
      return animationOpen;
    },
    set animationOpen(next: boolean) {
      animationOpen = next;
    },
    get ratio() {
      return ratio;
    },
    set ratio(next: number) {
      ratio = next;
    },
    get animationSection() {
      return animationSection;
    },
    set animationSection(next: HTMLDivElement | null) {
      animationSection = next;
    },
    get dockMounted() {
      return dockMounted;
    },
    set dockMounted(next: boolean) {
      dockMounted = next;
    },
    /** Opens the animation settings: in the sheet on a phone, else in place. */
    async openAnimation(): Promise<void> {
      animationOpen = true;
      if (dockMounted) {
        settingsOpen = true;
        return;
      }
      await tick();
      animationSection?.scrollIntoView({ block: "nearest" });
      animationSection?.focus({ preventScroll: true });
    },
  };
}

export type TimingUi = ReturnType<typeof createTimingUi>;
