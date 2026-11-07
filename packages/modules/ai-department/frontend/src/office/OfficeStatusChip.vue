<script setup lang="ts">
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import type { OfficeStatus } from './office-model';
import OfficeStatusIcon from './OfficeStatusIcon.vue';
import { STATUS_VISUAL } from './status-visual';

defineProps<{ status: OfficeStatus }>();

const i18n = useI18n();
const label = (status: OfficeStatus) =>
	i18n.baseText(`aiDepartment.office.status.${status}` as BaseTextKey);
</script>

<template>
	<span
		:class="[
			'chip',
			`chip--${status}`,
			{ 'chip--dashed': STATUS_VISUAL[status].dashed, 'chip--pulse': STATUS_VISUAL[status].pulse },
		]"
		:style="{ '--chip-color': STATUS_VISUAL[status].color }"
		data-test-id="office-status-chip"
	>
		<OfficeStatusIcon :status="status" />
		{{ label(status) }}
	</span>
</template>

<style lang="scss" scoped>
.chip {
	--chip-color: var(--text-color--subtle);

	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: 2px var(--spacing--2xs);
	border: var(--border-width) var(--border-style) var(--chip-color);
	border-radius: var(--radius--full);
	color: var(--chip-color);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--medium);
	line-height: 1.4;
	white-space: nowrap;
}

.chip--dashed {
	border-style: dashed;
}

.chip--pulse :deep(.status-icon) {
	@media (prefers-reduced-motion: no-preference) {
		animation: pulse 1.8s ease-in-out infinite;
	}
}

@keyframes pulse {
	50% {
		opacity: 0.35;
	}
}
</style>
