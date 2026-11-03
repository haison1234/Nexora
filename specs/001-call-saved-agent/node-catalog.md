# Node catalog for the current checkout

This catalog describes the source tree in this checkout. It is not a fixed
list for every n8n release.

## Source packages

| Package | Location | Top-level integration folders | Node manifest files |
| --- | --- | ---: | ---: |
| Built-in nodes | `packages/nodes-base/nodes/` | 308 | 437 |
| AI/LangChain nodes | `packages/@n8n/nodes-langchain/nodes/` | 20 | 1 aggregate manifest |

The built-in package contains multiple node versions in some folders. The
largest integrations are Google (27 manifests), Microsoft (18), and AWS (15).

## Main categories

- Triggers: Manual Trigger, Schedule Trigger, Cron, Webhook, Error Trigger,
  Form Trigger, Chat/Workflow triggers, polling and event triggers.
- Flow control: If, Switch, Merge, Loop Over Items, Wait, Filter, Stop and
  Error, Execute Workflow, Respond to Webhook.
- Data and files: Code, Edit Fields/Set, Item Lists, Date & Time, XML, HTML,
  Markdown, compression, binary file readers/writers, PDF and spreadsheet
  processing, data tables.
- AI and model access: Message an Agent, OpenAI, Anthropic-compatible nodes,
  Google/Gemini, Mistral, Perplexity, DeepL, Jina AI, AI Transform, and the
  separate LangChain package.
- Communication: Slack, Discord, Telegram, WhatsApp, Microsoft Teams,
  Mattermost, Rocket.Chat, Email, SMS and notification services.
- Social and publishing: Facebook, Facebook Lead Ads, LinkedIn, Reddit,
  Twitter/X, WordPress and Shopify.
- Databases and storage: MySQL, PostgreSQL, MongoDB, Redis, SQLite-compatible
  data access, Oracle, Snowflake, Supabase, S3 and other cloud stores.
- Business services: Google, Microsoft, AWS, GitHub, GitLab, Jira, Linear,
  Notion, Airtable, Salesforce, HubSpot, Asana, ClickUp and hundreds of other
  SaaS integrations.

## LangChain package folders

`agents`, `chains`, `code`, `document_loaders`, `embeddings`, `llms`, `memory`,
`mcp`, `output_parser`, `rerankers`, `retrievers`, `shared`, `text_splitters`,
`tools`, `trigger`, `vector_store`, `vendors`, `Guardrails`, and
`ModelSelector`.

## Implication for the AI department bridge

Do not hard-code this catalog in an agent prompt. Read the node catalog exposed
by the running n8n instance, then validate generated workflow JSON against the
installed node type and version. Built-in source folders are useful for offline
documentation, but they do not include community nodes installed at runtime.

The GitNexus index was not available during this scan, so this inventory is
based on the checked-out source and package manifests.
