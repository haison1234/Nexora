<script setup lang="ts">
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { computed } from 'vue';
import { OFFICE_INDEPENDENT_TEAM, type OfficeModel } from './office-model';
import OfficeStatusChip from './OfficeStatusChip.vue';

const props = defineProps<{
	model: OfficeModel;
	selectedMemberId: string | null;
	compact?: boolean;
}>();
const emit = defineEmits<{ select: [memberId: string] }>();

const i18n = useI18n();
const text = (key: string, options?: Record<string, string | number>) =>
	i18n.baseText(key as BaseTextKey, options ? { interpolate: options } : undefined);

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

const groups = computed(() =>
	props.model.teams.map((team) => {
		const members = team.memberIds.flatMap((id) => {
			const character = props.model.characters.find(({ memberId }) => memberId === id);
			return character ? [character] : [];
		});
		const lead = members.find(({ memberId }) => memberId === team.leadMemberId);
		return {
			id: team.id,
			title:
				team.id === OFFICE_INDEPENDENT_TEAM || !lead
					? text('aiDepartment.office.team.independent')
					: text('aiDepartment.office.team.of', { name: lead.name }),
			members,
		};
	}),
);
</script>

<template>
	<div class="roster" :class="{ compact }" data-test-id="office-roster">
		<section v-for="group in groups" :key="group.id" class="team">
			<h2>{{ group.title }}</h2>
			<ul>
				<li v-for="member in group.members" :key="member.memberId">
					<button
						type="button"
						class="member"
						:class="{ selected: member.memberId === selectedMemberId }"
						:aria-pressed="member.memberId === selectedMemberId"
						:aria-label="text('aiDepartment.office.selectMember', { name: member.name })"
						:data-test-id="`office-roster-member-${member.memberId}`"
						@click="emit('select', member.memberId)"
					>
						<span class="avatar" :class="`avatar--${member.status}`" aria-hidden="true">
							{{ initials(member.name) }}
						</span>
						<span class="body">
							<strong>{{ member.name }}</strong>
							<span class="role">{{ member.role }}</span>
							<span v-if="!compact" class="work">
								{{ member.workInstruction ?? text('aiDepartment.office.noWork') }}
							</span>
						</span>
						<OfficeStatusChip :status="member.status" />
					</button>
				</li>
			</ul>
		</section>
	</div>
</template>

<style lang="scss" scoped>
.roster {
	display: grid;
	gap: var(--spacing--md);
}

.team h2 {
	margin: 0 0 var(--spacing--2xs);
	color: var(--text-color--subtle);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--medium);
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

ul {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
	gap: var(--spacing--2xs);
	margin: 0;
	padding: 0;
	list-style: none;
}

.compact ul {
	grid-template-columns: 1fr;
}

.member {
	display: flex;
	align-items: center;
	gap: var(--spacing--xs);
	width: 100%;
	padding: var(--spacing--xs);
	border: var(--border);
	border-radius: var(--radius--md);
	background: var(--background--surface);
	color: var(--text-color);
	text-align: start;
	cursor: pointer;
	transition:
		box-shadow 0.15s ease,
		border-color 0.15s ease,
		transform 0.15s ease;

	&:hover {
		border-color: var(--color--primary);
		box-shadow: var(--shadow--sm);
	}

	&:focus-visible {
		outline: 2px solid var(--color--primary);
		outline-offset: 2px;
	}

	&.selected {
		border-color: var(--color--primary);
		box-shadow: 0 0 0 1px var(--color--primary);
	}

	@media (prefers-reduced-motion: no-preference) {
		&:hover {
			transform: translateY(-1px);
		}
	}
}

.avatar {
	display: grid;
	flex: none;
	place-items: center;
	width: 38px;
	height: 38px;
	border-radius: var(--radius--full);
	background: var(--color--primary--tint-3);
	color: var(--color--primary--shade-1);
	font-size: var(--font-size--xs);
	font-weight: var(--font-weight--bold);
}
.avatar--working {
	background: var(--color--success--tint-3);
	color: var(--color--success--shade-1);
}
.avatar--review {
	background: var(--color--warning--tint-2);
	color: var(--color--warning--shade-1);
}
.avatar--blocked {
	background: var(--color--danger--tint-3);
	color: var(--color--danger--shade-1);
}
.avatar--unconfigured,
.avatar--unavailable,
.avatar--idle {
	background: var(--background--subtle);
	color: var(--text-color--subtle);
}

.body {
	display: grid;
	flex: 1;
	gap: 1px;
	min-width: 0;

	strong,
	.role,
	.work {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.role,
	.work {
		color: var(--text-color--subtle);
		font-size: var(--font-size--xs);
	}
}
</style>
