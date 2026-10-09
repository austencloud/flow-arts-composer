<!-- Mounts the Create front door closed, as CreateModule does, and lets a
     test open and close it. -->
<script lang="ts">
  import type { Section } from "$lib/shared/navigation/domain/types";
  import CreateFrontDoor from "$lib/features/create/shared/components/CreateFrontDoor.svelte";

  let {
    methods,
    lockedMethodIds,
    lastUsedMode = null,
    onSelect,
    onLockedSelect,
  }: {
    methods: Section[];
    lockedMethodIds?: ReadonlySet<string>;
    lastUsedMode?: string | null;
    onSelect: (methodId: string) => void;
    onLockedSelect?: (methodId: string) => void;
  } = $props();

  let active = $state(false);

  export function setActive(value: boolean): void {
    active = value;
  }
</script>

<CreateFrontDoor
  {methods}
  {lockedMethodIds}
  {active}
  source="direct"
  {lastUsedMode}
  {onSelect}
  {onLockedSelect}
/>
