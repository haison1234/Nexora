# External Coding Runtime Bridge: Contracts

**Contract version**: 1
**Status**: Approved design contract v1. Owner gates and implementation remain open; department surfaces are not confirmed implemented.

## User-facing API

Base: `/rest/projects/:projectId/ai-departments/:departmentId`.

| Method | Path | Access |
|---|---|---|
| GET | /runners; /sessions/:sessionId | `agent:read`; safe summaries |
| POST | /runner-grants | `agent:update` plus `agent:execute`; explicit workspace and expiry |
| POST | /runner-grants/:grantId/revoke | Same control scopes; current issuer/admin policy |
| POST | /sessions/:sessionId/follow-ups | `agent:update` plus `agent:execute`; current active attempt |
| GET | /tool-requests/:requestId/action | `agent:update` plus `agent:execute`; authorized protected action detail |
| POST | /tool-requests/:requestId/decision | `agent:update` plus `agent:execute`; valid request context |

Starts and stops use the 003 attempt API. Every mutation has requestId; changes to existing records also carry expectedVersion. Creation has no prior version. A repeat returns the existing authorized result. A changed payload with the same key is rejected.

## Runner protocol v1

The runner connects to /ai-department/runner-connect under the configured public n8n base path. The dedicated WebSocket upgrade uses an Authorization bearer header and requires TLS and grant authentication before accepting messages. This is a proposed addition, not an existing n8n socket API. Origin checks alone do not authenticate a runner. The runner principal is distinct from a human session and cannot call other user routes.

The handshake binds grantId, runnerId, protocolVersion, providerVersion, and workspaceId. Bearer material is transmitted only through the authenticated handshake, never the URL. Validate token hash, expiry, revocation, issuer's current access, and workspace on every exchange.

Messages contain version, messageId, commandId/eventId, grantId, runnerId, projectId, workId, attemptId, sessionId, sequence, and kind. Maximum encoded message size is 64 KiB. Reject unknown versions, mismatched IDs, and invalid schemas before mutation. Use safe summaries; protected payloads use separately authorized references.

Runner -> host: hello, heartbeat, command_ack, session_snapshot, progress, tool_request, tool_consumed, terminal. Host -> runner: start, follow_up, stop, tool_decision, reconcile, revoke. Heartbeat interval is 10 seconds; after 30 seconds without a heartbeat show disconnected. A lost lease denies new actions but does not prove termination. A new grant may reconcile an old session only after explicit authorization for the same runner, project, workspace, and attempt; it must not create a new attempt.

### Optional workflow capability channel

When 004 is enabled, the protocol also supports capability_invoke and capability_result. The grant must explicitly permit workflow invocation. Route the request through the 004 adapter with its original request ID, current attempt, selected capability version, and protected input reference. Recheck the issuing user's workflow execution and credential policy. No generic workflow webhook or caller-supplied credential is exposed. If 004 is off, reject this message kind.

## Provider adapter

The runner implements the 003 dispatch/lookup/stop/snapshot contract using a durable dispatch key. A follow-up command is delivered once to the same active session. A stream interrupt is only an intermediate signal; confirmed cancellation requires the process/container outcome and owner reconciliation. Do not resume an old provider session as a new work attempt.

Only registered custom tools are available; disable built-in tools. Read/search and write tools all enforce the canonical workspace boundary. Check commands execute in a separate sandbox container without provider credentials or server storage. A mutation/check tool validates the canonical workspace boundary, action hash, current grant, current attempt, expiry, and one unused grant immediately before the side effect. Deny path traversal, symlink escapes, arbitrary shell text, and unregistered executable paths. Do not load repository-controlled hooks or arbitrary plugin/MCP configuration.

An authenticated tool request contains safeDescription plus a protected action reference. The authorized action-detail endpoint relays a bounded response from the authenticated runner; if detail is unavailable, do not permit a decision. Action details are never placed in general activity. The relay uses an action_detail request/response correlated to the same grant, session, request, and action hash, with the same 64 KiB limit. On grant, consume one decision atomically for the immutable action. Delivery loss may be reconciled; it cannot create a second grant. Native Agent tool requests remain owned by Agents and are not converted to runner requests.

## Required provider contract matrix

Before enabling the provider, demonstrate start dedupe; follow-up dedupe; observed stop; reconnect snapshot; action allow/deny; ten-minute/earlier expiry; duplicate decision rejection; context mismatch rejection; workspace and process isolation; grant revocation; safe output filtering; and operation of 002/003/006 when this provider is off. Use the pinned SDK/CLI/image versions in the evidence.

## C3 executor boundary — Approved API amendment

### Approved executor API amendment

All runner commands carry C3 project, work, attempt, binding, claim generation and stable command identity. Revalidate grant and current access on each exchange. Stop acknowledgment and confirmed termination are separate results. The runner cannot grant n8n or workflow permissions.
