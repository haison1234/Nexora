<script setup lang="ts">
import type { AiDepartmentMemberDto, AiDepartmentWorkItemDto } from '@n8n/api-types';
import type { AiDepartmentMemberBinding } from '../ai-department.api';
import { N8nButton } from '@n8n/design-system';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { computed, ref } from 'vue';
import { deriveStatus } from '../office/office-model';
import OfficeStatusChip from '../office/OfficeStatusChip.vue';
import { addExpertiseTag, EXPERTISE_LIMITS } from './expertise';
import { eligibleManagers } from './org-tree';

const props = defineProps<{
	member: AiDepartmentMemberDto;
	members: AiDepartmentMemberDto[];
	work: AiDepartmentWorkItemDto[];
	binding: AiDepartmentMemberBinding | null;
	bindingLoading: boolean;
	bindingError: boolean;
	editable?: boolean;
	saving?: boolean;
	waitingWorkIds?: ReadonlySet<string>;
}>();
const emit = defineEmits<{
	select: [memberId: string];
	openWork: [workId: string];
	manage: [memberId: string];
	setManager: [memberId: string, managerMemberId: string | null];
	setExpertise: [memberId: string, tags: string[]];
	close: [];
}>();

const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);

const manager = computed(
	() => props.members.find(({ id }) => id === props.member.managerMemberId) ?? null,
);
const managerOptions = computed(() => eligibleManagers(props.members, props.member.id));

function onManagerChange(event: Event) {
	if (!(event.target instanceof HTMLSelectElement)) return;
	emit('setManager', props.member.id, event.target.value || null);
}

const tagDraft = ref('');

function addTag() {
	const next = addExpertiseTag(props.member.expertiseTags, tagDraft.value);
	if (!next) return;
	tagDraft.value = '';
	emit('setExpertise', props.member.id, next);
}

function removeTag(tag: string) {
	emit(
		'setExpertise',
		props.member.id,
		props.member.expertiseTags.filter((existing) => existing !== tag),
	);
}

const reports = computed(() =>
	props.members.filter(
		({ managerMemberId, archived }) => managerMemberId === props.member.id && !archived,
	),
);
const assigned = computed(() =>
	props.work.filter(
		({ assigneeMemberId, state }) =>
			assigneeMemberId === props.member.id && !['done', 'cancelled'].includes(state),
	),
);
const status = computed(() => {
	const current =
		assigned.value.find(({ state }) => state === 'running') ??
		assigned.value.find(({ state }) => state === 'review') ??
		assigned.value.find(({ state }) => state === 'blocked') ??
		assigned.value[0] ??
		null;
	return deriveStatus(
		props.member,
		current,
		Boolean(current && props.waitingWorkIds?.has(current.id)),
	);
});
</script>

<template>
	<aside
		class="panel"
		data-test-id="member-panel"
		:aria-label="text('aiDepartment.org.detailLabel')"
	>
		<header>
			<div>
				<span class="eyebrow">{{ text('aiDepartment.office.selectedTitle') }}</span>
				<h2>{{ member.name }}</h2>
				<p>{{ member.role }}</p>
			</div>
			<button
				type="button"
				class="close"
				:aria-label="text('aiDepartment.office.clearSelection')"
				@click="emit('close')"
			>
				×
			</button>
		</header>

		<OfficeStatusChip :status="status" />

		<dl>
			<dt>{{ text('aiDepartment.org.managerLabel') }}</dt>
			<dd>
				<select
					v-if="editable"
					class="manager-select"
					data-test-id="member-manager-select"
					:value="member.managerMemberId ?? ''"
					:disabled="saving"
					:aria-label="text('aiDepartment.org.managerSelectLabel')"
					@change="onManagerChange"
				>
					<option value="">{{ text('aiDepartment.org.noManager') }}</option>
					<option v-for="option in managerOptions" :key="option.id" :value="option.id">
						{{ option.name }}
					</option>
				</select>
				<template v-else>
					<button v-if="manager" type="button" class="link" @click="emit('select', manager.id)">
						{{ manager.name }}
					</button>
					<span v-else class="muted">{{ text('aiDepartment.org.noManager') }}</span>
				</template>
				<p v-if="editable" class="note">{{ text('aiDepartment.org.managerEffect') }}</p>
			</dd>

			<dt>{{ text('aiDepartment.org.expertiseLabel') }}</dt>
			<dd>
				<ul v-if="member.expertiseTags.length" class="chips" data-test-id="member-expertise">
					<li v-for="tag in member.expertiseTags" :key="tag" class="tag">
						{{ tag }}
						<button
							v-if="editable"
							type="button"
							class="tag-remove"
							:disabled="saving"
							:aria-label="text('aiDepartment.org.removeTag', { tag })"
							@click="removeTag(tag)"
						>
							×
						</button>
					</li>
				</ul>
				<span v-else class="muted">{{ text('aiDepartment.org.noExpertise') }}</span>
				<form v-if="editable" class="tag-form" @submit.prevent="addTag">
					<input
						v-model="tagDraft"
						type="text"
						data-test-id="member-expertise-input"
						:maxlength="EXPERTISE_LIMITS.chars"
						:disabled="saving || member.expertiseTags.length >= EXPERTISE_LIMITS.tags"
						:placeholder="text('aiDepartment.org.addTagPlaceholder')"
						:aria-label="text('aiDepartment.org.addTagLabel')"
					/>
					<N8nButton
						type="submit"
						variant="outline"
						size="small"
						:disabled="saving || !tagDraft.trim()"
					>
						{{ text('aiDepartment.org.addTag') }}
					</N8nButton>
				</form>
			</dd>

			<dt>{{ text('aiDepartment.org.reportsLabel') }}</dt>
			<dd>
				<ul v-if="reports.length" class="chips">
					<li v-for="report in reports" :key="report.id">
						<button type="button" class="link" @click="emit('select', report.id)">
							{{ report.name }}
						</button>
					</li>
				</ul>
				<span v-else class="muted">{{ text('aiDepartment.org.noReports') }}</span>
			</dd>

			<dt>{{ text('aiDepartment.org.workLabel') }}</dt>
			<dd>
				<ul v-if="assigned.length" class="work">
					<li v-for="item in assigned" :key="item.id">
						<button type="button" @click="emit('openWork', item.id)">
							<span class="instruction">{{ item.instruction }}</span>
							<span class="state" :class="`state--${item.state}`">
								{{ text(`aiDepartment.state.${item.state}`) }}
							</span>
						</button>
					</li>
				</ul>
				<span v-else class="muted">{{ text('aiDepartment.office.noWork') }}</span>
			</dd>

			<dt>{{ text('aiDepartment.org.bindingLabel') }}</dt>
			<dd>
				<span v-if="bindingLoading" class="muted">{{
					text('aiDepartment.org.bindingLoading')
				}}</span>
				<span v-else-if="bindingError" class="muted">{{
					text('aiDepartment.org.bindingError')
				}}</span>
				<span v-else-if="binding" :data-test-id="`member-binding-${binding.executionState}`">
					{{ text(`aiDepartment.org.binding.${binding.executionState}`) }}
				</span>
				<span v-else class="muted">{{ text('aiDepartment.org.bindingLoading') }}</span>
			</dd>
		</dl>

		<N8nButton variant="outline" data-test-id="member-manage" @click="emit('manage', member.id)">
			{{ text('aiDepartment.org.manageExecutor') }}
		</N8nButton>
	</aside>
