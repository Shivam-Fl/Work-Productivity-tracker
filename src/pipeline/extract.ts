import { SourceEvent } from '../types';

export interface ExtractedSections {
  summary: string;
  sections: Record<string, string[]>;
}

export function extractReportSections(events: SourceEvent[]): ExtractedSections {
  const keyChanges: string[] = [];
  const decisions: string[] = [];
  const blockers: string[] = [];
  const notableWork: string[] = [];

  for (const event of events) {
    const line = `${event.title}${event.url ? ` (${event.url})` : ''}`;
    if (event.normalizedType === 'code_change' || event.normalizedType === 'issue_movement') {
      keyChanges.push(line);
    }
    const text = `${event.title} ${event.details}`.toLowerCase();
    if (text.includes('decision') || text.includes('decided') || text.includes('agreed')) {
      decisions.push(line);
    }
    if (text.includes('blocked') || text.includes('blocker') || text.includes('dependency waiting')) {
      blockers.push(line);
    }
    if (event.normalizedType !== 'other') {
      notableWork.push(line);
    }
  }

  const summary =
    events.length === 0
      ? 'No tracked activity was detected for the selected shift. You can add manual updates before finalizing.'
      : `Processed ${events.length} tracked activities across ${new Set(events.map((e) => e.source)).size} connected systems.`;

  return {
    summary,
    sections: {
      keyChanges: dedupeLines(keyChanges).slice(0, 20),
      decisions: dedupeLines(decisions).slice(0, 20),
      blockers: dedupeLines(blockers).slice(0, 20),
      notableWork: dedupeLines(notableWork).slice(0, 40)
    }
  };
}

function dedupeLines(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}
