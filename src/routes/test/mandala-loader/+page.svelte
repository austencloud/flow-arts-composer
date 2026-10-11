<script lang="ts">
	import MandalaLoader from "#lib/shared/mandala/components/MandalaLoader.svelte";
</script>

<div class="frame">
	<MandalaLoader message="Loading the alphabet…" size={360} />
</div>

<style>
	.frame {
		position: fixed;
		inset: 0;
		background: #07070c;
	}
</style>
