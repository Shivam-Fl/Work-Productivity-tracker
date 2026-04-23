import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvents } from '../src/pipeline/normalize';
import { dedupeEvents } from '../src/pipeline/dedupe';
import { extractReportSections } from '../src/pipeline/extract';

test('normalize + dedupe + extract pipeline works', () => {
  const raw = [
    {
      source: 'github' as const,
      externalId: '1',
      actor: 'alice',
      timestamp: '2026-01-01T10:00:00.000Z',
      project: 'org/repo',
      eventType: 'commit',
      title: 'Add API endpoint',
      details: 'Implemented report API',
      url: 'https://github.com/org/repo/commit/1',
      participants: ['alice']
    },
    {
      source: 'github' as const,
      externalId: '1',
      actor: 'alice',
      timestamp: '2026-01-01T10:00:00.000Z',
      project: 'org/repo',
      eventType: 'commit',
      title: 'Add API endpoint',
      details: 'Implemented report API',
      url: 'https://github.com/org/repo/commit/1',
      participants: ['alice']
    }
  ];

  const normalized = normalizeEvents(raw);
  const unique = dedupeEvents(normalized);
  const extracted = extractReportSections(unique);

  assert.equal(normalized.length, 2);
  assert.equal(unique.length, 1);
  assert.equal(extracted.sections.keyChanges.length, 1);
  assert.match(extracted.summary, /Processed 1 tracked activities/i);
});
