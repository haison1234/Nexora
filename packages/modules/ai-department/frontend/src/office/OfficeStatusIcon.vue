<script setup lang="ts">
import type { OfficeStatus } from './office-model';
import { STATUS_VISUAL } from './status-visual';

defineProps<{ status: OfficeStatus }>();
</script>

<template>
	<svg class="status-icon" viewBox="0 0 16 16" aria-hidden="true">
		<path :d="STATUS_VISUAL[status].icon" />
	</svg>
</template>

<style lang="scss" scoped>
.status-icon {
	flex: none;
	width: 12px;
	height: 12px;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.6;
	stroke-linecap: round;
	stroke-linejoin: round;
}
</style>
