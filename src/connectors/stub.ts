import { ConnectorContext, IntegrationConnector } from './base';

export class StubConnector implements IntegrationConnector {
  constructor(public source: IntegrationConnector['source']) {}

  async fetchEvents(_context: ConnectorContext): Promise<{ events: []; nextCursor: string | null }> {
    return { events: [], nextCursor: null };
  }
}
