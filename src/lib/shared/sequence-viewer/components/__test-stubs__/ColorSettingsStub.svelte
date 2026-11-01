<!--
  ColorSettingsStub - test-only stand-in for PrimaryPropColorSettings, used
  ONLY by MotionVisibilityToggle.svelte.test.ts. The real control opens its
  own BaseModal picker; the popover chrome test needs only the part of its
  DOM that matters to focus containment: a last focusable button followed by
  the hidden `tabindex="-1"` colour input the real swatch drives. That input
  is exactly what once made the shared FocusTrap let Tab out of the panel.
-->
<script lang="ts">
  const props: Record<string, unknown> = $props();
  void props;
</script>

<button type="button">Prop colors</button>
<input
  type="color"
  tabindex="-1"
  aria-hidden="true"
  style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"
/>
