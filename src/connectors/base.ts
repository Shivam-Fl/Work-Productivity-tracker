import { IntegrationAccount, RawEvent } from '../types';

export interface ConnectorContext {
  account: IntegrationAccount;
  fromIso: string;
  toIso: string;
  cursor: string | null;
}

export interface IntegrationConnector {
  source: IntegrationAccount['source'];
  fetchEvents(context: ConnectorContext): Promise<{ events: RawEvent[]; nextCursor: string | null }>;
}
