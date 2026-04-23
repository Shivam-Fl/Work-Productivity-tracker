import { config } from '../config';
import { decryptSecret } from '../security';
import { fetchWithRetry } from '../utils';
import { ConnectorContext, IntegrationConnector } from './base';

interface GitHubEvent {
  id: string;
  type: string;
  repo?: { name?: string };
  created_at: string;
  actor?: { login?: string };
  payload?: { action?: string; pull_request?: { html_url?: string; title?: string }; ref?: string; commits?: Array<{ message?: string }> };
}

export class GitHubConnector implements IntegrationConnector {
  source: IntegrationConnector['source'] = 'github';

  async fetchEvents(context: ConnectorContext): Promise<{ events: any[]; nextCursor: string | null }> {
    if (!context.account.encryptedToken) return { events: [], nextCursor: context.cursor };
    const token = decryptSecret(context.account.encryptedToken);
    const username = context.account.externalUserId;

    const endpoint = username
      ? `${config.githubApiBaseUrl}/users/${encodeURIComponent(username)}/events?per_page=100`
      : `${config.githubApiBaseUrl}/user/events?per_page=100`;

    const response = await fetchWithRetry(
      endpoint,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'work-productivity-tracker'
        }
      },
      config.maxRetries
    );

    if (!response.ok) {
      throw new Error(`GitHub API failed with status ${response.status}`);
    }

    const data = (await response.json()) as GitHubEvent[];
    const fromTs = Date.parse(context.fromIso);
    const toTs = Date.parse(context.toIso);

    const mapped = data
      .filter((item) => {
        const ts = Date.parse(item.created_at);
        return ts >= fromTs && ts <= toTs;
      })
      .map((item) => {
        const pr = item.payload?.pull_request;
        return {
          source: 'github' as const,
          externalId: item.id,
          actor: item.actor?.login ?? username ?? 'github-user',
          timestamp: item.created_at,
          project: item.repo?.name ?? null,
          eventType: normalizeGitHubType(item.type, item.payload?.action),
          title: pr?.title ?? item.type,
          details: item.payload?.commits?.map((c) => c.message).filter(Boolean).join(' | ') ?? item.payload?.ref ?? 'GitHub activity',
          url: pr?.html_url ?? (item.repo?.name ? `https://github.com/${item.repo.name}` : null),
          participants: item.actor?.login ? [item.actor.login] : []
        };
      });

    const nextCursor = mapped.length > 0 ? mapped[mapped.length - 1].timestamp : context.cursor;
    return { events: mapped, nextCursor };
  }
}

function normalizeGitHubType(type: string, action?: string): string {
  const lower = type.toLowerCase();
  if (lower.includes('push')) return 'commit';
  if (lower.includes('pullrequest') || lower.includes('pull_request')) {
    if (action === 'closed' || action === 'merged') return 'pull_request';
    return 'pull_request';
  }
  if (lower.includes('issues')) return 'issue_transition';
  if (lower.includes('pullrequestreview') || lower.includes('review')) return 'pr_review';
  return 'message';
}
