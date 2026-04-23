import { IntegrationSource } from '../types';
import { IntegrationConnector } from './base';
import { GitHubConnector } from './github';
import { StubConnector } from './stub';

const connectors: Record<IntegrationSource, IntegrationConnector> = {
  github: new GitHubConnector(),
  jira: new StubConnector('jira'),
  slack: new StubConnector('slack'),
  calendar: new StubConnector('calendar'),
  meeting: new StubConnector('meeting')
};

export function getConnector(source: IntegrationSource): IntegrationConnector {
  return connectors[source];
}
