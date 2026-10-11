<script lang="ts">
  /**
   * RoleFilterButtons - Admin filter for user roles (single-select)
   *
   * Uses SegmentedControl for exactly-one-active semantics and 44px touch floor.
   */

  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  type FilterValue = UserRole | "all";

  interface Props {
    value: FilterValue;
  }

  let { value = $bindable<FilterValue>("all") }: Props = $props();

  const options: { value: FilterValue; label: string }[] = [
    { value: "all", label: "All" },
    { value: "admin", label: "Admins" },
    { value: "tester", label: "Testers" },
    { value: "premium", label: "Premium" },
  ];
</script>

<SegmentedControl
  {options}
  {value}
  onchange={(v) => (value = v)}
  color="accent"
  size="sm"
/>
