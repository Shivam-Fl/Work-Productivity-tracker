import { SourceEvent } from '../types';

export function dedupeEvents(events: SourceEvent[]): SourceEvent[] {
  const seen = new Map<string, SourceEvent>();
  for (const event of events) {
    const existing = seen.get(event.fingerprint);
    if (!existing || event.confidence > existing.confidence) {
      seen.set(event.fingerprint, event);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
