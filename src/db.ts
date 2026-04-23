import Database from 'better-sqlite3';
import { config } from './config';
import { toIsoNow } from './utils';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  auto_trigger_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_user_id TEXT,
  encrypted_token TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, source),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS source_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  project TEXT,
  event_type TEXT NOT NULL,
  normalized_type TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  url TEXT,
  participants_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  provenance TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aggregation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, report_date, idempotency_key)
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  timeline_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_entries (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_event_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, source)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

export function nextVersion(userId: string, reportDate: string): number {
  const row = db
    .prepare('SELECT MAX(version) AS max_version FROM daily_reports WHERE user_id = ? AND report_date = ?')
    .get(userId, reportDate) as { max_version: number | null };
  return (row?.max_version ?? 0) + 1;
}

export function writeAudit(userId: string | null, eventType: string, payload: unknown): void {
  db.prepare(
    'INSERT INTO audit_events (id, user_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(cryptoRandomId(), userId, eventType, JSON.stringify(payload), toIsoNow());
}

export function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
