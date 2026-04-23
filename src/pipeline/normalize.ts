import crypto from 'crypto';
import { EventCategory, RawEvent, SourceEvent } from '../types';

const categoryRules: Record<string, EventCategory> = {
  commit: 'code_change',
  pull_request: 'code_change',
  pr_review: 'approval',
  issue_transition: 'issue_movement',
  jira_status_change: 'issue_movement',
  message: 'communication',
  meeting: 'meeting',
  doc_edit: 'documentation',
  deploy: 'deployment'
};

export function normalizeEvents(rawEvents: RawEvent[]): SourceEvent[] {
  return rawEvents.map((event) => {
    const normalizedType = categoryRules[event.eventType] ?? inferCategory(event);
    const confidence = normalizedType === 'other' ? 0.5 : 0.9;
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${event.source}|${event.externalId}|${event.timestamp}|${event.title}`)
      .digest('hex');

    return {
      id: crypto.randomUUID(),
      ...event,
      normalizedType,
      confidence,
      provenance: `${event.source}:${event.externalId}`,
      fingerprint
    };
  });
}

function inferCategory(event: RawEvent): EventCategory {
  const text = `${event.eventType} ${event.title} ${event.details}`.toLowerCase();
  if (text.includes('deploy')) return 'deployment';
  if (text.includes('meeting') || text.includes('calendar')) return 'meeting';
  if (text.includes('doc')) return 'documentation';
  if (text.includes('jira') || text.includes('ticket') || text.includes('issue')) return 'issue_movement';
  if (text.includes('slack') || text.includes('message') || text.includes('chat')) return 'communication';
  if (text.includes('review') || text.includes('approve')) return 'approval';
  if (text.includes('commit') || text.includes('pull request') || text.includes('pr')) return 'code_change';
  return 'other';
}
