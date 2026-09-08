# DATA_MODEL.md

**Status: CANONICAL — CURRENT V0 PERSISTENCE CONTRACT ONLY.** This schema does not define or authorize the next product.

# WorkUnit OS Data Model

## 1. Architecture Overview

WorkUnit OS uses Cloudflare D1 (SQLite-compatible) as its primary database layer.

### Current MVP persisted subset

The current SaaS foundation persists the following tenant-database subset:

- `work_units`
- `workunit_feedback`
- `action_previews`
- `approval_records`
- `audit_logs`
- `integration_connections`
- `usage_events`

Current route coverage:

- `GET /api/workunit/inbox` persists generated WorkUnits when repositories are available.
- Repeated inbox fetches upsert by stable WorkUnit ID and do not duplicate rows.
- `POST /api/workunit/:id/feedback` persists feedback and updates WorkUnit status for `later` / `done`.
- `GET /api/integrations/status` reads persisted integration connection metadata.
- Usage events are recorded for inbox fetch, feedback create, and integration status reads.

This phase does not add OAuth, token storage, or external execution persistence.

The architecture follows a **tenant-database isolation** model: each tenant gets their own D1 database for WorkUnit data, while a single **control database** manages global tenant, user, membership, and auth identity registry.

This design provides:

- **Reduced blast radius**: a tenant's data lives in its own database. Corruption, migration failure, or accidental deletion in one tenant DB does not affect others.
- **Storage-layer tenant boundary**: cross-tenant queries are structurally impossible unless explicitly routed through the control DB.
- **Simpler deletion/export**: removing or exporting all data for a tenant is a database-level operation.
- **Independent scaling**: high-activity tenants can be moved to larger databases without affecting others.

## Architecture ownership note

This document defines persisted data structures only. Repository resolution, route orchestration, and UI ownership are documented separately in `docs/DEPENDENCY_MAP.md` and `docs/DIRECTORY_STRUCTURE.md`.

### Database Groups

```
Control DB (global)
  ├── users
  ├── tenants
  ├── tenant_memberships
  ├── auth_identities
  ├── tenant_databases
  ├── usage_daily_summary
  └── global_audit_index

Tenant DB (per-tenant)
  ├── work_units
  ├── source_candidates
  ├── external_signals
  ├── action_previews
  ├── approval_records
  ├── execution_results
  ├── audit_logs
  ├── llm_processing_runs
  ├── integration_connections
  └── schema_migrations

Object Storage (R2)
  ├── raw source bodies
  ├── attachments
  ├── large LLM archives
  └── exports
```

---

## 2. Design Principles

1. **Structured data → D1.** All domain objects (WorkUnits, candidates, approvals, audit logs) live in D1 as structured rows.

2. **Large raw content → object storage.** Raw Slack bodies, email bodies, document text, attachments, and large LLM responses are stored in R2 or equivalent object storage. D1 stores only a reference (URL/object key) and a content hash.

3. **Tokens/secrets → encrypted external store.** OAuth tokens, API keys, and provider credentials are never stored in D1 in plaintext. They belong in an encrypted credential store (e.g., Cloudflare Workers KV with encryption at rest, or a dedicated secrets manager).

4. **Tenant isolation at storage level.** Every tenant has its own D1 database. Application code resolves the tenant DB via the control DB and connects directly — no cross-tenant joins at the query level.

5. **Migrations per tenant.** Each tenant DB tracks its own schema version in `schema_migrations`. Migrations are applied per-tenant and must be idempotent.

---

## 3. Control Database

### Purpose

The control database manages global identity and routing. It tracks which users belong to which tenants, and which D1 database serves each tenant's WorkUnit data.

### Tables

#### users

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

#### tenants

