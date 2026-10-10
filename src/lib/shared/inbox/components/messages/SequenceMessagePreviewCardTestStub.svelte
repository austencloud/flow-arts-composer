<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let { sequence }: { sequence: SequenceData } = $props();
</script>

<div data-testid="choreo-card">Choreo Card {sequence.word}</div>
