<script setup lang="ts">
import type {
	AiDepartmentMemberDto,
	AiDepartmentWorkAttemptDto,
	AiDepartmentWorkWakeStatus,
} from '@n8n/api-types';
import { useI18n, type BaseTextKey } from '@n8n/i18n';

defineProps<{
	attempts: AiDepartmentWorkAttemptDto[];
	members: AiDepartmentMemberDto[];
	wake: AiDepartmentWorkWakeStatus | null;
}>();
const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);
const displayDate = (value: string) => new Date(value).toLocaleString();
</script>

<template>
	<div class="runtime-details">
		<section v-if="wake" class="wake" data-test-id="work-wake">
			<h4>{{ text('aiDepartment.wake.title') }}</h4>
			<p>{{ text(`aiDepartment.wake.state.${wake.state ?? 'none'}`) }}</p>
			<time v-if="wake.createdAt" :datetime="wake.createdAt">
				{{ text('aiDepartment.wake.created', { date: displayDate(wake.createdAt) }) }}
			</time>
			<time v-if="wake.deliveredAt" :datetime="wake.deliveredAt">
				{{ text('aiDepartment.wake.delivered', { date: displayDate(wake.deliveredAt) }) }}
			</time>
		</section>
		<section v-if="attempts.length" class="history-section" data-test-id="runtime-attempts">
			<h4>{{ text('aiDepartment.runtime.title') }}</h4>
			<ul>
				<li v-for="attempt in attempts" :key="attempt.id">
					<strong>{{ text('aiDepartment.runtime.attempt', { ordinal: attempt.ordinal }) }}</strong>
					<p>
						{{ text('aiDepartment.runtime.member') }}:
						{{ members.find(({ id }) => id === attempt.memberId)?.name ?? attempt.memberId }}
					</p>
					<p>{{ text('aiDepartment.runtime.provider') }}: {{ attempt.provider }}</p>
					<p>
						{{ text('aiDepartment.runtime.phase') }}:
						{{ text(`aiDepartment.runtime.phase.${attempt.phase}`) }}
					</p>
					<p v-if="attempt.outcome">
						{{ text('aiDepartment.runtime.outcome') }}:
						{{ text(`aiDepartment.runtime.outcome.${attempt.outcome}`) }}
					</p>
					<p v-else>{{ text('aiDepartment.runtime.outcome.pending') }}</p>
					<p v-if="attempt.nativeToolApproval === 'pending'" role="status">
						{{ text('aiDepartment.runtime.nativeToolApproval.pending') }}
					</p>
					<p v-else-if="attempt.nativeToolApproval === 'unknown'" role="status">
						{{ text('aiDepartment.runtime.nativeToolApproval.unknown') }}
					</p>
					<p v-if="attempt.cancellationPending" role="status">
						{{ text('aiDepartment.runtime.stopPending') }}
					</p>
					<time v-if="attempt.startedAt" :datetime="attempt.startedAt">
						{{ text('aiDepartment.runtime.started', { date: displayDate(attempt.startedAt) }) }}
					</time>
					<time v-if="attempt.finishedAt" :datetime="attempt.finishedAt">
						{{ text('aiDepartment.runtime.finished', { date: displayDate(attempt.finishedAt) }) }}
					</time>
				</li>
			</ul>
		</section>
	</div>
</template>

<style lang="scss" scoped>
.history-section {
	margin-block-start: var(--spacing--sm);
	padding-block-start: var(--spacing--sm);
	border-block-start: var(--border);

	h4 {
		margin: 0 0 var(--spacing--2xs);
	}
	ul {
		display: grid;
		gap: var(--spacing--xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		padding: var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--sm);
	}
	p {
		margin: var(--spacing--3xs) 0;
		color: var(--text-color--subtle);
	}
	time {
		color: var(--text-color--subtle);
		font-size: var(--font-size--2xs);
	}
}
.runtime-details {
	display: grid;
	gap: var(--spacing--xs);
}
.wake {
	margin-block-start: var(--spacing--sm);
	padding: var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--sm);
	background: var(--background--subtle);

	h4,
	p {
		margin: 0 0 var(--spacing--3xs);
	}
	time {
		display: block;
		color: var(--text-color--subtle);
		font-size: var(--font-size--2xs);
	}
}
</style>
