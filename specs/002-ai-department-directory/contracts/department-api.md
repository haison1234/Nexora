# Department Directory API Contract

All routes require an authenticated user. Every route is scoped to the project in the path. Responses must not expose records from another project.

## Authorization

| Operation | Scope |
|---|---|
| List departments and members | `agent:list` |
| Read department or member detail | `agent:read` |
| Create, update, archive, and manage bindings | `agent:create` and `agent:update` |

Department roles and member roles do not grant n8n permissions. Use registered agent scopes with `@ProjectScope` on each controller route. Directory roles do not grant these scopes.

## Routes

Base path: `/projects/:projectId/ai-departments`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | List departments. Optional `includeArchived` defaults to `false`. |
| `POST` | `/` | Create a department. |
| `GET` | `/:departmentId` | Read a department and its members. |
| `PATCH` | `/:departmentId` | Rename or update description with an expected version. |
| `POST` | `/:departmentId/archive` | Archive if no nonterminal work exists. |
| `POST` | `/:departmentId/members` | Create a member. |
| `GET` | `/:departmentId/members` | List members. Optional `includeArchived` defaults to `false`. |
| `PATCH` | `/:departmentId/members/:memberId` | Update member identity fields and manager. |
| `POST` | `/:departmentId/members/:memberId/archive` | Archive if the member has no nonterminal work. |
| `PUT` | `/:departmentId/members/:memberId/executor-binding` | Set or replace the optional executor reference. |
| `DELETE` | `/:departmentId/members/:memberId/executor-binding` | Clear the optional executor reference. |

## Request shapes

```json
{ "name": "Marketing", "description": "Content and campaign work" }
```

```json
{ "name": "Campaign researcher", "role": "Research", "managerMemberId": null }
```

```json
{ "provider": "n8n-agent", "executorId": "agent-id", "expectedVersion": 1 }
```

Each mutation includes `requestId`. Updates and archive also include `expectedVersion`; creation has no prior version. Binding changes compare the member version and return its new version plus the binding version. A repeated key and payload returns the existing authorized outcome; a reused key with different payload returns 409. Command identity is scoped to the project and initiating user.

The shared command lookup is GET /rest/projects/:projectId/ai-department-commands/:requestId. It is completed in 003, requires the original actor and action scopes, and never repeats a command. Until then, retrying the same directory request ID returns its existing result.

## Errors

| Status | Meaning |
|---|---|
| `400` | Invalid fields, self-management, cross-department manager, or reporting cycle. |
| `403` | User lacks the required project scope. |
| `404` | Project-scoped record does not exist or is not visible. |
| `409` | Duplicate active name, stale version, active work blocks archive, or archive guard is unavailable. |

The API must not distinguish a record in another project from a missing record. A rejected mutation leaves all records unchanged.

## Service boundary

The directory module calls a public Agents-owned resolver to validate a saved Agent binding with `(executorId, projectId)`. The implementation must add this resolver to the supported module API. It does not import Agent entities or repositories. Runtime start is outside this contract.

Feature 003 supplies the `ActiveDepartmentWorkGuard` service. The guard checks department and member work before archive. Its absence blocks both archive operations with `409`.

The guard accepts the sanctioned persistence transaction context. Archive and new assignment acquire the same department/member admission fence. Return blocking work references and a count; do not expose another project's work. Reject archiving a manager while active reports still reference it. Reassign those reports explicitly first.

## C1 Directory — Approved API amendment

### Approved C1 API amendments

Use existing `agent:*` scopes on project-scoped routes as listed above. The directory service calls the Agents-owned binding resolver. Archive acquires the shared admission fence before reading guard state and writing archive state. Return 409 with safe blocking work references when the guard blocks archive. The operation fails closed when the guard is unavailable.

Runtime revocation and stop confirmation belong to C3.
