import { flushSync, mount } from "svelte";
import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

/**
 * A zoom-like slider on 50..400 whose owner keeps its value at `floor` or
 * above, the way the crop keeps Fill from opening a gap.
 */
export function mountHeldSlider(target: HTMLElement, floor: number) {
  let changes = 0;
  const props = $state({
    label: "Zoom",
    value: 100,
    min: 50,
    max: 400,
    step: 1,
    onchange: (next: number) => {
      changes += 1;
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
    get changes() {
      return changes;
    },
  };
}

/** A straighten-like slider that turns either way from 0°. */
export function mountTurnSlider(target: HTMLElement) {
  const props = $state({
    label: "Straighten",
    value: 0,
    min: -45,
    max: 45,
    step: 0.5,
    format: (value: number) => `${value}°`,
    onchange: (next: number) => {
      props.value = next;
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

/** A speed-like slider: its track moves in doublings and reads in ×. */
export function mountSpeedSlider(target: HTMLElement) {
  const props = $state({
    label: "Speed",
    value: 0,
    min: -2,
    max: 2,
    step: 0.01,
    format: (value: number) => `${Math.round(2 ** value * 100) / 100}×`,
    fromTyped: Math.log2,
    onchange: (next: number) => {
      props.value = next;
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
