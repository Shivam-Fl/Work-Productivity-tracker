# Work Productivity Tracker

Production-oriented Daily Work Tracker + Personal Knowledge Base API.

## Features

- End-of-shift report generation across connected tools (GitHub now, Jira/Slack/Calendar/Meeting connectors scaffolded)
- Pipeline: ingest -> normalize -> dedupe -> timeline -> extract decisions/changes/blockers/notable work
- Manual feedback capture for untracked work before finalization
- Knowledge base entry creation and search
- Idempotent daily report generation with versioning
- Scheduled auto-trigger support
- Encrypted integration token storage
- Dockerized deployment

## Tech Stack

- Node.js + TypeScript + Express
- SQLite (`better-sqlite3`) persistence
- `node-cron` scheduler
- `pino` structured logging
- `zod` request validation

## Quickstart

```bash
npm install
npm run dev
```

API starts on `http://localhost:3000`.

## Environment Variables

- `PORT` (default `3000`)
- `DB_PATH` (default `./work-tracker.db`)
- `DEFAULT_TIMEZONE` (default `UTC`)
- `TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key; strongly recommended in production)
- `SHIFT_CRON` (default `0 18 * * 1-5`)
- `MAX_RETRIES` (default `3`)
- `GITHUB_API_BASE_URL` (default `https://api.github.com`)

## Core APIs

### 1) Create User

`POST /api/users`

```json
{
  "email": "dev@example.com",
  "displayName": "Dev User",
  "timezone": "UTC",
  "autoTriggerEnabled": false
}
```

### 2) Connect Integration

`POST /api/integrations/connect`

```json
{
  "userId": "<userId>",
  "source": "github",
  "externalUserId": "github-username",
  "token": "github_pat_xxx",
  "status": "connected"
}
```

### 3) Trigger Report Draft

`POST /api/reports/trigger`

```json
{
  "userId": "<userId>",
  "reportDate": "2026-04-23"
}
```

### 4) Add Manual Feedback

`POST /api/reports/:reportId/feedback`

```json
{
  "userId": "<userId>",
  "content": "Handled incident triage not captured in integrations"
}
```

### 5) Finalize Report

`POST /api/reports/:reportId/finalize`

```json
{
  "userId": "<userId>"
}
```

### 6) Search Knowledge Base

`GET /api/kb/search?userId=<userId>&q=incident`

## Deployment

### Local Docker

```bash
docker compose up --build
```

### Production Notes

- Use managed Postgres/object store/search index if scaling beyond single-node SQLite.
- Use secure key management for `TOKEN_ENCRYPTION_KEY`.
- Add SSO/OAuth provider flows and RBAC middleware for multi-tenant deployment.
- Add provider webhooks for near-real-time ingestion.

## Quality Checks

```bash
npm run lint
npm run build
npm test
```
