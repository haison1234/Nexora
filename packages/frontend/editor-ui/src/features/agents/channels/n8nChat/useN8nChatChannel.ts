import { N8N_CHAT_INTEGRATION_TYPE, type ChatIntegrationDescriptor } from '@n8n/api-types';
import { useI18n } from '@n8n/i18n';
import { computed } from 'vue';

import { useAgentsN8nChatFlag } from '../../composables/useAgentsN8nChatFlag';

/**
 * n8n Chat is an internal integration: the catalog endpoint never lists it, so
 * the channel list, the builder chips and the status fetches add it here,
 * first in the channel list and only while its feature flag is on, unless a
 * caller explicitly keeps the channel visible in its picker.
 */
export function useN8nChatChannel() {
	const i18n = useI18n();
	const isEnabled = useAgentsN8nChatFlag();
	const descriptor = computed<ChatIntegrationDescriptor>(() => ({
		type: N8N_CHAT_INTEGRATION_TYPE,
		label: i18n.baseText('agents.channels.n8nChat.label'),
		icon: 'message-square',
		credentialTypes: [],
	}));

	function withN8nChat(
		integrations: ChatIntegrationDescriptor[],
		{ includeWhenDisabled = false }: { includeWhenDisabled?: boolean } = {},
	): ChatIntegrationDescriptor[] {
		if (!isEnabled.value && !includeWhenDisabled) return integrations;
		return [
			descriptor.value,
			...integrations.filter(({ type }) => type !== N8N_CHAT_INTEGRATION_TYPE),
		];
	}

	return { isEnabled, withN8nChat };
}
