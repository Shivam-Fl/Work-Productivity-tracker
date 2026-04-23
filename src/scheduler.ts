import cron from 'node-cron';
import { config } from './config';
import { logger } from './logger';
import { generateReportDraft, listAutoTriggerUsers } from './service';

export function startScheduler(): void {
  cron.schedule(config.shiftCron, async () => {
    const users = listAutoTriggerUsers();
    for (const user of users) {
      try {
        await generateReportDraft({ userId: user.id });
        logger.info({ userId: user.id }, 'Scheduled report generation completed');
      } catch (error) {
        logger.error({ userId: user.id, err: error }, 'Scheduled report generation failed');
      }
    }
  });
}
