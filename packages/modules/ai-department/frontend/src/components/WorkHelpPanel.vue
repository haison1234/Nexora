<script setup lang="ts">
import type { AiDepartmentWorkHelpDetailDto, AiDepartmentWorkHelpRequestDto } from '@n8n/api-types';
import { N8nButton, N8nInput } from '@n8n/design-system';
import { useI18n, type BaseTextKey } from '@n8n/i18n';
import { reactive } from 'vue';

defineProps<{
	details: AiDepartmentWorkHelpDetailDto[];
	canAnswer: boolean;
	submittingRequestId: string | null;
}>();
const emit = defineEmits<{
	answer: [request: AiDepartmentWorkHelpRequestDto, answer: string];
}>();
const drafts = reactive<Record<string, string>>({});
const i18n = useI18n();
const text = (key: string) => i18n.baseText(key as BaseTextKey);

function submit(request: AiDepartmentWorkHelpRequestDto) {
	const answer = drafts[request.id]?.trim();
	if (answer) emit('answer', request, answer);
}
</script>

<template>
	<section
		v-if="details.length"
		class="work-help-panel"
		:aria-label="text('aiDepartment.help.title')"
	>
		<h3>{{ text('aiDepartment.help.title') }}</h3>
		<article v-for="detail in details" :key="detail.request.id" class="work-help-request">
			<div>
				<strong>{{ text(`aiDepartment.help.state.${detail.request.state}`) }}</strong>
				<p>{{ detail.request.question }}</p>
				<p>{{ text('aiDepartment.help.reason') }}: {{ detail.request.reason }}</p>
				<p>
					{{ text('aiDepartment.help.recipient') }}:
					{{
						detail.request.routing.recipientMemberId
							? detail.request.routing.recipientMemberId
							: (detail.request.routing.recipientUserId ?? text('aiDepartment.help.unresolved'))
					}}
				</p>
				<ul v-if="detail.request.attemptedSteps.length">
					<li v-for="step in detail.request.attemptedSteps" :key="step">{{ step }}</li>
				</ul>
				<p v-if="detail.request.expertiseTags.length">
					{{ text('aiDepartment.help.expertise') }}: {{ detail.request.expertiseTags.join(', ') }}
				</p>
				<p v-if="detail.response">
					<strong>{{ text('aiDepartment.help.answer') }}</strong
					><br />{{ detail.response.answer }}
				</p>
			</div>
			<form
				v-if="canAnswer && detail.request.state === 'awaiting_answer' && !detail.response"
				@submit.prevent="submit(detail.request)"
			>
				<label :for="`help-answer-${detail.request.id}`">{{
					text('aiDepartment.help.answerLabel')
				}}</label>
				<N8nInput
					:id="`help-answer-${detail.request.id}`"
					v-model="drafts[detail.request.id]"
					type="textarea"
					:rows="3"
					:maxlength="4000"
				/>
				<N8nButton
					type="submit"
					:disabled="
						!drafts[detail.request.id]?.trim() || submittingRequestId === detail.request.id
					"
					:loading="submittingRequestId === detail.request.id"
				>
					{{ text('aiDepartment.help.submitAnswer') }}
				</N8nButton>
			</form>
		</article>
	</section>
</template>
