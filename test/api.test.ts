import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

test('full report lifecycle with manual feedback', async () => {
  const createUser = await request(app).post('/api/users').send({
    email: `user-${Date.now()}@example.com`,
    displayName: 'Test User',
    timezone: 'UTC'
  });

  assert.equal(createUser.status, 201);
  const userId = createUser.body.id;

  const connect = await request(app).post('/api/integrations/connect').send({
    userId,
    source: 'github',
    status: 'connected'
  });
  assert.equal(connect.status, 201);

  const trigger = await request(app).post('/api/reports/trigger').send({ userId, reportDate: '2026-01-01' });
  assert.equal(trigger.status, 201);
  assert.equal(trigger.body.status, 'DRAFT');

  const reportId = trigger.body.id;

  const feedback = await request(app)
    .post(`/api/reports/${reportId}/feedback`)
    .send({ userId, content: 'Helped teammate with production issue not captured in tools.' });
  assert.equal(feedback.status, 201);

  const finalized = await request(app).post(`/api/reports/${reportId}/finalize`).send({ userId });
  assert.equal(finalized.status, 200);
  assert.equal(finalized.body.status, 'FINAL');
  assert.ok(Array.isArray(finalized.body.sections.manualAdditions));
});