</template>

<style lang="scss" scoped>
.panel {
	display: grid;
	align-content: start;
	gap: var(--spacing--xs);
	padding: var(--spacing--md);
	border: var(--border);
	border-radius: var(--radius--lg);
	background: var(--background--surface);
	box-shadow: var(--shadow--xs);

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing--xs);
	}
	h2 {
		margin: 0;
		font-size: var(--font-size--lg);
	}
	p {
		margin: 0;
		color: var(--text-color--subtle);
	}
	dl {
		display: grid;
		gap: var(--spacing--3xs);
		margin: 0;
	}
	dt {
		margin-top: var(--spacing--2xs);
		color: var(--text-color--subtle);
		font-size: var(--font-size--2xs);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	dd {
		margin: 0;
	}
}
.eyebrow {
	color: var(--color--primary);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--bold);
	letter-spacing: 0.06em;
	text-transform: uppercase;
}
.muted {
	color: var(--text-color--subtle);
}
.note {
	margin: var(--spacing--3xs) 0 0;
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
}
.tag {
	display: inline-flex;
	align-items: center;
	gap: var(--spacing--3xs);
	padding: 0 var(--spacing--2xs);
	border: var(--border);
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	font-size: var(--font-size--2xs);
}
.tag-remove {
	padding: 0;
	border: 0;
	background: none;
	color: var(--text-color--subtle);
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
	}
}
.tag-form {
	display: flex;
	gap: var(--spacing--2xs);
	margin-top: var(--spacing--2xs);

	input {
		flex: 1;
		min-width: 0;
		min-height: var(--height--md);
		padding: 0 var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--3xs);
		background: var(--background--surface);
		color: var(--text-color);

		&:focus-visible {
			outline: 2px solid var(--color--primary);
		}
	}
}
.manager-select {
	width: 100%;
	min-height: var(--height--md);
	padding: 0 var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--3xs);
	background: var(--background--surface);
	color: var(--text-color);

	&:focus-visible {
		outline: 2px solid var(--color--primary);
	}
}
.close {
	width: 28px;
	height: 28px;
	border: 0;
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color);
	font-size: var(--font-size--lg);
	line-height: 1;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
	}
}
.link {
	padding: 0;
	border: 0;
	background: none;
	color: var(--color--primary);
	cursor: pointer;
	text-decoration: underline;
	text-underline-offset: 2px;

	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}
}
.chips,
.work {
	display: flex;
	flex-wrap: wrap;
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}
.work {
	flex-direction: column;
	flex-wrap: nowrap;

	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing--xs);
		width: 100%;
		padding: var(--spacing--2xs) var(--spacing--xs);
		border: var(--border);
		border-radius: var(--radius--sm);
		background: transparent;
		color: var(--text-color);
		text-align: start;
		cursor: pointer;

		&:hover {
			border-color: var(--color--primary);
		}
		&:focus-visible {
			outline: 2px solid var(--color--primary);
		}
	}
	.instruction {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}
.state {
	flex: none;
	padding: var(--spacing--5xs) var(--spacing--2xs);
	border-radius: var(--radius--full);
	background: var(--background--subtle);
	color: var(--text-color--subtle);
	font-size: var(--font-size--2xs);
	font-weight: var(--font-weight--medium);
}
.state--running {
	background: var(--color--primary--tint-3);
	color: var(--color--primary--shade-1);
}
.state--review {
	background: var(--color--warning--tint-2);
	color: var(--color--warning--shade-1);
}
.state--blocked {
	background: var(--color--danger--tint-3);
	color: var(--color--danger--shade-1);
}
</style>
