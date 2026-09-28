import { flushSync, mount } from "svelte";
import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";

/**
 * A zoom-like slider on 50..400 whose owner keeps its value at `floor` or
 * above, the way the crop keeps Fill from opening a gap.
 */
export function mountHeldSlider(target: HTMLElement, floor: number) {
  const props = $state({
    label: "Zoom",
    value: 100,
    min: 50,
    max: 400,
    step: 1,
    onchange: (next: number) => {
      props.value = Math.max(floor, next);
    },
  });
  const component = mount(ValueSlider, { target, props });
  flushSync();
  return {
    component,
    get value() {
      return props.value;
    },
  };
}
