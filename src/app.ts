import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import {
  addReportFeedback,
  createUser,
  finalizeReport,
  generateReportDraft,
  getIntegrationStatus,
  getReportById,
  searchKnowledge,
  upsertIntegration
} from './service';
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  timezone: z.string().optional(),
  autoTriggerEnabled: z.boolean().optional()
});

const integrationSchema = z.object({
  userId: z.string().min(1),
  source: z.enum(['github', 'jira', 'slack', 'calendar', 'meeting']),
  externalUserId: z.string().optional(),
  token: z.string().optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional()
});

const triggerSchema = z.object({
  userId: z.string().min(1),
  reportDate: z.string().optional(),
  idempotencyKey: z.string().optional()
});

const feedbackSchema = z.object({
  userId: z.string().min(1),
  content: z.string().min(1)
});

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/users', (req, res) => {
    const parsed = userSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const user = createUser(parsed.data);
    return res.status(201).json(user);
  });

  app.post('/api/integrations/connect', (req, res) => {
    const parsed = integrationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const account = upsertIntegration(parsed.data);
    return res.status(201).json({ ...account, encryptedToken: undefined });
  });

  app.get('/api/integrations/status/:userId', (req, res) => {
    const accounts = getIntegrationStatus(req.params.userId).map((a) => ({
      id: a.id,
      userId: a.userId,
      source: a.source,
      externalUserId: a.externalUserId,
      status: a.status,
      updatedAt: a.updatedAt
    }));
    return res.json({ accounts });
  });

  app.post('/api/reports/trigger', async (req, res) => {
    const parsed = triggerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const report = await generateReportDraft(parsed.data);
    return res.status(201).json(report);
  });

  app.get('/api/reports/:reportId', (req, res) => {
    const report = getReportById(req.params.reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    return res.json(report);
  });

  app.post('/api/reports/:reportId/feedback', (req, res) => {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    addReportFeedback(req.params.reportId, parsed.data.userId, parsed.data.content);
    return res.status(201).json({ ok: true });
  });

  app.post('/api/reports/:reportId/finalize', (req, res) => {
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const report = finalizeReport(req.params.reportId, parsed.data.userId);
    return res.json(report);
  });

  app.get('/api/kb/search', (req, res) => {
    const userId = String(req.query.userId ?? '');
    const q = String(req.query.q ?? '');
    if (!userId || !q) return res.status(400).json({ error: 'userId and q are required' });
    const entries = searchKnowledge(userId, q);
    return res.json({ entries });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
