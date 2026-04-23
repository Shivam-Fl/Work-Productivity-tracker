import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { startScheduler } from './scheduler';

const app = createApp();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Work Productivity Tracker API started');
});

startScheduler();
