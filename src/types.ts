export type IntegrationSource = 'github' | 'jira' | 'slack' | 'calendar' | 'meeting';

export interface User {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  autoTriggerEnabled: boolean;
}

export interface IntegrationAccount {
  id: string;
  userId: string;
  source: IntegrationSource;
  externalUserId: string | null;
  encryptedToken: string | null;
  status: 'connected' | 'disconnected' | 'error';
  updatedAt: string;
}

export interface RawEvent {
  source: IntegrationSource;
  externalId: string;
  actor: string;
  timestamp: string;
  project: string | null;
  eventType: string;
  title: string;
  details: string;
  url: string | null;
  participants: string[];
}

export interface SourceEvent extends RawEvent {
  id: string;
  normalizedType: EventCategory;
  confidence: number;
  provenance: string;
  fingerprint: string;
}

export type EventCategory =
  | 'code_change'
  | 'issue_movement'
  | 'communication'
  | 'meeting'
  | 'documentation'
  | 'approval'
  | 'deployment'
  | 'other';

export interface ReportDraft {
  id: string;
  userId: string;
  reportDate: string;
  version: number;
  status: 'DRAFT' | 'FINAL';
  summary: string;
  sections: Record<string, string[]>;
  timeline: SourceEvent[];
  manualPrompt: string;
  requiresUserInput: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  userId: string;
  reportId: string;
  entryType: 'Decision' | 'Change Log' | 'Meeting Outcome' | 'Problem/Solution' | 'Follow-up Action' | 'Note';
  title: string;
  content: string;
  confidence: number;
  sourceEventIds: string[];
  createdAt: string;
}
