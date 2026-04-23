import { db, cryptoRandomId, nextVersion, writeAudit } from './db';
import { getConnector } from './connectors';
import { dedupeEvents } from './pipeline/dedupe';
import { extractReportSections } from './pipeline/extract';
import { normalizeEvents } from './pipeline/normalize';
import { config } from './config';
import { makeIdempotencyKey, encryptSecret } from './security';
import { IntegrationAccount, IntegrationSource, KnowledgeEntry, ReportDraft, User } from './types';
import { toIsoNow } from './utils';

export function createUser(input: { email: string; displayName: string; timezone?: string; autoTriggerEnabled?: boolean }): User {
  const now = toIsoNow();
  const id = cryptoRandomId();
  db.prepare(
    `INSERT INTO users (id, email, display_name, timezone, auto_trigger_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.email, input.displayName, input.timezone ?? config.defaultTimezone, input.autoTriggerEnabled ? 1 : 0, now, now);

  return {
    id,
    email: input.email,
    displayName: input.displayName,
    timezone: input.timezone ?? config.defaultTimezone,
    autoTriggerEnabled: Boolean(input.autoTriggerEnabled)
  };
}

export function upsertIntegration(input: {
  userId: string;
  source: IntegrationSource;
  externalUserId?: string | null;
  token?: string | null;
  status?: 'connected' | 'disconnected' | 'error';
}): IntegrationAccount {
  const now = toIsoNow();
  const row = db
    .prepare('SELECT id FROM integration_accounts WHERE user_id = ? AND source = ?')
    .get(input.userId, input.source) as { id: string } | undefined;

  const encryptedToken = input.token ? encryptSecret(input.token) : null;

  if (row) {
    db.prepare(
      `UPDATE integration_accounts
       SET external_user_id = ?, encrypted_token = COALESCE(?, encrypted_token), status = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.externalUserId ?? null, encryptedToken, input.status ?? 'connected', now, row.id);
  } else {
    db.prepare(
      `INSERT INTO integration_accounts (id, user_id, source, external_user_id, encrypted_token, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(cryptoRandomId(), input.userId, input.source, input.externalUserId ?? null, encryptedToken, input.status ?? 'connected', now);
  }

  const account = db
    .prepare('SELECT * FROM integration_accounts WHERE user_id = ? AND source = ?')
    .get(input.userId, input.source) as any;

  return mapIntegration(account);
}

export function getIntegrationStatus(userId: string): IntegrationAccount[] {
  const rows = db.prepare('SELECT * FROM integration_accounts WHERE user_id = ? ORDER BY source').all(userId) as any[];
  return rows.map(mapIntegration);
}

export async function generateReportDraft(input: {
  userId: string;
  reportDate?: string;
  idempotencyKey?: string;
}): Promise<ReportDraft> {
  const reportDate = input.reportDate ?? new Date().toISOString().slice(0, 10);
  const idempotencyKey = input.idempotencyKey ?? makeIdempotencyKey(input.userId, reportDate);

  const jobKeyExists = db
    .prepare('SELECT id FROM aggregation_jobs WHERE user_id = ? AND report_date = ? AND idempotency_key = ?')
    .get(input.userId, reportDate, idempotencyKey) as { id: string } | undefined;

  if (jobKeyExists) {
    const latest = getLatestReportForDate(input.userId, reportDate);
    if (latest) return latest;
  }

  const jobId = cryptoRandomId();
  const now = toIsoNow();
  db.prepare(
    `INSERT INTO aggregation_jobs (id, user_id, report_date, idempotency_key, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', NULL, ?, ?)`
  ).run(jobId, input.userId, reportDate, idempotencyKey, now, now);

  try {
    const [fromIso, toIso] = dayWindow(reportDate);
    const integrations = getIntegrationStatus(input.userId).filter((i) => i.status === 'connected');

    const allRawEvents: any[] = [];
    for (const account of integrations) {
      const cursor = db
        .prepare('SELECT cursor_value FROM sync_cursors WHERE user_id = ? AND source = ?')
        .get(input.userId, account.source) as { cursor_value: string | null } | undefined;
      const connector = getConnector(account.source);
      try {
        const fetched = await connector.fetchEvents({ account, fromIso, toIso, cursor: cursor?.cursor_value ?? null });
        allRawEvents.push(...fetched.events);
        const existingCursor = db
          .prepare('SELECT id FROM sync_cursors WHERE user_id = ? AND source = ?')
          .get(input.userId, account.source) as { id: string } | undefined;
        if (existingCursor) {
          db.prepare('UPDATE sync_cursors SET cursor_value = ?, updated_at = ? WHERE id = ?').run(
            fetched.nextCursor,
            toIsoNow(),
            existingCursor.id
          );
        } else {
          db.prepare('INSERT INTO sync_cursors (id, user_id, source, cursor_value, updated_at) VALUES (?, ?, ?, ?, ?)').run(
            cryptoRandomId(),
            input.userId,
            account.source,
            fetched.nextCursor,
            toIsoNow()
          );
        }
      } catch (error) {
        writeAudit(input.userId, 'connector_error', {
          source: account.source,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const normalized = normalizeEvents(allRawEvents);
    const timeline = dedupeEvents(normalized);
    const extraction = extractReportSections(timeline);

    const version = nextVersion(input.userId, reportDate);
    const reportId = cryptoRandomId();

    db.prepare(
      `INSERT INTO daily_reports (id, user_id, report_date, version, status, summary, sections_json, timeline_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`
    ).run(
      reportId,
      input.userId,
      reportDate,
      version,
      extraction.summary,
      JSON.stringify(extraction.sections),
      JSON.stringify(timeline),
      now,
      now
    );

    const insertSource = db.prepare(
      `INSERT INTO source_events (
        id, user_id, report_date, source, external_id, actor, timestamp, project, event_type, normalized_type,
        title, details, url, participants_json, confidence, provenance, fingerprint, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const event of timeline) {
      insertSource.run(
        event.id,
        input.userId,
        reportDate,
        event.source,
        event.externalId,
        event.actor,
        event.timestamp,
        event.project,
        event.eventType,
        event.normalizedType,
        event.title,
        event.details,
        event.url,
        JSON.stringify(event.participants),
        event.confidence,
        event.provenance,
        event.fingerprint,
        now
      );
    }

    persistKnowledgeEntries({ userId: input.userId, reportId, sections: extraction.sections, timeline });

    db.prepare('UPDATE aggregation_jobs SET status = ?, updated_at = ? WHERE id = ?').run('completed', toIsoNow(), jobId);
    writeAudit(input.userId, 'report_generated', { reportId, reportDate, version, eventCount: timeline.length });

    return getReportById(reportId)!;
  } catch (error) {
    db.prepare('UPDATE aggregation_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(
      'failed',
      error instanceof Error ? error.message : String(error),
      toIsoNow(),
      jobId
    );
    throw error;
  }
}

export function addReportFeedback(reportId: string, userId: string, content: string): void {
  db.prepare('INSERT INTO feedback_entries (id, report_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    cryptoRandomId(),
    reportId,
    userId,
    content,
    toIsoNow()
  );
  writeAudit(userId, 'report_feedback_added', { reportId });
}

export function finalizeReport(reportId: string, userId: string): ReportDraft {
  const report = getReportById(reportId);
  if (!report) throw new Error('Report not found');

  const feedbackRows = db
    .prepare('SELECT content FROM feedback_entries WHERE report_id = ? ORDER BY created_at')
    .all(reportId) as Array<{ content: string }>;

  const sections = { ...report.sections };
  if (feedbackRows.length > 0) {
    sections.manualAdditions = feedbackRows.map((f) => f.content);

    const feedbackEntryStmt = db.prepare(
      `INSERT INTO knowledge_entries (id, user_id, report_id, entry_type, title, content, confidence, source_event_ids_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const fb of feedbackRows) {
      feedbackEntryStmt.run(
        cryptoRandomId(),
        userId,
        reportId,
        'Note',
        'Manual user addition',
        fb.content,
        1,
        JSON.stringify([]),
        toIsoNow()
      );
    }
  }

  db.prepare('UPDATE daily_reports SET status = ?, sections_json = ?, updated_at = ? WHERE id = ?').run(
    'FINAL',
    JSON.stringify(sections),
    toIsoNow(),
    reportId
  );

  writeAudit(userId, 'report_finalized', { reportId });
  return getReportById(reportId)!;
}

export function getReportById(reportId: string): ReportDraft | null {
  const row = db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(reportId) as any;
  return row ? mapReport(row) : null;
}

export function getLatestReportForDate(userId: string, reportDate: string): ReportDraft | null {
  const row = db
    .prepare('SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ? ORDER BY version DESC LIMIT 1')
    .get(userId, reportDate) as any;
  return row ? mapReport(row) : null;
}

export function searchKnowledge(userId: string, query: string, limit = 25): KnowledgeEntry[] {
  const rows = db
    .prepare(
      `SELECT * FROM knowledge_entries
       WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, `%${query}%`, `%${query}%`, limit) as any[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    reportId: row.report_id,
    entryType: row.entry_type,
    title: row.title,
    content: row.content,
    confidence: row.confidence,
    sourceEventIds: JSON.parse(row.source_event_ids_json),
    createdAt: row.created_at
  }));
}

export function listAutoTriggerUsers(): User[] {
  const rows = db.prepare('SELECT * FROM users WHERE auto_trigger_enabled = 1').all() as any[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    autoTriggerEnabled: Boolean(row.auto_trigger_enabled)
  }));
}

function persistKnowledgeEntries(input: {
  userId: string;
  reportId: string;
  sections: Record<string, string[]>;
  timeline: Array<{ id: string }>;
}): void {
  const stmt = db.prepare(
    `INSERT INTO knowledge_entries (id, user_id, report_id, entry_type, title, content, confidence, source_event_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const mappings: Array<{ key: string; type: KnowledgeEntry['entryType']; titlePrefix: string; confidence: number }> = [
    { key: 'decisions', type: 'Decision', titlePrefix: 'Decision', confidence: 0.85 },
    { key: 'keyChanges', type: 'Change Log', titlePrefix: 'Key change', confidence: 0.9 },
    { key: 'blockers', type: 'Problem/Solution', titlePrefix: 'Blocker', confidence: 0.8 },
    { key: 'notableWork', type: 'Meeting Outcome', titlePrefix: 'Notable work', confidence: 0.75 }
  ];

  const eventIds = input.timeline.map((x) => x.id);
  for (const mapping of mappings) {
    const lines = input.sections[mapping.key] ?? [];
    lines.forEach((line, index) => {
      stmt.run(
        cryptoRandomId(),
        input.userId,
        input.reportId,
        mapping.type,
        `${mapping.titlePrefix} ${index + 1}`,
        line,
        mapping.confidence,
        JSON.stringify(eventIds.slice(0, 20)),
        toIsoNow()
      );
    });
  }
}

function dayWindow(reportDate: string): [string, string] {
  return [`${reportDate}T00:00:00.000Z`, `${reportDate}T23:59:59.999Z`];
}

function mapIntegration(row: any): IntegrationAccount {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    externalUserId: row.external_user_id,
    encryptedToken: row.encrypted_token,
    status: row.status,
    updatedAt: row.updated_at
  };
}

function mapReport(row: any): ReportDraft {
  return {
    id: row.id,
    userId: row.user_id,
    reportDate: row.report_date,
    version: row.version,
    status: row.status,
    summary: row.summary,
    sections: JSON.parse(row.sections_json),
    timeline: JSON.parse(row.timeline_json),
    manualPrompt: "Anything missing or untracked from today that you want to add?",
    requiresUserInput: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