```sql
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### tenant_memberships

```sql
CREATE TABLE tenant_memberships (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('owner','manager','editor','viewer')),
  status      TEXT NOT NULL CHECK (status IN ('active','invited','suspended')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(tenant_id, user_id)
);
```

#### auth_identities

```sql
CREATE TABLE auth_identities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,
  provider_subject  TEXT NOT NULL,
  email             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(provider, provider_subject)
);
```

#### tenant_databases

```sql
CREATE TABLE tenant_databases (
  tenant_id        TEXT PRIMARY KEY REFERENCES tenants(id),
  database_name    TEXT NOT NULL UNIQUE,
  database_id      TEXT NOT NULL,
  schema_version   TEXT NOT NULL DEFAULT '1',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','migrating','failed')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### usage_daily_summary

```sql
CREATE TABLE usage_daily_summary (
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  date             TEXT NOT NULL,
  llm_requests     INTEGER NOT NULL DEFAULT 0,
  llm_tokens_in    INTEGER NOT NULL DEFAULT 0,
  llm_tokens_out   INTEGER NOT NULL DEFAULT 0,
  external_actions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, date)
);
```

#### global_audit_index

```sql
CREATE TABLE global_audit_index (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  event_kind  TEXT NOT NULL,
  actor_id    TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 4. Tenant Database

### Purpose

Each tenant database stores all WorkUnit domain objects, approvals, audit logs, LLM processing records, and integration metadata for a single tenant.

### Tables

#### WorkUnits

```sql
CREATE TABLE work_units (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  source_signal_id TEXT NOT NULL,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL,
  priority         TEXT NOT NULL,
  source_provider  TEXT NOT NULL,
  reason           TEXT NOT NULL,
  evidence         TEXT NOT NULL,
  next_action      TEXT NOT NULL DEFAULT '',
  source_url       TEXT,
  actor            TEXT,
  assignee         TEXT,
  repository       TEXT,
  due_at           TEXT,
  status           TEXT NOT NULL DEFAULT 'open',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Notes:

- Stable WorkUnit IDs are generated before persistence and reused for upsert.
- Repeated inbox fetches update the existing row rather than creating duplicates.
- Persistence writes sanitized WorkUnit fields only. Raw external payloads are not stored here.

#### Source Candidates

```sql
CREATE TABLE source_candidates (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  source_signal_ids TEXT NOT NULL DEFAULT '[]',      -- JSON array
  source_type      TEXT NOT NULL,
  extracted_summary TEXT NOT NULL DEFAULT '',
  detected_actors  TEXT NOT NULL DEFAULT '[]',       -- JSON array
  detected_problem TEXT,
  detected_deadline TEXT,
  detected_intent  TEXT,
  confidence       REAL NOT NULL DEFAULT 0.5,
  trust_level      TEXT NOT NULL DEFAULT 'sanitized_candidate',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### External Signals

```sql
CREATE TABLE external_signals (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  source_type      TEXT NOT NULL,
  source_ref       TEXT NOT NULL DEFAULT '{}',       -- JSON object
  received_at      TEXT NOT NULL DEFAULT (datetime('now')),
  trust_level      TEXT NOT NULL DEFAULT 'untrusted',
  raw_content_ref  TEXT,                              -- R2 object key
  metadata         TEXT NOT NULL DEFAULT '{}'         -- JSON object
);
```

#### Action Previews

```sql
CREATE TABLE action_previews (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES work_units(tenant_id),
  work_unit_id     TEXT NOT NULL REFERENCES work_units(id),
  action_type      TEXT NOT NULL CHECK (action_type IN ('internal_task','slack_reply','gmail_reply','github_issue','calendar_event')),
  target_preview   TEXT NOT NULL DEFAULT '{}',       -- JSON object
  payload_preview  TEXT NOT NULL DEFAULT '{}',       -- JSON object
  requires_approval INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'preview',
  target_hash      TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at       TEXT
);
```

#### Approval Records

Approval records are created from persisted `action_previews`. `target_hash` and `payload_hash` are copied from the stored preview, not accepted from the client. Execution-time approval verification reads these rows through the repository-backed `ApprovalStore` adapter and marks a valid approval `used` after the approved path is consumed.

```sql
CREATE TABLE approval_records (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  work_unit_id     TEXT NOT NULL,
  action_preview_id TEXT NOT NULL REFERENCES action_previews(id),
  action_type      TEXT NOT NULL,
  target_hash      TEXT NOT NULL,
  payload_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','used')),
  approved_by_user_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at      TEXT,
  expires_at       TEXT NOT NULL,
  used_at          TEXT
);
```

#### WorkUnit Feedback

```sql
CREATE TABLE workunit_feedback (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  work_unit_id TEXT NOT NULL REFERENCES work_units(id),
  feedback    TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Audit Logs

```sql
CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  event_kind  TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Integration Connections

```sql
CREATE TABLE integration_connections (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  provider     TEXT NOT NULL,
  status       TEXT NOT NULL,
  external_ref TEXT,
  scopes_json  TEXT NOT NULL DEFAULT '[]',
  connected_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  error_code   TEXT,
  error_detail TEXT
);
```

#### Usage Events

```sql
CREATE TABLE usage_events (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  actor_user_id TEXT,
  event_type    TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Execution Results

```sql
CREATE TABLE execution_results (
  id                 TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  work_unit_id       TEXT NOT NULL,
  execution_command_id TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('succeeded','failed','blocked','skipped')),
  provider           TEXT,
  provider_result_ref TEXT,
  safe_message       TEXT NOT NULL DEFAULT '',
  error_code         TEXT,
  executed_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Audit Logs

```sql
CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  event_kind  TEXT NOT NULL,
  actor_id    TEXT,
  request_id  TEXT,
  work_unit_id TEXT,
  operation   TEXT,
  target      TEXT,
  reason      TEXT,
  metadata    TEXT,                                   -- JSON object, never raw source content
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### LLM Processing Runs

```sql
CREATE TABLE llm_processing_runs (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  signal_id        TEXT,
  candidate_id     TEXT,
  work_unit_id     TEXT,
  stage            TEXT NOT NULL,
  provider         TEXT NOT NULL,
  model            TEXT NOT NULL,
  prompt_tokens    INTEGER,
  completion_tokens INTEGER,
  duration_ms      INTEGER,
  status           TEXT NOT NULL CHECK (status IN ('started','completed','failed','blocked')),
  error_code       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### Integration Connections

```sql
CREATE TABLE integration_connections (
  id               TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  provider         TEXT NOT NULL CHECK (provider IN ('slack','calendar','github','email','notion','jira','database')),
  status           TEXT NOT NULL,
  mode             TEXT NOT NULL DEFAULT 'fake',
  external_account_id TEXT,
  scopes_json      TEXT,                               -- JSON array
  config_json      TEXT NOT NULL DEFAULT '{}',         -- JSON object; NEVER stores plain tokens
  last_sync_at     TEXT,
  last_error_code  TEXT,
  last_error_message TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (tenant_id, provider)
);
```

#### Schema Migrations

```sql
CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
);
```

---

## 5. Object Storage Policy

Large or binary content must not be stored in D1.

| Content Type | Storage | D1 Column |
|-------------|---------|-----------|
| Raw Slack message body | R2 | `external_signals.raw_content_ref` |
| Raw email body | R2 | `external_signals.raw_content_ref` |
| Raw document text | R2 | `external_signals.raw_content_ref` |
| Attachments / files | R2 | separate object key table |
| LLM prompt archive | R2 | `llm_processing_runs` references only |
| Full LLM response | R2 | `llm_processing_runs` references only |
| Exports | R2 | generated on demand |

Content hashes should be stored in D1 alongside object references for integrity verification.

---

## 6. Token and Secret Policy

| Type | Storage | Notes |
|------|---------|-------|
| OAuth tokens | Encrypted credential store | Not in D1 |
| API keys | Encrypted credential store | Not in D1 |
| Provider credentials | Encrypted credential store | Not in D1 |
| JWT signing keys | Secrets manager | Not in D1 |
| Encryption keys | Secrets manager | Not in D1 |
| `integration_connections.config_json` | D1 | Provider settings only (default channel, calendar ID) — no tokens |

`integration_connections.config_json` stores provider-specific configuration (default channel, repository, calendar ID, sender address) but MUST NOT store tokens, API keys, or secrets.

---

## 7. Migration Strategy

### Design

- Every tenant database has a `schema_migrations` table.
- The control database has its own migrations (managed separately).
- Migrations are versioned and applied per-tenant.
- No destructive migration (DROP COLUMN, DROP TABLE) without explicit backup/export first.

### Migration Rules

1. **Idempotent:** each migration must be safe to re-run.
2. **Versioned:** migrations are numbered (`001`, `002`, `003`...).
3. **Per-tenant:** a migration runner applies pending migrations to each active tenant DB.
4. **Failed migration = isolate:** if a migration fails on one tenant DB, that tenant's database is flagged as `failed` in `tenant_databases`. Other tenants continue unaffected.
5. **Rollback:** not supported automatically. Rollback requires a forward-fix migration.
6. **No downtime:** D1 does not support online schema changes natively. Prefer additive changes (new columns, new tables).

### Example Migration Runner Flow

```
1. Read schema_version from control DB
2. For each active tenant DB:
   a. Read current version from tenant DB schema_migrations
   b. Apply pending migrations in order
   c. On success: insert into tenant DB schema_migrations, update tenant_databases
   d. On failure: set tenant_databases.status = 'failed', log error, continue to next tenant
```

---

## 8. D1 Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| 10GB per database | Large tenants may need archival | Archive old data to R2, use summary tables |
| No concurrent write scaling | Single writer | Acceptable for per-tenant isolation |
| No cross-database queries | Cannot join control+tenant DB | Application-level orchestration |
| SQLite semantics | No Postgres features | Compatible with current schema design |
| Row size limit (~1GB) | Giant rows impossible | Store large content in R2 |

---

## 9. Security and Privacy Benefits

### Tenant Database Isolation

- Each tenant's WorkUnit data is physically separate.
- A SQL injection in one tenant DB cannot read another tenant's data.
- Queries cannot accidentally join across tenants because the databases are separate.

### Reduced Blast Radius

- If a tenant DB is corrupted, only that tenant is affected.
- If a migration fails, only that tenant is blocked.
- Backup/restore can target a single tenant.

### Data Deletion / Export

- Deleting a tenant's data is a database-level operation.
- Exporting a tenant's data is a database dump.
- GDPR/CCPA compliance is simpler.

### Cross-Tenant Analytics

- Analytics across tenants requires explicit aggregation in the application layer.
- The global audit index in the control DB is intentionally minimal (no payload data).
- No single query can expose all tenants' WorkUnit content.

---

## 10. Operational Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| Many small databases | More D1 databases to manage. D1 is designed for this pattern. |
| Per-tenant migrations | Migration time scales with tenant count. Batch apply. |
| Tenant registry required | Control DB is a single point of routing. Keep it simple and cacheable. |
| No cross-tenant queries | Analytics requires application-level aggregation. Acceptable for privacy. |
